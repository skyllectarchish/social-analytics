"""Instagram routes — OAuth flow, profile, media, refresh, insights, stories."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from ..auth.dependencies import get_current_user
from ..config import settings
from ..constants import (
    ACCOUNT_DEMOGRAPHIC_METRICS,
    DEFAULT_PAGE_SIZE,
    DEFAULT_TOKEN_EXPIRY_SECONDS,
    INSIGHTS_LOOKBACK_DAYS,
    MAX_PAGE_SIZE,
)
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import InstagramNotConnectedError
from ..models.queries import (
    GET_DASHBOARD_SUMMARY,
    GET_FOLLOWER_GROWTH,
    GET_TOP_PERFORMING_MEDIA,
    GET_FORMAT_BREAKDOWN,
)
from ..models.user import User
from ..repositories import instagram_repo, insights_repo
from . import service
from .schemas import (
    AlgorithmMetricsResponse,
    AlgorithmMetricsSummary,
    AlgorithmPostItem,
    BestTimePost,
    BestTimePostsResponse,
    BestTimeResponse,
    BestTimeSlot,
    CallbackResponse,
    ConnectResponse,
    DashboardSummary,
    DemographicBreakdown,
    DemographicResponse,
    FollowerQualityCohort,
    FollowerQualityResponse,
    FollowerQualitySummary,
    FollowerSpike,
    FollowerSpikesResponse,
    FormatBreakdownItem,
    FormatBreakdownPost,
    FormatBreakdownPostsResponse,
    FormatBreakdownResponse,
    InsightDataPoint,
    InstagramMedia,
    InstagramProfile,
    MediaInsightItem,
    MediaInsightsResponse,
    MediaListResponse,
    MetricTimeSeries,
    OverviewResponse,
    ReelRetentionItem,
    ReelsRetentionResponse,
    ReelsTrendPoint,
    ReelsTrendResponse,
    StoriesResponse,
    StoryWithInsights,
    SyncResponse,
    TopPost,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/instagram", tags=["instagram"])


@router.get("/connect", response_model=ConnectResponse)
def connect(current_user: User = Depends(get_current_user)):
    """Return the Instagram OAuth URL for the frontend to redirect to.

    The `state` is a signed JWT bound to the current user and verified on
    `/callback` to prevent CSRF and cross-user code injection.
    """
    state = service.create_signed_oauth_state(str(current_user.id))
    oauth_url = service.get_oauth_url(state)
    return ConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/callback", response_model=CallbackResponse)
async def callback(
    code: str = Query(...),
    state: str = Query(..., description="Signed CSRF state token from /connect response"),
    current_user: User = Depends(get_current_user),
):
    """Handle the OAuth callback: verify state → exchange code → fetch data → store."""
    user_id = str(current_user.id)
    service.verify_oauth_state(state, user_id)

    short_token, ig_user_id = await service.exchange_code_for_token(code)
    long_token, expires_in = await service.get_long_lived_token(short_token)

    profile_data = await service.fetch_profile(ig_user_id, long_token)
    media_list = await service.fetch_media(ig_user_id, long_token)

    encrypted_token = encrypt_token(long_token, settings.jwt_secret_key)
    token_expires_at = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + expires_in,
        tz=timezone.utc,
    ).replace(tzinfo=None)

    client = get_client()
    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    logger.info("Instagram connected for user %s (ig: %s)", user_id, ig_user_id)
    profile = InstagramProfile.from_api_data(user_id, ig_user_id, profile_data)
    return CallbackResponse(success=True, profile=profile)


@router.get("/profile", response_model=InstagramProfile)
def get_profile(current_user: User = Depends(get_current_user)):
    """Return the stored Instagram profile for the current user."""
    client = get_client()
    ig_profile = instagram_repo.find_profile(client, str(current_user.id))
    if ig_profile is None:
        raise InstagramNotConnectedError()
    return InstagramProfile.from_model(ig_profile)


@router.get("/media", response_model=MediaListResponse)
def get_media(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated list of stored Instagram media for the current user."""
    client = get_client()
    user_id = str(current_user.id)
    offset = (page - 1) * page_size

    total = instagram_repo.count_media(client, user_id)
    media_models = instagram_repo.find_media_page(client, user_id, page_size, offset)
    items = [InstagramMedia.from_model(m) for m in media_models]

    return MediaListResponse(items=items, total=total)


