"""Tier 4 / Phase F — scheduled weekly digest synthesis.

Runs every Monday at 08:00 UTC via APScheduler (configurable). For each
user with recent posting activity:

1. Skip if the user already has a cached digest for last week.
2. Skip if sufficiency check fails (`digest.has_enough_data()`).
3. Synthesize last week's digest with `feature='digest_auto'` so it
   does NOT count against the user's monthly user-initiated quota.

Per-user failures are caught and logged — one user's LLM error must not
abort the rest of the run.

Usage:
    cd backend
    python -m app.jobs.weekly_digest          # batch all eligible users
    python -m app.jobs.weekly_digest --user-id <uuid>   # one user (debug)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timedelta, timezone

from ..ai import digest as digest_service
from ..config import settings
from ..database import get_client
from ..models.queries import LIST_USERS_WITH_RECENT_ACTIVITY

logger = logging.getLogger(__name__)


# Trailing window used to decide which users are "active enough" to
# synthesize for. has_enough_data() does a more careful check later.
ACTIVITY_LOOKBACK_DAYS = 30


def _last_week_monday(today: date | None = None) -> date:
    """Return the Monday that started the most recently *completed* week."""
    today = today or datetime.now(timezone.utc).date()
    this_monday = today - timedelta(days=today.weekday())
    return this_monday - timedelta(days=7)


def _list_active_users() -> list[tuple[str, str]]:
    """Return (user_id, ig_user_id) for everyone who has posted recently."""
    client = get_client()
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=ACTIVITY_LOOKBACK_DAYS,
    )
    rows = client.query(
        LIST_USERS_WITH_RECENT_ACTIVITY,
        parameters={"since": since},
    ).result_rows
    return [(str(user_id), ig_user_id) for user_id, ig_user_id in rows]


async def _process_user(user_id: str, week_of: date) -> str:
    """Synthesize one user's digest. Returns a short status string."""
    client = get_client()
    # Skip if a digest already exists for that week. We only auto-fill
    # missing weeks — never overwrite a user-initiated regenerate.
    existing = digest_service.find_cached(
        client, user_id=user_id, week_of=week_of,
    )
    if existing is not None:
        return "skip:cached"

    try:
        await digest_service.synthesize(
            client, user_id=user_id, week_of=week_of, auto_charged=True,
        )
    except Exception as exc:  # noqa: BLE001 — per-user isolation
        logger.warning("weekly_digest.user_failed user=%s err=%r", user_id, exc)
        return f"error:{type(exc).__name__}"

    return "ok"


async def _run(week_of: date | None = None,
               only_user_id: str | None = None) -> dict[str, int]:
    target_week = week_of or _last_week_monday()
    logger.info("weekly_digest.start week_of=%s", target_week.isoformat())

    if only_user_id:
        users: list[tuple[str, str]] = [(only_user_id, "")]
    else:
        users = _list_active_users()
    logger.info("weekly_digest.candidates count=%d", len(users))

    stats = {"ok": 0, "skip:cached": 0, "error": 0}
    for user_id, _ig_user_id in users:
        status = await _process_user(user_id, target_week)
        if status.startswith("error"):
            stats["error"] += 1
        else:
            stats[status] = stats.get(status, 0) + 1

    logger.info(
        "weekly_digest.done ok=%d skip_cached=%d errors=%d",
        stats.get("ok", 0), stats.get("skip:cached", 0), stats["error"],
    )
    return stats


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Tier 4 weekly digest job")
    parser.add_argument("--week-of", type=str, default=None,
                        help="ISO date (Monday). Default: last Monday.")
    parser.add_argument("--user-id", type=str, default=None,
                        help="Limit to one user (debug). Default: all eligible.")
    args = parser.parse_args(argv)

    week_of = date.fromisoformat(args.week_of) if args.week_of else None
    if not settings.ollama_api_key:
        print("OLLAMA_API_KEY not configured — aborting.", file=sys.stderr)
        return 2
    asyncio.run(_run(week_of=week_of, only_user_id=args.user_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
