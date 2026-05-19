"""Tier 2 / F2 — branded hashtag mention sync (comment-corpus pivot).

Original design called Meta's `ig_hashtag_search` + `/<id>/recent_media` to
track public posts that mentioned a brand tag. That path turned out to be
inaccessible to this app's auth flow — Instagram Login API tokens cannot
hit the hashtag-search endpoints (only the older Facebook Login flow with
a connected FB Page can).

We pivoted to scanning the comments we already store on the user's OWN
posts. A "mention" is now a comment on one of the user's posts whose text
contains the branded hashtag. Less ambitious than global public-mention
tracking, but it tells the creator something genuinely useful: who is
saying my brand tag in my own comment sections.

The scan is pure SQL — no external API calls, so the weekly cadence is no
longer dictated by Meta's 30-queries-per-7d cap. It's still scheduled
weekly because comment volume churns slowly; the scheduler can be tightened
without quota concerns if needed.

Usage:
    cd backend
    python -m app.jobs.branded_hashtag_sync
"""

from __future__ import annotations

import asyncio
import logging

from ..database import get_client
from ..repositories.branded_hashtag_repo import (
    list_all_active_for_sync,
    scan_comments_for_mentions,
    touch_synced_at,
)

logger = logging.getLogger(__name__)


async def _run() -> int:
    """Scan every active branded hashtag against its owner's comment corpus.

    Kept `async` so the scheduler's coroutine wrapper can `await` it without
    spinning up its own event loop. The scan itself is sync (ClickHouse
    client) and would happily run from a plain function — `async def` just
    matches the registration pattern in app.scheduler.
    """
    client = get_client()
    rows = list_all_active_for_sync(client)
    if not rows:
        logger.info("branded_hashtag_sync: no active branded hashtags")
        return 0

    total = 0
    for user_id, hashtag, _ig_hashtag_id in rows:
        try:
            inserted = scan_comments_for_mentions(client, user_id, hashtag)
        except Exception:
            logger.exception(
                "branded_hashtag_sync: scan failed for user %s tag #%s",
                user_id, hashtag,
            )
            continue
        total += inserted
        touch_synced_at(client, user_id, hashtag)
        logger.info(
            "branded_hashtag_sync: user %s tag #%s -> %d new mentions",
            user_id, hashtag, inserted,
        )

    logger.info("branded_hashtag_sync: %d total comment mentions written", total)
    return total


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