@router.post("/refresh", response_model=CallbackResponse)
async def refresh(current_user: User = Depends(get_current_user)):
    """Re-fetch the latest data from Instagram and update ClickHouse."""
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    ig_user_id = token_data.ig_user_id
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    profile_data = await service.fetch_profile(ig_user_id, token)
    media_list = await service.fetch_media(ig_user_id, token)

    encrypted_token = encrypt_token(token, settings.jwt_secret_key)
    token_expires_at = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + DEFAULT_TOKEN_EXPIRY_SECONDS,
        tz=timezone.utc,
    ).replace(tzinfo=None)

    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    logger.info("Instagram data refreshed for user %s", user_id)
    profile = InstagramProfile.from_api_data(user_id, ig_user_id, profile_data)
    return CallbackResponse(success=True, profile=profile)


# --- Insights endpoints ---

@router.get("/insights/overview", response_model=OverviewResponse)
def get_overview(
    days: int = Query(INSIGHTS_LOOKBACK_DAYS, ge=1, le=90),
    current_user: User = Depends(get_current_user),
):
    """Return stored account-level time-series metrics for the last N days."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    metric_names = ["views", "reach", "follows_and_unfollows", "total_interactions", "accounts_engaged"]

    rows = insights_repo.find_account_insights(
        client, user_id, ig_profile.ig_user_id, metric_names, since
    )

    grouped: dict[str, list[InsightDataPoint]] = {m: [] for m in metric_names}
    for row in rows:
        if row.metric_name in grouped:
            grouped[row.metric_name].append(
                InsightDataPoint(end_time=row.end_time.isoformat(), value=row.metric_value)
            )

    def series(name: str) -> MetricTimeSeries:
        return MetricTimeSeries(metric_name=name, data=grouped[name])

    return OverviewResponse(
        views=series("views"),
        reach=series("reach"),
        follows_and_unfollows=series("follows_and_unfollows"),
        total_interactions=series("total_interactions"),
        accounts_engaged=series("accounts_engaged"),
    )


@router.get("/insights/demographics", response_model=DemographicResponse)
def get_demographics(
    metric: Literal["follower_demographics", "engaged_audience_demographics"] = Query(...),
    breakdown: Literal["age", "gender", "city", "country"] = Query(...),
    current_user: User = Depends(get_current_user),
):
    """Return stored demographic breakdown data."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    rows = insights_repo.find_demographic_insights(
        client, user_id, ig_profile.ig_user_id, metric, breakdown
    )

    return DemographicResponse(
        metric_name=metric,
        breakdown=breakdown,
        data=[DemographicBreakdown(dimension_value=r.dimension_value, value=r.metric_value) for r in rows],
    )


