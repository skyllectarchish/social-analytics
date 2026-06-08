"""Outlier detection for competitor channels.

Called by two paths:
1. Scheduled: `_run()` — processes all users' competitors daily (fallback when no webhook).
2. Event: `check_video_after_delay(user_id, channel_id, video_id, hours)` —
   called by scheduler at +4h / +12h / +24h after a webhook notification.
"""

import asyncio
import logging
import statistics

from ..database import get_client
from ..repositories import youtube_repo
from ..crypto import decrypt_token
from ..config import settings

logger = logging.getLogger(__name__)

_OUTLIER_MULTIPLIER = 3.0  # video must be 3x channel average to flag


async def check_video_after_delay(user_id: str, channel_id: str, video_id: str, hours: int) -> None:
    """Fetch current stats for a competitor video at `hours` post-publish and check for outlier."""
    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        return
    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    try:
        from ..youtube import service
        access_token = await service.refresh_access_token(refresh)
        stats = await service.fetch_video_stats(video_id, access_token)
    except Exception:
        logger.exception("fetch_video_stats failed for %s", video_id)
        return
    if not stats:
        return

    view_count = stats["view_count"]
    youtube_repo.insert_velocity_point(client, user_id, channel_id, video_id, hours, view_count)

    # Only make the outlier call at 24h when we have stable data
    if hours < 24:
        return

    baseline_videos = youtube_repo.get_competitor_videos_for_baseline(client, user_id, channel_id)
    if len(baseline_videos) < 5:
        return
    counts = [v["view_count"] for v in baseline_videos if v["view_count"] > 0]
    if not counts:
        return
    avg_views = statistics.mean(counts)

    if view_count >= avg_views * _OUTLIER_MULTIPLIER:
        await _generate_outlier_analysis(client, user_id, video_id, stats["title"], view_count, avg_views)


async def _generate_outlier_analysis(client, user_id: str, video_id: str, title: str, view_count: int, avg_views: float) -> None:
    """Ask LLM to reverse-engineer why this video outperformed."""
    from ..ai.client import synthesize, _model_for_feature
    ratio = view_count / max(avg_views, 1)
    prompt = (
        f"A YouTube video titled \"{title}\" received {view_count:,} views in 24 hours, "
        f"which is {ratio:.1f}x above the channel's average of {avg_views:,.0f} views. "
        "Analyze in 2-3 sentences why this video likely outperformed: consider the title format, "
        "topic novelty, hook strength, and thumbnail concept. Be specific and actionable."
    )
    try:
        result = await synthesize(
            model=_model_for_feature(),
            system="You are a YouTube content strategist. Be concise and data-driven.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        analysis = result.text.strip()
    except Exception:
        logger.exception("LLM outlier analysis failed for video %s", video_id)
        analysis = f"Video performed {ratio:.1f}x above channel average. Manual review recommended."

    youtube_repo.mark_video_outlier(client, user_id, video_id, analysis)


async def _run() -> None:
    """Daily batch: for all users, fetch latest competitor videos and check baselines."""
    from datetime import datetime, timezone, timedelta
    from ..youtube import service

    client = get_client()
    rows = client.query(
        "SELECT DISTINCT user_id, competitor_channel_id FROM youtube_competitors FINAL WHERE is_deleted = false"
    ).result_rows

    for row in rows:
        user_id, competitor_channel_id = str(row[0]), row[1]
        token = youtube_repo.find_token(client, user_id)
        if not token:
            continue
        try:
            refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
            access_token = await service.refresh_access_token(refresh)
            videos = await service.fetch_latest_videos(competitor_channel_id, access_token, max_results=5)
        except Exception:
            logger.exception("Failed to fetch videos for competitor %s", competitor_channel_id)
            continue

        if not videos:
            continue

        for v in videos:
            v["competitor_channel_id"] = competitor_channel_id
        youtube_repo.bulk_insert_competitor_videos(client, user_id, videos)

        for v in videos:
            youtube_repo.record_title_if_changed(
                client, user_id, competitor_channel_id, v["video_id"], v.get("title", "")
            )

        # Check most recent video for outlier (in the 20-48h window after publish)
        for v in videos[:1]:
            published = v.get("published_at")
            if not published:
                continue
            if isinstance(published, str):
                continue  # skip if not a datetime object
            age_hours = (datetime.now(timezone.utc).replace(tzinfo=None) - published).total_seconds() / 3600
            if 20 <= age_hours <= 48:
                await check_video_after_delay(user_id, competitor_channel_id, v["video_id"], 24)


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
