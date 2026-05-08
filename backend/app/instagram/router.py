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
)
from ..models.user import User
from ..repositories import instagram_repo, insights_repo
from . import service
from .schemas import (
    CallbackResponse,
    ConnectResponse,
    DashboardSummary,
    DemographicBreakdown,
    DemographicResponse,
    InsightDataPoint,
    InstagramMedia,
    InstagramProfile,
    MediaInsightItem,
    MediaInsightsResponse,
    MediaListResponse,
    MetricTimeSeries,
    OverviewResponse,
    StoriesResponse,
    StoryWithInsights,
    SyncResponse,
    TopPost,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/instagram", tags=["instagram"])


@router.get("/connect", response_model=ConnectResponse)
def connect(_: User = Depends(get_current_user)):
    """Return the Meta OAuth URL for the frontend to redirect to."""
    state = service.generate_oauth_state()
    oauth_url = service.get_oauth_url(state)
    return ConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/callback", response_model=CallbackResponse)
async def callback(
    code: str = Query(...),
    state: str | None = Query(None, description="CSRF state token from /connect response"),
    current_user: User = Depends(get_current_user),
):
    """Handle the OAuth callback: exchange code → fetch data → store in ClickHouse."""
    user_id = str(current_user.id)

    short_token = await service.exchange_code_for_token(code)
    long_token, expires_in = await service.get_long_lived_token(short_token)
    ig_user_id, token = await service.get_instagram_business_account(long_token)

    profile_data = await service.fetch_profile(ig_user_id, token)
    media_list = await service.fetch_media(ig_user_id, token)

    encrypted_token = encrypt_token(token, settings.jwt_secret_key)
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
            caption=r[3] or "",
            views=int(r[4]),
            interactions=int(r[5]),
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