@router.get("/insights/media/{media_id}", response_model=MediaInsightsResponse)
def get_media_insights(
    media_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return stored insights for a single media item."""
    client = get_client()
    user_id = str(current_user.id)

    rows = insights_repo.find_media_insights(client, user_id, media_id)

    return MediaInsightsResponse(
        ig_media_id=media_id,
        insights=[MediaInsightItem(metric_name=r.metric_name, value=r.metric_value) for r in rows],
    )


async def _run_insights_sync(user_id: str, ig_user_id: str, token: str) -> None:
    """Background task: full insights sync for one user."""
    client = get_client()
    now = datetime.now(timezone.utc)
    since_ts = int((now - timedelta(days=INSIGHTS_LOOKBACK_DAYS)).timestamp())
    until_ts = int(now.timestamp())

    # Account insights
    try:
        raw_insights = await service.fetch_account_insights(ig_user_id, token, since_ts, until_ts)
        account_rows: list[dict] = []
        for metric_entry in raw_insights:
            metric_name = metric_entry.get("name", "")
            for point in metric_entry.get("values", []):
                try:
                    end_time = datetime.fromisoformat(
                        point["end_time"].replace("Z", "+00:00")
                    ).replace(tzinfo=None)
                    account_rows.append({
                        "metric_name": metric_name,
                        "metric_value": int(point.get("value", 0)),
                        "end_time": end_time,
                    })
                except (KeyError, ValueError):
                    continue
        insights_repo.bulk_upsert_account_insights(client, user_id, ig_user_id, account_rows)
        logger.info("Background sync: %d account rows for user %s", len(account_rows), user_id)
    except Exception:
        logger.exception("Background sync: account insights failed for user %s", user_id)

    # Demographics
    try:
        breakdowns = ["age", "gender", "city", "country"]
        demo_rows: list[dict] = []
        for metric_name in ACCOUNT_DEMOGRAPHIC_METRICS:
            for breakdown in breakdowns:
                try:
                    total_value = await service.fetch_demographics(
                        ig_user_id, token, metric_name, breakdown
                    )
                    for bd in total_value.get("breakdowns", []):
                        for result in bd.get("results", []):
                            dim_values = result.get("dimension_values", [])
                            demo_rows.append({
                                "metric_name": metric_name,
                                "dimension_key": breakdown,
                                "dimension_value": dim_values[-1] if dim_values else "",
                                "metric_value": int(result.get("value", 0)),
                                "timeframe": "this_month",
                            })
                except Exception:
                    logger.warning(
                        "Background sync: demographics skipped for %s/%s", metric_name, breakdown
                    )
        if demo_rows:
            insights_repo.bulk_upsert_demographic_insights(client, user_id, ig_user_id, demo_rows)
        logger.info("Background sync: %d demographic rows for user %s", len(demo_rows), user_id)
    except Exception:
        logger.exception("Background sync: demographics failed for user %s", user_id)

    # Media insights — only stale items, batch fetch
    try:
        stale_media = insights_repo.find_media_needing_sync(client, user_id)
        if stale_media:
            batch_results = await service.fetch_media_insights_batch(stale_media, token)
            for ig_media_id, raw_metrics in batch_results.items():
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
                "Background sync: media insights done for %d/%d items for user %s",
                len(batch_results), len(stale_media), user_id,
            )
    except Exception:
        logger.exception("Background sync: media insights failed for user %s", user_id)


@router.post("/insights/sync", response_model=SyncResponse)
async def sync_insights(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Kick off an async insights sync and return immediately.

    The actual sync runs in the background. Poll /insights/overview to see results.
    """
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)
    background_tasks.add_task(_run_insights_sync, user_id, token_data.ig_user_id, token)

    logger.info("Insights sync queued for user %s", user_id)
    return SyncResponse(
        success=True,
        account_metrics_synced=0,
        media_insights_synced=0,
        demographics_synced=False,
        message="Sync started in background",
    )


