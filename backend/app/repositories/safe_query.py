"""Helpers for running ClickHouse queries that might hit missing tables / columns.

Tier 2 introduced several new tables (`post_hashtags`, `instagram_comments`,
`comment_sentiment`, `comment_topics`, `competitor_handles`,
`competitor_snapshots`) plus column-add migrations (014, 015). If the user's
ClickHouse hasn't had every migration applied yet, an endpoint that reads from
a missing table would 500 the whole request.

These helpers swallow exactly the "schema not there yet" failures — *not*
network errors, type errors, or anything else — and return empty results so
the route can still respond with a usable empty-state payload.
"""

from __future__ import annotations

import logging
import re
import threading
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Substrings ClickHouse uses in error messages when a table or column doesn't
# exist. We match on these so we only swallow schema-shape problems — a syntax
# error or auth failure still raises so we can fix the real bug.
_SCHEMA_MISSING_MARKERS: tuple[str, ...] = (
    "doesn't exist",        # tables (e.g. "Table xxx doesn't exist")
    "unknown table",
    "unknown identifier",   # columns (e.g. "Unknown identifier: xxx")
    "no such column",
    "code: 60",             # ClickHouse: UNKNOWN_TABLE
    "code: 47",             # ClickHouse: UNKNOWN_IDENTIFIER
    "code: 36",             # ClickHouse: BAD_ARGUMENTS — sometimes seen on missing cols
)

# Per-process dedupe set so a busy endpoint doesn't spam the log file with
# the same "table missing" warning on every request. After the first warning
# under a given label, subsequent fallbacks log at DEBUG instead.
_warned_keys: set[str] = set()
_warned_lock = threading.Lock()

# Pulls out the table or identifier the server complained about so dedupe is
# fine-grained (different missing tables under the same label still log once
# each).
_IDENT_RE = re.compile(r"identifier '([^']+)'", re.IGNORECASE)
_TABLE_RE = re.compile(r"table ['`]?([\w.]+)['`]? doesn'?t exist", re.IGNORECASE)


def _signature_for(exc: BaseException) -> str:
    """Best-effort identifier extracted from the exception message.

    Used as part of the dedupe key so e.g. a missing `competitor_handles` and
    a missing `competitor_snapshots` each get one warning, not zero or one
    combined.
    """
    msg = str(exc)
    m = _IDENT_RE.search(msg) or _TABLE_RE.search(msg)
    return m.group(1) if m else "schema"


def is_schema_missing(exc: BaseException) -> bool:
    """Return True if the exception looks like a missing-table or missing-column error.

    Matches on substrings in the exception message rather than on exception
    type because clickhouse-connect wraps server errors in
    `DatabaseError` / `ClickHouseError` without a structured code we can switch on.
    """
    msg = str(exc).lower()
    return any(marker in msg for marker in _SCHEMA_MISSING_MARKERS)


def log_schema_missing(label: str, exc: BaseException, suffix: str = "") -> None:
    """Log a schema-missing warning, deduped per (label, identifier) within the process.

    The first time a (label, identifier) pair fires, log at WARNING with a
    short one-line summary (just `label`, the missing table/column name, and
    the action taken). Subsequent occurrences drop to DEBUG. The full
    exception is also logged at DEBUG so it's still inspectable in verbose
    log configs.

    Run migrations once and the WARNING lines stop firing.
    """
    identifier = _signature_for(exc)
    key = f"{label}::{identifier}"
    with _warned_lock:
        first_time = key not in _warned_keys
        if first_time:
            _warned_keys.add(key)

    action = suffix or "returning fallback"
    if first_time:
        logger.warning(
            "%s: schema not migrated yet [missing: %s] — %s",
            label, identifier, action,
        )
        logger.debug("%s: full exception detail — %s", label, exc)
    else:
        logger.debug("%s: schema still missing [%s] (deduped)", label, identifier)


def reset_warning_dedupe() -> None:
    """Clear the dedupe set. Test-only helper."""
    with _warned_lock:
        _warned_keys.clear()


def safe_call(
    fn: Callable[[], T],
    *,
    fallback: T,
    label: str,
) -> T:
    """Run `fn`. On a schema-missing error, log (deduped) and return `fallback`.

    Any other exception is re-raised so callers (and FastAPI's exception
    handler) can surface the real problem.

    `label` shows up in the log line — keep it specific (e.g.
    ``"competitor_repo.list_handles"``) so the source is obvious in prod logs.
    """
    try:
        return fn()
    except Exception as exc:
        if is_schema_missing(exc):
            log_schema_missing(label, exc, "returning fallback")
            return fallback
        raise
