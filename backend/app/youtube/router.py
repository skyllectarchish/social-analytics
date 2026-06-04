"""YouTube routes — OAuth flow, channel, videos, insights, retention."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from ..auth.dependencies import get_current_user
from ..config import settings
from ..constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import OAuthError
from ..models.user import User
from ..oauth_state import create_signed_oauth_state, verify_oauth_state
from ..repositories import youtube_repo
from . import service
from .schemas import (
    RetentionAnnotation,
    RetentionCurvePoint,
    RetentionResponse,
    YoutubeCallbackResponse,
    YoutubeChannel,
    YoutubeConnectResponse,
    YoutubeOverviewResponse,
    YoutubeMetricPoint,
    YoutubeMetricSeries,
    YoutubeSyncResponse,
    YoutubeVideo,
    YoutubeVideoListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

_YT_PURPOSE = "yt_oauth_state"


def _channel_not_connected() -> HTTPException:
    return HTTPException(status_code=404, detail="YouTube channel not connected")


@router.get("/connect", response_model=YoutubeConnectResponse)
def connect(current_user: User = Depends(get_current_user)):
    state = create_signed_oauth_state(str(current_user.id), purpose=_YT_PURPOSE)
    oauth_url = service.get_oauth_url(state)
    return YoutubeConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/callback", response_model=YoutubeCallbackResponse)
async def callback(
    background_tasks: BackgroundTasks,
    code: str = Query(...),
    state: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    verify_oauth_state(state, user_id, purpose=_YT_PURPOSE)

    client = get_client()
    existing = youtube_repo.find_channel(client, user_id)

    try:
        access_token, refresh_token = await service.exchange_code_for_tokens(code)
    except OAuthError:
        if existing:
            return YoutubeCallbackResponse(
                success=True,
                channel=YoutubeChannel(**existing),
            )
        raise

    encrypted_refresh = encrypt_token(refresh_token, settings.jwt_secret_key)
    channel_data = await service.fetch_channel(access_token)
    videos = await service.fetch_latest_videos(channel_data["yt_channel_id"], access_token)

    youtube_repo.upsert_token(client, user_id, channel_data["yt_channel_id"], encrypted_refresh)
    youtube_repo.upsert_channel(client, user_id, channel_data)
    youtube_repo.bulk_insert_videos(client, user_id, channel_data["yt_channel_id"], videos)

    background_tasks.add_task(_run_analytics_sync, user_id, channel_data["yt_channel_id"], refresh_token, 30)

    logger.info("YouTube connected for user %s (channel: %s)", user_id, channel_data["yt_channel_id"])
    return YoutubeCallbackResponse(success=True, channel=YoutubeChannel(**channel_data))


@router.get("/channel", response_model=YoutubeChannel)
def get_channel(current_user: User = Depends(get_current_user)):
    client = get_client()
    channel = youtube_repo.find_channel(client, str(current_user.id))
    if channel is None:
        raise _channel_not_connected()
    return YoutubeChannel(**channel)


@router.get("/videos", response_model=YoutubeVideoListResponse)
def get_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    yt_channel_id = token_data["yt_channel_id"]
    total = youtube_repo.count_videos(client, user_id, yt_channel_id)
    offset = (page - 1) * page_size
    items = youtube_repo.find_videos_page(client, user_id, yt_channel_id, page_size, offset)
    return YoutubeVideoListResponse(
        items=[YoutubeVideo(**v) for v in items],
        total=total,
    )


@router.post("/refresh", response_model=YoutubeCallbackResponse)
async def refresh(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh_token)
    channel_data = await service.fetch_channel(access_token)
    videos = await service.fetch_latest_videos(channel_data["yt_channel_id"], access_token)
    youtube_repo.upsert_channel(client, user_id, channel_data)
    youtube_repo.bulk_insert_videos(client, user_id, channel_data["yt_channel_id"], videos)
    logger.info("YouTube refreshed for user %s", user_id)
    return YoutubeCallbackResponse(success=True, channel=YoutubeChannel(**channel_data))


@router.post("/disconnect")
def disconnect(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    yt_channel_id = token_data["yt_channel_id"] if token_data else ""
    youtube_repo.delete_token(client, user_id)
    logger.info("YouTube disconnected for user %s", user_id)
    return {"success": True, "yt_channel_id": yt_channel_id}


async def _run_analytics_sync(user_id: str, yt_channel_id: str, refresh_token: str, lookback_days: int = 30) -> None:
    """Background task: sync daily analytics metrics."""
    client = get_client()
    try:
        access_token = await service.refresh_access_token(refresh_token)
        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
        rows = await service.fetch_analytics_overview(yt_channel_id, access_token, start_date, end_date)
        youtube_repo.bulk_insert_daily_metrics(client, user_id, yt_channel_id, rows)
        logger.info("YouTube analytics sync: %d rows for user %s", len(rows), user_id)
    except Exception:
        logger.exception("YouTube analytics sync failed for user %s", user_id)


@router.post("/insights/sync", response_model=YoutubeSyncResponse)
async def sync_insights(
    background_tasks: BackgroundTasks,
    lookback_days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    background_tasks.add_task(
        _run_analytics_sync, user_id, token_data["yt_channel_id"], refresh_token, lookback_days,
    )
    return YoutubeSyncResponse(success=True, message="Sync started in background")


@router.get("/insights/overview", response_model=YoutubeOverviewResponse)
def get_overview(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    yt_channel_id = token_data["yt_channel_id"]
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    metrics = ["views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost"]
    rows = youtube_repo.find_daily_metrics(client, user_id, yt_channel_id, metrics, since)

    grouped: dict[str, list[YoutubeMetricPoint]] = {m: [] for m in metrics}
    for row in rows:
        name = row["metric_name"]
        if name in grouped:
            grouped[name].append(YoutubeMetricPoint(
                date=row["end_time"].strftime("%Y-%m-%d") if hasattr(row["end_time"], "strftime") else str(row["end_time"])[:10],
                value=row["metric_value"],
            ))

    def series(name: str) -> YoutubeMetricSeries:
        return YoutubeMetricSeries(metric_name=name, data=grouped[name])

    return YoutubeOverviewResponse(
        period_days=days,
        views=series("views"),
        watch_minutes=series("estimatedMinutesWatched"),
        subscribers_gained=series("subscribersGained"),
        subscribers_lost=series("subscribersLost"),
    )


@router.get("/insights/retention/{video_id}", response_model=RetentionResponse)
async def get_retention(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    from ..ai.retention_analyzer import analyze_retention

    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()

    yt_channel_id = token_data["yt_channel_id"]
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh_token)

    # Fetch + store fresh retention curve
    points = await service.fetch_retention_curve(yt_channel_id, video_id, access_token)
    if points:
        youtube_repo.bulk_insert_retention_curve(client, user_id, yt_channel_id, video_id, points)

    curve = youtube_repo.find_retention_curve(client, user_id, video_id)
    annotations_raw = youtube_repo.find_retention_annotations(client, user_id, video_id)
    annotations_fresh = youtube_repo.annotations_are_fresh(client, user_id, video_id)
    annotations_pending = False

    if not annotations_fresh and curve:
        # Look up video metadata for the analyzer
        videos_page = youtube_repo.find_videos_page(client, user_id, yt_channel_id, 200, 0)
        video_meta = next((v for v in videos_page if v["video_id"] == video_id), None)
        title = video_meta["title"] if video_meta else ""
        duration = video_meta["duration_seconds"] if video_meta else 0

        # Only annotate if >1000 views
        view_count = video_meta["view_count"] if video_meta else 0
        if view_count >= 1000:
            caption_text = await service.fetch_captions(video_id, access_token)
            background_tasks.add_task(
                analyze_retention, user_id, video_id, title, duration, caption_text,
            )
            annotations_pending = True

    return RetentionResponse(
        video_id=video_id,
        curve=[RetentionCurvePoint(
            elapsed_ratio=p["elapsed_video_time_ratio"],
            watch_ratio=p["audience_watch_ratio"],
            relative_performance=p["relative_retention_performance"],
        ) for p in curve],
        annotations=[RetentionAnnotation(**a) for a in annotations_raw],
        annotations_pending=annotations_pending,
    )