@router.get("/insights/dashboard", response_model=DashboardSummary)
def get_dashboard(
    days: int = Query(INSIGHTS_LOOKBACK_DAYS, ge=1, le=90),
    top_n: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    """Return pre-aggregated summary for dashboard hero cards."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    ig_user_id = ig_profile.ig_user_id
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    summary_rows = client.query(
        GET_DASHBOARD_SUMMARY,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "since": since},
    ).result_rows
    growth_rows = client.query(
        GET_FOLLOWER_GROWTH,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "since": since},
    ).result_rows
    top_rows = client.query(
        GET_TOP_PERFORMING_MEDIA,
        parameters={"user_id": user_id, "limit": top_n},
    ).result_rows

    sv = summary_rows[0] if summary_rows else (0, 0, 0, 0)
    gv = growth_rows[0] if growth_rows else (0,)
    net_follower_change = int(gv[0])

    top_posts = [
        TopPost(
            ig_media_id=r[0],
            media_type=r[1],
            permalink=r[2],
            thumbnail_url=r[3] or "",
            media_url=r[4] or "",
            caption=r[5] or "",
            views=int(r[6]),
            interactions=int(r[7]),
        )
        for r in top_rows
    ]

    return DashboardSummary(
        period_days=days,
        total_views=int(sv[0]),
        total_reach=int(sv[1]),
        total_interactions=int(sv[2]),
        total_accounts_engaged=int(sv[3]),
        net_follower_growth=net_follower_change,
        top_posts=top_posts,
    )


@router.get("/insights/format-breakdown", response_model=FormatBreakdownResponse)
def get_format_breakdown(
    days: int = Query(90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    """Return average metrics per content format (FEED/REELS/STORY × IMAGE/VIDEO/CAROUSEL)."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_format_breakdown(client, user_id, since)

    return FormatBreakdownResponse(
        period_days=days,
        data=[FormatBreakdownItem(**r) for r in rows],
    )


@router.get("/insights/best-time", response_model=BestTimeResponse)
def get_best_time_to_post(
    days: int = Query(90, ge=1, le=365),
    min_sample: int = Query(3, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    """Return a day-of-week × hour-of-day engagement heatmap for personalised posting time advice."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_best_time_to_post(client, user_id, since, min_sample)

    return BestTimeResponse(
        period_days=days,
        min_sample=min_sample,
        data=[BestTimeSlot(**r) for r in rows],
    )


@router.get("/insights/algorithm-metrics", response_model=AlgorithmMetricsResponse)
def get_algorithm_metrics(
    days: int = Query(30, ge=1, le=90),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Return per-post save rate, share rate, and composite algorithm score, plus account-level summary."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    posts_raw = insights_repo.find_algorithm_metrics_posts(client, user_id, since, limit)
    summary_raw = insights_repo.find_algorithm_metrics_summary(
        client, user_id, ig_profile.ig_user_id, since
    )

    posts = [
        AlgorithmPostItem(
            ig_media_id=r["ig_media_id"],
            media_product_type=r["media_product_type"],
            media_type=r["media_type"],
            permalink=r["permalink"] or "",
            thumbnail_url=r["thumbnail_url"] or "",
            media_url=r["media_url"] or "",
            caption=r["caption"] or "",
            timestamp=str(r["timestamp"]),
            saved=float(r["saved"]),
            shares=float(r["shares"]),
            reach=float(r["reach"]),
            save_rate=float(r["save_rate"]),
            share_rate=float(r["share_rate"]),
            algorithm_score=float(r["algorithm_score"]),
        )
        for r in posts_raw
    ]

    return AlgorithmMetricsResponse(
        period_days=days,
        summary=AlgorithmMetricsSummary(**summary_raw),
        posts=posts,
    )


@router.get("/stories", response_model=StoriesResponse)
async def get_stories(current_user: User = Depends(get_current_user)):
    """Fetch currently active stories with live insights from the Instagram API."""
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    ig_user_id = token_data.ig_user_id
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    raw_stories = await service.fetch_active_stories(ig_user_id, token)

    # Batch-fetch insights for all stories with rate limiting
    story_tuples = [(s.get("id", ""), "STORY") for s in raw_stories]
    batch_insights = await service.fetch_media_insights_batch(story_tuples, token) if story_tuples else {}

    stories_out: list[StoryWithInsights] = []
    for s in raw_stories:
        story_id = s.get("id", "")
        raw_metrics = batch_insights.get(story_id, [])
        insights = [
            MediaInsightItem(
                metric_name=m["name"],
                value=m.get("values", [{}])[0].get("value", 0),
            )
            for m in raw_metrics
            if m.get("name")
        ]
        stories_out.append(
            StoryWithInsights(
                ig_media_id=story_id,
                media_type=s.get("media_type", ""),
                media_url=s.get("media_url", ""),
                thumbnail_url=s.get("thumbnail_url", ""),
                permalink=s.get("permalink", ""),
                timestamp=str(s.get("timestamp", "")),
                insights=insights,
            )
        )

    return StoriesResponse(stories=stories_out)


# --- Feature 4: Reels Retention ---

@router.get("/insights/reels-retention", response_model=ReelsRetentionResponse)
def get_reels_retention(
    days: int = Query(90, ge=7, le=365),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Return per-Reel retention, hook strength, and replay metrics."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_reels_retention(client, user_id, since, limit)

    reels = [
        ReelRetentionItem(
            ig_media_id=r[0], permalink=r[1], caption_preview=r[2] or "",
            timestamp=str(r[3]), avg_watch_time=float(r[4]),
            total_view_time=float(r[5]), reach=float(r[6]), views=float(r[7]),
            skip_rate=float(r[8]), estimated_avg_duration_sec=float(r[9]),
            hook_strength_pct=float(r[10]), estimated_replay_rate=float(r[11]),
        )
        for r in rows
    ]
    return ReelsRetentionResponse(period_days=days, reels=reels)


@router.get("/insights/reels-retention/trend", response_model=ReelsTrendResponse)
def get_reels_retention_trend(
    days: int = Query(180, ge=30, le=730),
    current_user: User = Depends(get_current_user),
):
    """Return weekly Reels hook strength trend over time."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_reels_retention_trend(client, user_id, since)

    trend = [
        ReelsTrendPoint(
            week_start=str(r[0]), reels_count=int(r[1]),
            avg_hook_strength_pct=float(r[2]), avg_watch_time_sec=float(r[3]),
            avg_reach=float(r[4]), avg_views=float(r[5]),
        )
        for r in rows
    ]
    return ReelsTrendResponse(period_days=days, trend=trend)


# --- Feature 5: Follower Quality Score ---

@router.get("/insights/follower-quality", response_model=FollowerQualityResponse)
def get_follower_quality(
    breakdown: Literal["age", "gender", "city", "country"] = Query("age"),
    current_user: User = Depends(get_current_user),
):
    """Return per-cohort follower quality scores."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    rows = insights_repo.find_follower_quality(
        client, user_id, ig_profile.ig_user_id, breakdown,
    )
    cohorts = [
        FollowerQualityCohort(
            dimension_key=r[0], dimension_value=r[1],
            follower_count=int(r[2]), engaged_count=int(r[3]),
            engagement_rate_pct=float(r[4]), quality_tier=r[5],
        )
        for r in rows
    ]
    return FollowerQualityResponse(breakdown=breakdown, cohorts=cohorts)


@router.get("/insights/follower-quality/summary", response_model=FollowerQualitySummary)
def get_follower_quality_summary(
    breakdown: Literal["age", "gender", "city", "country"] = Query("age"),
    current_user: User = Depends(get_current_user),
):
    """Return overall follower quality summary."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    rows = insights_repo.find_follower_quality_summary(
        client, user_id, ig_profile.ig_user_id, breakdown,
    )
    r = rows[0] if rows else (0, 0, 0, 0.0, 0, 0, 0, 0)
    return FollowerQualitySummary(
        breakdown=breakdown,
        total_cohorts=int(r[0]), total_followers_tracked=int(r[1]),
        total_engaged_tracked=int(r[2]), overall_quality_pct=float(r[3]),
        high_quality_cohorts=int(r[4]), medium_quality_cohorts=int(r[5]),
        low_quality_cohorts=int(r[6]), dormant_cohorts=int(r[7]),
    )


@router.get("/insights/follower-quality/spikes", response_model=FollowerSpikesResponse)
def get_follower_spikes(
    days: int = Query(90, ge=7, le=365),
    threshold: int = Query(50, ge=5, le=10000),
    current_user: User = Depends(get_current_user),
):
    """Return follower growth spikes flagged for suspicious activity."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_follower_spikes(
        client, user_id, ig_profile.ig_user_id, since, threshold,
    )
    spikes = [
        FollowerSpike(
            spike_date=str(r[0]), follows_change=int(r[1]),
            interactions=int(r[2]), interaction_per_follow_ratio=float(r[3]),
            is_suspicious=bool(r[4]),
        )
        for r in rows
    ]
    return FollowerSpikesResponse(period_days=days, spike_threshold=threshold, spikes=spikes)


# --- Phase 7: Drill-Down APIs ---

@router.get("/insights/format-breakdown/posts", response_model=FormatBreakdownPostsResponse)
def get_format_breakdown_posts(
    format: str = Query(..., description="Content format: FEED, REELS, or STORY"),
    days: int = Query(90, ge=1, le=365),
    limit: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Return posts for a specific content format, ranked by algorithm score."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_format_breakdown_posts(client, user_id, since, format, limit)

    posts = [
        FormatBreakdownPost(
            ig_media_id=r[0], media_product_type=r[1], media_type=r[2],
            permalink=r[3], thumbnail_url=r[4] or None,
            caption_preview=r[5] or "", timestamp=str(r[6]),
            reach=float(r[7]), likes=float(r[8]), saved=float(r[9]),
            shares=float(r[10]), algorithm_score_pct=float(r[11]),
        )
        for r in rows
    ]
    return FormatBreakdownPostsResponse(format=format, period_days=days, posts=posts)


@router.get("/insights/best-time/posts", response_model=BestTimePostsResponse)
def get_best_time_posts(
    day: int = Query(..., ge=1, le=7, description="Day of week: 1=Monday … 7=Sunday"),
    hour: int = Query(..., ge=0, le=23, description="Hour of day: 0–23"),
    days: int = Query(90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    """Return posts from a specific day/hour slot, ranked by engagement rate."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_best_time_posts(client, user_id, since, day, hour)

    posts = [
        BestTimePost(
            ig_media_id=r[0], media_product_type=r[1], permalink=r[2],
            thumbnail_url=r[3] or None, caption_preview=r[4] or "",
            timestamp=str(r[5]), reach=float(r[6]),
            total_interactions=float(r[7]), engagement_rate_pct=float(r[8]),
        )
        for r in rows
    ]
    return BestTimePostsResponse(day_of_week=day, hour_of_day=hour, period_days=days, posts=posts)
