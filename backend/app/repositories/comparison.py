"""Period-over-period comparison helpers (Tier 2 — Feature 1).

The shape every Tier 2 endpoint follows:

    def get_overview(days=30, compare_to=None):
        until = now()
        since = until - days
        cur, prior = with_comparison(loader, since, until, compare_to)
        return build_response(cur, prior)

`resolve_compare_window` translates the wire-format `compare_to` parameter
into a concrete `(since, until)` tuple. Accepted forms:

* ``prev_period`` — the same-length window immediately before the current one.
* ``prev_year`` — the same window shifted back 365 days.
* ``mtd_vs_last_mtd`` — current month-to-date vs same days-into-month of the
  previous calendar month. The current window is overridden to start at the
  first of the month containing ``until``.
* ``ytd_vs_last_ytd`` — current year-to-date vs same days-into-year of the
  previous calendar year.
* ``YYYY-MM-DD,YYYY-MM-DD`` — explicit prior-period range.

For ``mtd_vs_last_mtd`` / ``ytd_vs_last_ytd`` the caller's current window is
*replaced* with the calendar-aligned window — these presets ignore the
caller's ``days`` argument because the whole point is calendar alignment.
``with_comparison`` therefore re-runs the loader for *both* windows when one
of these calendar presets is set.

`with_comparison` runs the same loader for both windows so callers don't have
to duplicate query logic.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import TypeVar

T = TypeVar("T")

# Matches the custom range form ("2026-04-01,2026-04-30") accepted alongside
# the keyword forms. The router-level Query(...) pattern already validates this
# at the HTTP boundary, but we re-parse here so the helper is usable from jobs
# or scripts that don't go through FastAPI validation.
_CUSTOM_RANGE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$")

#: Regex usable as Query(..., pattern=COMPARE_TO_PATTERN) on FastAPI routes.
COMPARE_TO_PATTERN = (
    r"^(prev_period|prev_year|mtd_vs_last_mtd|ytd_vs_last_ytd"
    r"|\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2})$"
)

#: Calendar-aligned presets — `resolve_calendar_window` knows how to translate
#: these into a (current, prior) pair given just `until`. They override the
#: caller's `(since, until)` because the whole point is calendar alignment.
_CALENDAR_PRESETS = {"mtd_vs_last_mtd", "ytd_vs_last_ytd"}


def is_calendar_preset(compare_to: str | None) -> bool:
    """True when `compare_to` overrides the caller's current window."""
    return compare_to in _CALENDAR_PRESETS


def _first_of_month(d: datetime) -> datetime:
    return d.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _first_of_year(d: datetime) -> datetime:
    return d.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)


def _shift_months(d: datetime, months: int) -> datetime:
    """Return d shifted by `months` months, clamping day-of-month if needed.

    Naive day-of-month preservation works for MTD (the FE passes a `since` at
    the first of the month, so day=1 always exists in the target month).
    For day > 28 we clamp to the last day of the target month to keep things
    sane if anyone ever calls this with a mid-month datetime.
    """
    month_index = d.month - 1 + months
    target_year = d.year + month_index // 12
    target_month = month_index % 12 + 1
    # Last day of target month — fixed enough for MTD's first-of-month case
    # and for the clamped mid-month edge case.
    if target_month == 12:
        next_month = d.replace(year=target_year + 1, month=1, day=1)
    else:
        next_month = d.replace(year=target_year, month=target_month + 1, day=1)
    last_day = (next_month - timedelta(days=1)).day
    return d.replace(year=target_year, month=target_month, day=min(d.day, last_day))


def resolve_calendar_window(
    preset: str, until: datetime,
) -> tuple[tuple[datetime, datetime], tuple[datetime, datetime]]:
    """Return (current_window, prior_window) for a calendar preset.

    `mtd_vs_last_mtd`: current = (first_of_month(until), until);
                        prior = same days-into-month of the previous month.
    `ytd_vs_last_ytd`: current = (first_of_year(until), until);
                        prior = same days-into-year of the previous year.
    """
    if preset == "mtd_vs_last_mtd":
        cur_since = _first_of_month(until)
        days_in = (until - cur_since).days
        prior_since = _shift_months(cur_since, -1)
        prior_until = prior_since + timedelta(
            days=days_in,
            seconds=until.hour * 3600 + until.minute * 60 + until.second,
        )
        return (cur_since, until), (prior_since, prior_until)

    if preset == "ytd_vs_last_ytd":
        cur_since = _first_of_year(until)
        days_in = (until - cur_since).days
        prior_since = cur_since.replace(year=cur_since.year - 1)
        prior_until = prior_since + timedelta(
            days=days_in,
            seconds=until.hour * 3600 + until.minute * 60 + until.second,
        )
        return (cur_since, until), (prior_since, prior_until)

    raise ValueError(f"Unknown calendar preset: {preset!r}")


def resolve_current_window(
    compare_to: str | None,
    default_since: datetime,
    default_until: datetime,
) -> tuple[datetime, datetime]:
    """Return the *current* window to use given `compare_to`.

    For calendar presets the caller's `(default_since, default_until)` is
    overridden by the preset's calendar-aligned window. Other presets
    (`prev_period`, `prev_year`, custom range, or None) leave it untouched.
    """
    if compare_to in _CALENDAR_PRESETS:
        cur, _ = resolve_calendar_window(compare_to, default_until)
        return cur
    return (default_since, default_until)


def resolve_compare_window(
    compare_to: str | None,
    since: datetime,
    until: datetime,
) -> tuple[datetime, datetime] | None:
    """Translate `compare_to` + current window into the comparison window.

    Returns None when no comparison is requested. Raises ValueError if the
    custom-range form fails to parse — routes should rely on the Query(pattern)
    validation to reject malformed values before reaching here.
    """
    if compare_to is None or compare_to == "":
        return None

    length = until - since

    if compare_to == "prev_period":
        return (since - length, since)

    if compare_to == "prev_year":
        return (since - timedelta(days=365), until - timedelta(days=365))

    if compare_to in _CALENDAR_PRESETS:
        _, prior = resolve_calendar_window(compare_to, until)
        return prior

    match = _CUSTOM_RANGE_RE.match(compare_to)
    if not match:
        raise ValueError(f"Invalid compare_to value: {compare_to!r}")

    a_str, b_str = match.group(1), match.group(2)
    a = datetime.fromisoformat(a_str)
    b = datetime.fromisoformat(b_str)
    if b < a:
        a, b = b, a
    return (a, b)


def with_comparison(
    loader: Callable[[datetime, datetime], T],
    since: datetime,
    until: datetime,
    compare_to: str | None,
) -> tuple[T, T | None]:
    """Run `loader(since, until)` and optionally a second call for comparison.

    The loader is expected to be a closure over the repo + client + user_id
    that takes only the (since, until) pair so callers don't have to pass the
    same parameters twice.
    """
    current = loader(since, until)
    prior: T | None = None
    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior = loader(*win)
    return current, prior
