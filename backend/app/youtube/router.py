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
    AddCompetitorRequest,
    ArchiveMinerStatus,
    CompetitorOutlier,
    CrossPlatformDay,
    CrossPlatformResponse,
    InstagramReelMarker,
    RetentionAnnotation,
    RetentionCurvePoint,
    RetentionResponse,
    TitleHistoryEntry,
    YoutubeAlert,
    YoutubeArchiveSuggestion,
    YoutubeCallbackResponse,
    YoutubeChannel,
    YoutubeCompetitor,
    YoutubeConnectResponse,
    YoutubeOverviewResponse,
    YoutubeMetricPoint,
    YoutubeMetricSeries,
    YoutubePrediction,
    YoutubeSyncResponse,
    YoutubeVideo,
    YoutubeVideoListResponse,
    VelocityPoint,
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


# ── Competitors ──────────────────────────────────────────────────────────────

@router.get("/competitors", response_model=list[YoutubeCompetitor])
async def list_competitors(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.list_competitors(client, str(current_user.id))


@router.post("/competitors", response_model=YoutubeCompetitor, status_code=201)
async def add_competitor(
    body: AddCompetitorRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()

    count = youtube_repo.count_competitors(client, user_id)
    if count >= settings.competitor_limit_standard:
        raise HTTPException(
            status_code=429,
            detail=f"Competitor limit reached ({settings.competitor_limit_standard})",
        )

    token = youtube_repo.find_token(client, user_id)
    if not token:
        raise _channel_not_connected()

    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh)

    competitor = await service.fetch_channel_by_handle(body.handle, access_token)
    if not competitor:
        raise HTTPException(status_code=404, detail="YouTube channel not found for that handle")

    if settings.webhook_base_url:
        ok = await service.subscribe_to_channel(competitor["competitor_channel_id"], settings.webhook_base_url)
        competitor["webhook_active"] = ok
    else:
        competitor["webhook_active"] = False

    youtube_repo.upsert_competitor(client, user_id, token["yt_channel_id"], competitor)
    competitor["added_at"] = str(datetime.now(timezone.utc))

    # Kick off an immediate video fetch so the baseline exists right away
    background_tasks.add_task(
        _fetch_competitor_videos_now, user_id, competitor["competitor_channel_id"], access_token
    )

    return YoutubeCompetitor(**competitor)


async def _fetch_competitor_videos_now(user_id: str, competitor_channel_id: str, access_token: str) -> None:
    """Fetch the first batch of competitor videos immediately after adding."""
    try:
        client = get_client()
        videos = await service.fetch_latest_videos(competitor_channel_id, access_token, max_results=30)
        for v in videos:
            v["competitor_channel_id"] = competitor_channel_id
        youtube_repo.bulk_insert_competitor_videos(client, user_id, videos)
        for v in videos:
            youtube_repo.record_title_if_changed(
                client, user_id, competitor_channel_id, v["video_id"], v.get("title", "")
            )
    except Exception:
        logger.exception("Initial competitor video fetch failed for %s", competitor_channel_id)


@router.delete("/competitors/{competitor_channel_id}", status_code=204)
async def remove_competitor(
    competitor_channel_id: str,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()
    if settings.webhook_base_url:
        await service.unsubscribe_from_channel(competitor_channel_id, settings.webhook_base_url)
    youtube_repo.delete_competitor(client, user_id, competitor_channel_id)


@router.post("/competitors/sync", status_code=202)
async def sync_competitors(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Manually trigger a competitor video fetch for all tracked channels."""
    user_id = str(current_user.id)
    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        raise _channel_not_connected()
    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh)
    competitors = youtube_repo.list_competitors(client, user_id)
    for c in competitors:
        background_tasks.add_task(
            _fetch_competitor_videos_now, user_id, c["competitor_channel_id"], access_token
        )
    return {"status": "queued", "channels": len(competitors)}


# ── Insights: Outliers ───────────────────────────────────────────────────────

@router.get("/insights/outliers", response_model=list[CompetitorOutlier])
def get_outliers(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_competitor_outliers(client, str(current_user.id))


@router.get("/insights/recent-videos", response_model=list[CompetitorOutlier])
def get_recent_competitor_videos(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_recent_competitor_videos(client, str(current_user.id))


@router.get("/insights/title-history/{video_id}", response_model=list[TitleHistoryEntry])
def get_title_history(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_title_history(client, str(current_user.id), video_id)


# ── Insights: Velocity + Predictions ────────────────────────────────────────

@router.get("/insights/velocity/{video_id}", response_model=list[VelocityPoint])
def get_velocity(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_velocity(client, str(current_user.id), video_id)


@router.get("/insights/predictions/{video_id}", response_model=YoutubePrediction | None)
def get_prediction(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    pred = youtube_repo.get_prediction(client, user_id, video_id)
    if pred is None:
        return None
    model = youtube_repo.get_model_state(client, user_id)
    return YoutubePrediction(**pred, model_r2=model["r2_score"] if model else None)


# ── Insights: Archive Miner ──────────────────────────────────────────────────

@router.get("/insights/archive", response_model=ArchiveMinerStatus)
def get_archive(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    suggestions = youtube_repo.get_archive_suggestions(client, user_id)
    last_scan = youtube_repo.get_last_archive_scan(client, user_id)
    return ArchiveMinerStatus(
        last_scan=str(last_scan) if last_scan else None,
        suggestions=suggestions,
    )


@router.post("/insights/archive/refresh", status_code=202)
async def refresh_archive(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()
    last_scan = youtube_repo.get_last_archive_scan(client, user_id)
    if last_scan:
        from datetime import timedelta
        elapsed = (datetime.now(timezone.utc).replace(tzinfo=None) - last_scan).total_seconds()
        if elapsed < 86400:
            raise HTTPException(status_code=429, detail="Archive scan already ran today")
    background_tasks.add_task(_run_archive_miner_for_user, user_id)
    return {"status": "queued"}


async def _run_archive_miner_for_user(user_id: str) -> None:
    from ..jobs.yt_archive_miner import run_for_user
    try:
        await run_for_user(user_id)
    except Exception:
        logger.exception("Archive miner failed for user %s", user_id)


# ── Insights: Alerts ─────────────────────────────────────────────────────────

@router.get("/insights/alerts", response_model=list[YoutubeAlert])
def get_alerts(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_alerts(client, str(current_user.id))


# ── Insights: Cross-Platform ─────────────────────────────────────────────────

@router.get("/insights/cross-platform", response_model=CrossPlatformResponse)
def get_cross_platform(
    days: int = Query(default=90, ge=7, le=365),
    current_user: User = Depends(get_current_user),
):
    from datetime import timedelta
    import numpy as np

    client = get_client()
    user_id = str(current_user.id)
    start_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    yt_rows = youtube_repo.get_daily_subscriber_net(client, user_id, start_date)
    ig_rows = youtube_repo.get_instagram_reel_posts(client, user_id, start_date)

    ig_dates = {r["post_date"] for r in ig_rows}

    result_days = [
        CrossPlatformDay(
            day=r["day"],
            subscribers_gained=r["gained"],
            subscribers_lost=r["lost"],
            net_subscribers=r["gained"] - r["lost"],
            has_instagram_reel=r["day"] in ig_dates,
        )
        for r in yt_rows
    ]

    correlation = None
    if len(result_days) >= 10:
        try:
            ig_flag = np.array([1 if d.has_instagram_reel else 0 for d in result_days])
            gains = np.array([d.subscribers_gained for d in result_days])
            if gains.std() > 0 and ig_flag.std() > 0:
                correlation = float(np.corrcoef(ig_flag, gains)[0, 1])
        except Exception:
            pass

    return CrossPlatformResponse(
        days=result_days,
        reel_posts=[InstagramReelMarker(**r) for r in ig_rows],
        correlation=round(correlation, 3) if correlation is not None else None,
    )
