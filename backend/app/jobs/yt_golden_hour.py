"""Golden Hour alert — fires 60 minutes after a video is published.

Compares the 60-minute view count to the channel's baseline.
Stores an alert in youtube_alerts.
"""

import logging

logger = logging.getLogger(__name__)

_UNDER_THRESHOLD = 0.5   # < 50% of baseline = underperforming alert
_OVER_THRESHOLD = 2.0    # > 200% of baseline = viral alert


async def run_golden_hour(user_id: str, channel_id: str, video_id: str) -> None:
    from ..database import get_client
    from ..repositories import youtube_repo
    from ..crypto import decrypt_token
    from ..config import settings
    from ..youtube import service

    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        return

    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    try:
        access_token = await service.refresh_access_token(refresh)
        stats = await service.fetch_video_stats(video_id, access_token)
    except Exception:
        logger.exception("Golden hour fetch failed for video %s", video_id)
        return
    if not stats:
        return

    current_views = stats["view_count"]
    youtube_repo.insert_velocity_point(client, user_id, channel_id, video_id, 1, current_views)

    baseline_rows = client.query(
        "SELECT avg(view_count) FROM youtube_competitor_velocity FINAL "
        "WHERE user_id = {uid:UUID} AND yt_channel_id = {cid:String} AND hours_since_publish = 1 "
        "AND video_id != {vid:String}",
        parameters={"uid": user_id, "cid": channel_id, "vid": video_id},
    ).result_rows
    baseline = float(baseline_rows[0][0]) if baseline_rows and baseline_rows[0][0] else 0

    if baseline < 10:
        return

    ratio = current_views / baseline
    if ratio < _UNDER_THRESHOLD:
        alert_body = (
            f"Your video has {current_views:,} views after 1 hour — {ratio:.0%} of your typical baseline. "
            "Consider updating the title or thumbnail now while the video is still fresh."
        )
        youtube_repo.insert_alert(client, user_id, video_id, "GOLDEN_HOUR_UNDER", alert_body)
    elif ratio > _OVER_THRESHOLD:
        alert_body = (
            f"Your video has {current_views:,} views after 1 hour — {ratio:.1f}x your typical baseline! "
            "Jump into the comments now to boost engagement while it's trending."
        )
        youtube_repo.insert_alert(client, user_id, video_id, "GOLDEN_HOUR_OVER", alert_body)
