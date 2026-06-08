"""Hourly velocity tracker for newly published own-channel videos.

Fired at +1h, +2h, +3h, +4h after publish by APScheduler date jobs.
After the 4h point, retrains the predictive model and stores a prediction.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def record_velocity(user_id: str, channel_id: str, video_id: str, hours: int) -> None:
    """Fetch current stats and store velocity point. At 4h, trigger prediction."""
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
    except Exception:
        logger.exception("Token refresh failed for user %s", user_id)
        return

    stats = await service.fetch_video_stats(video_id, access_token)
    if not stats:
        return

    youtube_repo.insert_velocity_point(
        client, user_id, channel_id, video_id, hours,
        view_count=stats["view_count"],
        avg_watch_s=0.0,
        ctr_pct=0.0,
    )

    if hours == 4:
        await _make_prediction(client, user_id, video_id, stats["view_count"])


async def _make_prediction(client, user_id: str, video_id: str, four_hour_views: int) -> None:
    from ..youtube.predictive_model import train_model, predict
    from ..repositories import youtube_repo
    from ..config import settings

    samples = youtube_repo.get_own_velocity_samples(client, user_id)
    model_state = youtube_repo.get_model_state(client, user_id)

    if len(samples) >= 5:
        model_state = train_model(samples)
        youtube_repo.upsert_model_state(client, user_id, model_state)

    if not model_state:
        return

    predicted, low, high = predict(model_state, four_hour_views, 0.0, 0.0)
    rpm = settings.default_rpm_usd
    youtube_repo.upsert_prediction(client, user_id, {
        "video_id": video_id,
        "four_hour_views": four_hour_views,
        "four_hour_avg_watch_s": 0.0,
        "ctr_pct": 0.0,
        "predicted_30d_views": predicted,
        "predicted_low": low,
        "predicted_high": high,
        "revenue_low_usd": round(low / 1000 * rpm, 2),
        "revenue_high_usd": round(high / 1000 * rpm, 2),
    })


def main() -> None:
    asyncio.run(record_velocity("", "", "", 0))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
