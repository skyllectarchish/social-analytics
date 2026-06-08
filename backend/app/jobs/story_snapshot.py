"""Story analytics retention — snapshot active stories before Meta expires them.

Stories live 24 hours and the Graph API only exposes the *currently live*
ones (GET /{ig-user-id}/stories). This job runs every few hours so each
story is captured — metadata into `instagram_stories`, insights into the
shared `media_insights` table — building the historical Story record that
Instagram itself never provides.

Re-snapshotting a still-live story is intentional: insights grow over the
story's lifetime, and ReplacingMergeTree keeps the freshest values.

Per-user failures are isolated, mirroring account_sync.

Usage:
    cd backend
    python -m app.jobs.story_snapshot
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from ..config import settings
from ..crypto import decrypt_token
from ..database import get_client
from ..models.queries import GET_ALL_INSTAGRAM_TOKENS
from ..repositories import insights_repo, story_repo

logger = logging.getLogger(__name__)


async def snapshot_user_stories(client, user_id: str, ig_user_id: str, token: str) -> int:
    """Snapshot one user's active stories + insights. Returns stories stored.

    Also called inline from the insights sync (router._run_insights_sync) so a
    manual "Sync" captures whatever is live right now.
    """
    from ..instagram import service

    stories = await service.fetch_active_stories(ig_user_id, token)
    if not stories:
        return 0

    stored = story_repo.bulk_insert_stories(client, user_id, ig_user_id, stories)

    story_tuples = [(s.get("id", ""), "STORY") for s in stories if s.get("id")]
    batch = await service.fetch_media_insights_batch(
        story_tuples, token, fetch_reach_breakdown=False,
    )
    for ig_media_id, raw_metrics in batch.items():
        metric_rows = [
            {
                "metric_name": m["name"],
                "metric_value": m.get("values", [{}])[0].get("value", 0),
            }
            for m in raw_metrics
            if m.get("name")
        ]
        insights_repo.bulk_upsert_media_insights(client, user_id, ig_media_id, metric_rows)

    logger.info(
        "story_snapshot: stored %d stories (+insights for %d) for user %s",
        stored, len(batch), user_id,
    )
    return stored


async def _run() -> int:
    client = get_client()
    rows = client.query(GET_ALL_INSTAGRAM_TOKENS).result_rows
    if not rows:
        logger.info("story_snapshot: no connected accounts")
        return 0

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    total = 0
    for user_id, ig_user_id, encrypted_token, token_expires_at in rows:
        if token_expires_at <= now:
            logger.warning(
                "story_snapshot: token expired for user %s — skipping", user_id,
            )
            continue
        try:
            token = decrypt_token(encrypted_token, settings.jwt_secret_key)
            total += await snapshot_user_stories(client, str(user_id), ig_user_id, token)
        except Exception:
            logger.exception("story_snapshot: failed for user %s", user_id)

    logger.info("story_snapshot: %d stories snapshotted across %d accounts", total, len(rows))
    return total


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
