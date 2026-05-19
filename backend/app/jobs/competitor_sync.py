"""Tier 2 / F3 — daily competitor snapshot job.

For every active (user, handle) tuple, look up the public business-discovery
data using the user's existing IG token and append a fresh
`competitor_snapshots` row.

Also writes a daily "self" snapshot per user under handle='you' so the
/competitors/timeline endpoint can render a continuous "You" line alongside
competitor lines instead of a single isolated dot. Self metrics are computed
the same way competitor metrics are — (likes + comments) / followers across
the last 25 posts — so values are apples-to-apples.

Usage:
    cd backend
    python -m app.jobs.competitor_sync
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from ..config import settings
from ..crypto import decrypt_token
from ..database import get_client
from ..instagram.competitors import (
    derive_snapshot_metrics,
    fetch_competitor_snapshot,
)
from ..repositories.competitor_repo import (
    MAX_CONSECUTIVE_FAILURES,
    insert_snapshot,
    record_failure,
    record_success,
    soft_delete_handle,
)

logger = logging.getLogger(__name__)

#: Reserved handle for the authenticated user's own daily snapshot row.
SELF_HANDLE: str = "you"


def _compute_self_metrics(client, user_id: str) -> dict | None:
    """Build a competitor-shape metrics dict from owned media.

    Returns None if the user has no profile row yet (shouldn't happen for
    rows joined to instagram_profiles, but defensive).
    """
    profile_rows = client.query(
        "SELECT followers_count, media_count FROM instagram_profiles FINAL "
        "WHERE user_id = {user_id:UUID} "
        "ORDER BY updated_at DESC LIMIT 1",
        parameters={"user_id": user_id},
    ).result_rows
    if not profile_rows:
        return None
    followers, media_count = int(profile_rows[0][0] or 0), int(profile_rows[0][1] or 0)

    post_rows = client.query(
        "SELECT media_type, media_product_type, timestamp, like_count, comments_count "
        "FROM instagram_media FINAL "
        "WHERE user_id = {user_id:UUID} "
        "ORDER BY timestamp DESC LIMIT 25",
        parameters={"user_id": user_id},
    ).result_rows

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    seven_days_ago = now - timedelta(days=7)

    likes = [int(r[3] or 0) for r in post_rows]
    comments = [int(r[4] or 0) for r in post_rows]
    posts_last_7d = sum(1 for r in post_rows if r[2] and r[2] >= seven_days_ago)
    reels_last_7d = sum(
        1 for r in post_rows
        if r[2] and r[2] >= seven_days_ago and (r[1] or "") == "REELS"
    )
    carousels_last_7d = sum(
        1 for r in post_rows
        if r[2] and r[2] >= seven_days_ago and (r[0] or "") == "CAROUSEL_ALBUM"
    )

    avg_likes = sum(likes) / len(likes) if likes else 0.0
    avg_comments = sum(comments) / len(comments) if comments else 0.0
    if followers > 0 and post_rows:
        per_post = [(l + c) / followers * 100.0 for l, c in zip(likes, comments)]
        avg_er = sum(per_post) / len(per_post)
    else:
        avg_er = 0.0

    return {
        "followers_count": followers,
        "media_count": media_count,
        "posts_last_7d": posts_last_7d,
        "reels_last_7d": reels_last_7d,
        "carousels_last_7d": carousels_last_7d,
        "avg_likes_last_25": float(avg_likes),
        "avg_comments_last_25": float(avg_comments),
        "avg_engagement_rate_pct": float(avg_er),
    }


async def _run() -> int:
    client = get_client()
    today = date.today()

    # --- 1. Self-snapshot for every user with a connected IG profile ---
    # Done first so even users with zero competitors still get timeline
    # history accumulating.
    self_users = client.query(
        "SELECT DISTINCT user_id FROM instagram_profiles FINAL"
    ).result_rows
    self_success = 0
    for (user_id,) in self_users:
        try:
            metrics = _compute_self_metrics(client, str(user_id))
            if metrics is None:
                continue
            insert_snapshot(client, str(user_id), SELF_HANDLE, today, metrics)
            self_success += 1
        except Exception:
            logger.exception("competitor_sync: self-snapshot failed for user %s", user_id)
    if self_success:
        logger.info("competitor_sync: %d self-snapshots written", self_success)

    # --- 2. Competitor snapshots ---
    rows = client.query(
        """
        SELECT c.user_id, c.handle, p.ig_user_id, p.access_token
        FROM competitor_handles c FINAL
        INNER JOIN instagram_profiles p FINAL ON c.user_id = p.user_id
        WHERE c.active = 1
        """
    ).result_rows

    if not rows:
        logger.info("competitor_sync: no active competitors")
        return self_success

    competitor_success = 0
    auto_disabled = 0
    for user_id, handle, ig_user_id, enc_token in rows:
        user_id_str = str(user_id)
        try:
            token = decrypt_token(enc_token, settings.jwt_secret_key)
        except Exception:
            # Token problems aren't the competitor's fault — don't count
            # toward `consecutive_failures`.
            logger.exception("competitor_sync: token decrypt failed for user %s", user_id)
            continue

        fetch_failed = False
        snap = None
        try:
            snap = await fetch_competitor_snapshot(ig_user_id, handle, token)
        except Exception:
            logger.exception("competitor_sync: fetch failed for %s/%s", user_id, handle)
            fetch_failed = True

        # Two failure modes: an unhandled exception (above) OR a Graph 400 /
        # not-found response that returns None from fetch_competitor_snapshot.
        # Both increment the consecutive_failures counter so a competitor going
        # private gets caught even though it returns 200-with-no-payload.
        if fetch_failed or not snap:
            new_failures = record_failure(client, user_id_str, handle)
            if new_failures >= MAX_CONSECUTIVE_FAILURES:
                soft_delete_handle(client, user_id_str, handle)
                auto_disabled += 1
                logger.warning(
                    "competitor_sync: auto-disabled %s/%s after %d consecutive failures",
                    user_id, handle, new_failures,
                )
            continue

        metrics = derive_snapshot_metrics(snap)
        try:
            insert_snapshot(client, user_id_str, handle, today, metrics)
            competitor_success += 1
            # Only reset on a successful snapshot insert — keeps the counter
            # honest if the Graph call succeeds but the DB write fails.
            record_success(client, user_id_str, handle)
        except Exception:
            logger.exception("competitor_sync: insert failed for %s/%s", user_id, handle)

    logger.info(
        "competitor_sync: %d competitor + %d self snapshots, %d auto-disabled",
        competitor_success, self_success, auto_disabled,
    )
    return self_success + competitor_success


def main() -> int:
    return asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
