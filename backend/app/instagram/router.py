"""Instagram routes — OAuth flow, profile, media, refresh, insights, stories."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response

from ..auth.dependencies import get_current_user
from ..config import settings
from ..constants import (
    ACCOUNT_DEMOGRAPHIC_METRICS,
    DEFAULT_PAGE_SIZE,
    DEFAULT_TOKEN_EXPIRY_SECONDS,
    INSIGHTS_INITIAL_FETCH_DAYS,
    INSIGHTS_LOOKBACK_DAYS,
    INSIGHTS_MAX_LOOKBACK_DAYS,
    MAX_PAGE_SIZE,
)
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import (
    EntityNotFoundError,
    InstagramAPIError,
    InstagramNotConnectedError,
    OAuthError,
)
from ..models.queries import (
    COUNT_IG_COMMENTS_FROM_MEDIA,
    COUNT_STORED_COMMENTS,
    COUNT_STORED_COMMENT_SENTIMENT,
    COUNT_STORED_COMMENT_TOPICS,
    GET_DASHBOARD_SUMMARY,
    GET_FOLLOWER_GROWTH,
    GET_MEDIA_IMAGE_URL,
    GET_TOP_PERFORMING_MEDIA,
    GET_FORMAT_BREAKDOWN,
)
from ..models.user import User
from ..jobs import seed_demo_sentiment
from ..repositories import (
    branded_hashtag_repo,
    comment_repo,
    competitor_repo,
    instagram_repo,
    insights_repo,
)
from ..repositories.comparison import (
    COMPARE_TO_PATTERN,
    resolve_compare_window,
    resolve_current_window,
)
from ..stats import pct_delta, rate_significance, sample_significance
from . import competitors, service
from .schemas import (
    AddBrandedHashtagRequest,
    AddCompetitorRequest,
    AlgorithmMetricsResponse,
    BrandedHashtagItem,
    BrandedHashtagListResponse,
    BrandedHashtagMention,
    BrandedHashtagMentionsResponse,
    AlgorithmMetricsSummary,
    AlgorithmPostItem,
    BestTimeByFormatSlot,
    BestTimePost,
    BestTimePostsResponse,
    BestTimeResponse,
    BestTimeSlot,
    CallbackResponse,
    CompetitorItem,
    CompetitorListResponse,
    CompetitorLookupPreview,
    CompetitorSnapshot,
    ComparisonValue,
    CompetitorTimelinePoint,
    CompetitorTimelineResponse,
    CompetitorTimelineSeries,
    ConnectResponse,
    ContentMixAccount,
    ContentMixDistribution,
    ContentMixResponse,
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
    GrowthCorrelationPoint,
    GrowthCorrelationResponse,
    GrowthDriverItem,
    GrowthDriversResponse,
    HashtagComboItem,
    HashtagComboResponse,
    HashtagPerformanceItem,
    HashtagsResponse,
    HashtagTrendPoint,
    HashtagTrendResponse,
    InsightDataPoint,
    InstagramMedia,
    InstagramProfile,
    MediaInsightItem,
    MediaInsightsResponse,
    MediaListResponse,
    MediaSentimentResponse,
    MetricTimeSeries,
    OverviewResponse,
    PostConversionResponse,
    PurgeResponse,
    QuestionPostItem,
    QuestionPostsResponse,
    SeedDemoResponse,
    SentimentDiagnoseResponse,
    ReelRetentionItem,
    ReelsRetentionResponse,
    ReelsTrendPoint,
    ReelsTrendResponse,
    SelfSnapshot,
    SentimentDistribution,
    SentimentSampleComment,
    SentimentSummaryResponse,
    SentimentTrendPoint,
    StoriesResponse,
    StoryWithInsights,
    SyncResponse,
    TopicItem,
    TopicsResponse,
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
    background_tasks: BackgroundTasks,
    code: str = Query(...),
    state: str = Query(..., description="Signed CSRF state token from /connect response"),
    current_user: User = Depends(get_current_user),
):
    """Handle the OAuth callback: verify state → exchange code → fetch data → store.

    Also schedules an initial INSIGHTS_INITIAL_FETCH_DAYS-day insights backfill in
    the background so the dashboard has historical data immediately on first connect
    (Meta retains ~90 days of historical account insights server-side).
    """
    user_id = str(current_user.id)
    service.verify_oauth_state(state, user_id)

    # Idempotency: a refresh of the callback URL re-fires the GET with the
    # already-redeemed `code`, which Meta rejects. If the user already has a
    # connected profile, short-circuit to success instead of bouncing them
    # back to /connect with a misleading "failed to exchange" error.
    client = get_client()
    existing_profile = instagram_repo.find_profile(client, user_id)

    try:
        short_token, ig_user_id = await service.exchange_code_for_token(code)
    except OAuthError:
        if existing_profile is not None:
            logger.info(
                "Instagram callback re-fired for already-connected user %s — "
                "skipping code exchange",
                user_id,
            )
            return CallbackResponse(
                success=True,
                profile=InstagramProfile.from_model(existing_profile),
            )
        raise
    long_token, expires_in = await service.get_long_lived_token(short_token)

    profile_data = await service.fetch_profile(ig_user_id, long_token)
    media_list = await service.fetch_media(ig_user_id, long_token)

    encrypted_token = encrypt_token(long_token, settings.jwt_secret_key)
    token_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).replace(tzinfo=None)

    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    background_tasks.add_task(
        _run_insights_sync, user_id, ig_user_id, long_token, INSIGHTS_INITIAL_FETCH_DAYS,
    )

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

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()
    ig_user_id = ig_profile.ig_user_id

    total = instagram_repo.count_media(client, user_id, ig_user_id)
    media_models = instagram_repo.find_media_page(client, user_id, ig_user_id, page_size, offset)
    items = [InstagramMedia.from_model(m) for m in media_models]

    return MediaListResponse(items=items, total=total)


@router.get("/media/{ig_media_id}/image")
async def get_media_image(
    ig_media_id: str,
    current_user: User = Depends(get_current_user),
):
    """Proxy a stored media thumbnail/image through our own origin.

    The browser can't reliably render Instagram CDN URLs directly: content/
    tracker blockers reject *.cdninstagram.com (it's the Facebook CDN) and
    cross-origin/referrer rules can leave the bare <img> blank. Streaming the
    bytes from here makes it a same-origin request that those blocks don't
    touch. We only fetch a URL already stored for THIS user's media (looked up
    by id, never an arbitrary URL from the caller), so this is not an open proxy.
    """
    client = get_client()
    rows = client.query(
        GET_MEDIA_IMAGE_URL,
        parameters={"user_id": str(current_user.id), "ig_media_id": ig_media_id},
    ).result_rows
    if not rows:
        raise EntityNotFoundError("Media not found")
    thumbnail_url, media_url = rows[0]
    url = thumbnail_url or media_url
    if not url:
        raise EntityNotFoundError("Media has no image URL")

    try:
        content, content_type = await service.fetch_image(url)
    except InstagramAPIError as exc:
        if "403" in str(exc):
            logger.info("CDN URL expired for %s, fetching fresh URL", ig_media_id)
            # URL expired. Fetch fresh URL from Graph API.
            token_data = instagram_repo.find_token(client, str(current_user.id))
            if not token_data:
                raise
            token = decrypt_token(token_data.access_token, settings.jwt_secret_key)
            try:
                fresh_urls = await service.fetch_fresh_media_urls(
                    ig_media_id, token_data.ig_user_id, token
                )
            except InstagramAPIError as refresh_exc:
                if "not found" in str(refresh_exc):
                    logger.warning("Media %s deleted or too old to refresh URL", ig_media_id)
                    raise HTTPException(status_code=404, detail="Image unavailable")
                raise
            
            new_media_url = fresh_urls.get("media_url", "")
            new_thumb_url = fresh_urls.get("thumbnail_url", "")
            if not new_media_url and not new_thumb_url:
                raise EntityNotFoundError("Fresh media has no image URL")

            instagram_repo.update_media_urls(
                client, str(current_user.id), ig_media_id, new_media_url, new_thumb_url,
            )
            url = new_thumb_url or new_media_url
            content, content_type = await service.fetch_image(url)
        else:
            raise

    # Private + cacheable: the bytes are user-scoped but immutable for the URL's
    # lifetime, so let the browser cache them rather than re-proxy on every render.
    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.post("/purge", response_model=PurgeResponse)
def purge_my_data(
    synth_only: bool = Query(
        False,
        description="If true, only delete rows tagged with the legacy "
                    "scripts/seed_synthetic_* markers (ig_media_id startsWith "
                    "'synth_media_', ig_comment_id startsWith 'synth_', "
                    "comment_sentiment.model='synthetic_v1', "
                    "comment_topics.cluster_id >= 9000). Real synced rows are "
                    "preserved. Use this to clean up leftover demo data "
                    "without forcing a full re-sync.",
    ),
    current_user: User = Depends(get_current_user),
):
    """Delete stored Instagram data for the connected account.

    Default (``synth_only=false``): wipes every row in ``instagram_media``,
    ``media_insights``, ``account_insights``, ``demographic_insights``,
    ``post_hashtags``, ``instagram_comments``, ``comment_sentiment``, and
    ``comment_topics`` bounded to the authenticated user's
    ``(user_id, ig_user_id)``. The profile + token row is preserved (no
    re-OAuth) and competitor handles are untouched. After this, run
    ``/refresh`` + ``/insights/sync`` to rebuild from Meta.

    Synth-only mode: surgical cleanup of demo rows seeded by the now-removed
    ``seed_synthetic_*`` scripts. Real synced data is left in place.
    """
    client = get_client()
    user_id = str(current_user.id)

    if synth_only:
        # No ig_user_id needed — markers identify the rows directly.
        result = instagram_repo.purge_synthetic_data(client, user_id)
        ig_profile = instagram_repo.find_profile(client, user_id)
        return PurgeResponse(
            success=True,
            ig_user_id=ig_profile.ig_user_id if ig_profile else "",
            media_deleted=result["media_deleted"],
        )

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    ig_user_id = ig_profile.ig_user_id
    result = instagram_repo.purge_user_ig_data(client, user_id, ig_user_id)
    return PurgeResponse(
        success=True,
        ig_user_id=ig_user_id,
        media_deleted=result["media_deleted"],
    )


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
    token_expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=DEFAULT_TOKEN_EXPIRY_SECONDS)
    ).replace(tzinfo=None)

    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    logger.info("Instagram data refreshed for user %s", user_id)
    profile = InstagramProfile.from_api_data(user_id, ig_user_id, profile_data)
    return CallbackResponse(success=True, profile=profile)


@router.post("/disconnect")
def disconnect(current_user: User = Depends(get_current_user)):
    """Disconnect the linked Instagram account: delete the stored profile + token.

    Idempotent — returns success even if nothing is connected. Stored media /
    insights are left intact (scoped by ig_user_id); call /purge first to also
    wipe the data. After this the user is back to the not-connected state and
    must re-run the OAuth flow to reconnect.
    """
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        return {"success": True, "ig_user_id": ""}
    instagram_repo.delete_profile(client, user_id, ig_profile.ig_user_id)
    logger.info("Instagram disconnected for user %s (ig: %s)", user_id, ig_profile.ig_user_id)
    return {"success": True, "ig_user_id": ig_profile.ig_user_id}


# --- Insights endpoints ---

_OVERVIEW_METRICS = [
    "views", "reach", "follows_and_unfollows", "total_interactions", "accounts_engaged",
]


def _build_overview(
    client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> OverviewResponse:
    """Loader closure used by both the current and prior-period overview fetches.

    `until` is currently unused at the repo layer (find_account_insights filters
    only on `since`), but is accepted so the signature matches the
    with_comparison contract and future repo changes can apply it.
    """
    rows = insights_repo.find_account_insights(
        client, user_id, ig_user_id, _OVERVIEW_METRICS, since,
    )
    if until is not None:
        rows = [r for r in rows if r.end_time and r.end_time <= until]

    grouped: dict[str, list[InsightDataPoint]] = {m: [] for m in _OVERVIEW_METRICS}
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


@router.get("/insights/overview", response_model=OverviewResponse)
def get_overview(
    days: int = Query(INSIGHTS_LOOKBACK_DAYS, ge=1, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Account-level time-series for the last N days, optionally with a prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    current = _build_overview(client, user_id, ig_profile.ig_user_id, since, until)

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior = _build_overview(
            client, user_id, ig_profile.ig_user_id, prior_since, prior_until,
        )
        current.prior = prior

    return current


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


@router.get(
    "/insights/media/{media_id}/conversion",
    response_model=PostConversionResponse,
)
def get_media_conversion(
    media_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return per-post follower-conversion stats for the PostInsightsDrawer.

    Returns 404 when the post isn't eligible (STORY, no insights, outside the
    365-day lookback). Eligibility constraints match the growth-drivers
    attribution model so the numbers stay consistent across the two surfaces.
    """
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    payload = insights_repo.find_post_conversion(
        client, user_id, ig_profile.ig_user_id, media_id,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail="No conversion data for this media")

    return PostConversionResponse(
        ig_media_id=media_id,
        non_follower_reach=payload["non_follower_reach"],
        attributed_follows=payload["attributed_follows"],
        conversion_rate_pct=payload["conversion_rate_pct"],
    )


async def _run_insights_sync(
    user_id: str,
    ig_user_id: str,
    token: str,
    lookback_days: int = INSIGHTS_LOOKBACK_DAYS,
    purge: bool = False,
) -> None:
    """Background task: full insights sync for one user over the last `lookback_days`.

    When `purge=True`, deletes existing account_insights rows in the window before
    re-fetching. Use this to clean up legacy rows (e.g. pre-refactor 'views' snapshots
    stamped at end_time=now() that double-count under sumIf).
    """
    client = get_client()
    now = datetime.now(timezone.utc)
    since_ts = int((now - timedelta(days=lookback_days)).timestamp())
    until_ts = int(now.timestamp())
    since_dt = datetime.fromtimestamp(since_ts, tz=timezone.utc).replace(tzinfo=None)

    if purge:
        try:
            insights_repo.purge_account_insights_window(
                client, user_id, ig_user_id, since_dt,
            )
        except Exception:
            logger.exception("Background sync: purge failed for user %s", user_id)

    # Account insights
    try:
        raw_insights = await service.fetch_account_insights(ig_user_id, token, since_ts, until_ts)
        account_rows: list[dict] = []
        for metric_entry in raw_insights:
            metric_name = metric_entry.get("name", "")
            for point in metric_entry.get("values", []):
                try:
                    parsed = datetime.fromisoformat(
                        point["end_time"].replace("Z", "+00:00")
                    )
                    # Anchor every metric to NOON UTC of its calendar date. The
                    # ClickHouse server runs in a non-UTC zone (IST) and
                    # clickhouse-connect interprets naive inserts as server-local,
                    # shifting them ~5.5h on the round-trip. Metrics stamped at
                    # midnight UTC (views/interactions via total_value) were pushed
                    # back across the date boundary while reach (stamped ~07:00 by
                    # Meta's time_series) stayed put — so the same logical day split
                    # onto two calendar dates and the dashboard could never line
                    # reach up with views/interactions. Noon keeps the inevitable
                    # tz shift comfortably within the same date.
                    day = (
                        parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed
                    ).date()
                    end_time = datetime(day.year, day.month, day.day, 12, 0, 0)
                    account_rows.append({
                        "metric_name": metric_name,
                        "metric_value": int(point.get("value", 0)),
                        "end_time": end_time,
                    })
                except (KeyError, ValueError, TypeError):
                    # Meta occasionally returns nested dicts for total_value
                    # breakdown metrics or omits end_time — skip the offending
                    # point rather than aborting the whole account-insights phase.
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
    stale_media: list[tuple[str, str]] = []
    try:
        stale_media = insights_repo.find_media_needing_sync(client, user_id, ig_user_id)
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

    # Tier 2 / F4: comment sync. We piggyback on the stale_media list so the
    # cadence matches per-media insight refresh (24h default). Skip stories
    # because /comments isn't supported on STORY media, and skip media types
    # that have no comments (the API would return [] anyway, just saves a call).
    try:
        comments_total = 0
        comment_eligible = [
            (mid, mpt) for mid, mpt in stale_media if mpt in ("FEED", "REELS")
        ]
        for ig_media_id, _mpt in comment_eligible:
            try:
                raw_comments = await service.fetch_comments_for_media(ig_media_id, token)
            except Exception:
                logger.warning(
                    "Background sync: comment fetch failed for media %s", ig_media_id,
                )
                continue
            if not raw_comments:
                continue
            # Adapt the raw payload to the repo's expected shape.
            comments_for_repo = [
                {
                    "id": c.get("id", ""),
                    "_parent_id": c.get("_parent_id", ""),
                    "username": c.get("username", ""),
                    "text": c.get("text", "") or "",
                    "like_count": c.get("like_count", 0),
                    "timestamp": c.get("timestamp", ""),
                }
                for c in raw_comments
                if c.get("id")
            ]
            if comments_for_repo:
                try:
                    inserted = comment_repo.bulk_insert_comments(
                        client, user_id, ig_media_id, comments_for_repo,
                    )
                    comments_total += inserted
                except Exception:
                    logger.warning(
                        "Background sync: comment insert failed for media %s — "
                        "instagram_comments table missing?", ig_media_id,
                    )
        if comments_total:
            logger.info(
                "Background sync: %d comments synced across %d media for user %s",
                comments_total, len(comment_eligible), user_id,
            )
    except Exception:
        logger.exception("Background sync: comment sync failed for user %s", user_id)


@router.post("/insights/sync", response_model=SyncResponse)
async def sync_insights(
    background_tasks: BackgroundTasks,
    lookback_days: int = Query(
        INSIGHTS_LOOKBACK_DAYS,
        ge=1,
        le=INSIGHTS_MAX_LOOKBACK_DAYS,
        description="How many days back to sync. Meta retains ~90 days of historical account "
                    "insights; longer windows are mostly useful for refreshing ClickHouse from "
                    "what is still in Meta's retention.",
    ),
    purge: bool = Query(
        False,
        description="If true, delete existing account_insights rows in the window before "
                    "re-fetching. Use once to clean up legacy 'views' snapshots that inflate "
                    "sumIf totals after the per-day storage refactor.",
    ),
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
    background_tasks.add_task(
        _run_insights_sync,
        user_id, token_data.ig_user_id, token, lookback_days, purge,
    )

    logger.info("Insights sync queued for user %s", user_id)
    return SyncResponse(
        success=True,
        account_metrics_synced=0,
        media_insights_synced=0,
        demographics_synced=False,
        message="Sync started in background",
    )


def _build_dashboard_summary(
    client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime,
    top_n: int,
    period_days: int,
) -> DashboardSummary:
    """Loader for /insights/dashboard. Pulled out so compare_to can reuse it."""
    params = {"user_id": user_id, "ig_user_id": ig_user_id, "since": since, "until": until}
    summary_rows = client.query(GET_DASHBOARD_SUMMARY, parameters=params).result_rows
    growth_rows = client.query(GET_FOLLOWER_GROWTH, parameters=params).result_rows
    top_rows = client.query(
        GET_TOP_PERFORMING_MEDIA,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until,
            "limit": top_n,
        },
    ).result_rows

    sv = summary_rows[0] if summary_rows else (0, 0, 0, 0)
    gv = growth_rows[0] if growth_rows else (0,)

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
        period_days=period_days,
        total_views=int(sv[0]),
        total_reach=int(sv[1]),
        total_interactions=int(sv[2]),
        total_accounts_engaged=int(sv[3]),
        net_follower_growth=int(gv[0]),
        top_posts=top_posts,
    )


#: Scalar fields on DashboardSummary that the FE renders with
#: ComparisonMetricPill. Pinned here so the comparisons map keys stay in sync
#: with the model definition. Each tuple is (FE-facing field, source metric
#: name in account_insights). `net_follower_growth` maps to `follows_and_unfollows`
#: because the dashboard sums that signed metric.
_DASHBOARD_METRIC_FIELDS: tuple[tuple[str, str], ...] = (
    ("total_views", "views"),
    ("total_reach", "reach"),
    ("total_interactions", "total_interactions"),
    ("total_accounts_engaged", "accounts_engaged"),
    ("net_follower_growth", "follows_and_unfollows"),
)


def _build_dashboard_comparisons(
    current: DashboardSummary,
    prior: DashboardSummary,
    current_samples: dict[str, list[float]] | None = None,
    prior_samples: dict[str, list[float]] | None = None,
) -> dict[str, ComparisonValue]:
    """Build per-metric ComparisonValue from two DashboardSummary instances.

    When per-day sample lists are provided, run Welch's t on the daily values
    so `significant` reflects whether the shift is meaningful given each
    window's variance. Falls back to `significant=None` if samples are missing.
    """
    out: dict[str, ComparisonValue] = {}
    for field, source_metric in _DASHBOARD_METRIC_FIELDS:
        cur_val = float(getattr(current, field))
        prior_val = float(getattr(prior, field))
        significant: bool | None = None
        if current_samples and prior_samples:
            significant = sample_significance(
                current_samples.get(source_metric, []),
                prior_samples.get(source_metric, []),
            )
        out[field] = ComparisonValue(
            current=cur_val,
            prior=prior_val,
            delta_pct=pct_delta(cur_val, prior_val),
            significant=significant,
        )
    return out


@router.get("/insights/dashboard", response_model=DashboardSummary)
def get_dashboard(
    days: int = Query(INSIGHTS_LOOKBACK_DAYS, ge=1, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    top_n: int = Query(5, ge=1, le=20),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Pre-aggregated dashboard summary, optionally with a prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    current = _build_dashboard_summary(
        client, user_id, ig_profile.ig_user_id, since, until, top_n, days,
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        # Approximate period_days for the prior window so the FE can label it.
        prior_period_days = max(1, (prior_until - prior_since).days)
        prior = _build_dashboard_summary(
            client, user_id, ig_profile.ig_user_id,
            prior_since, prior_until, top_n, prior_period_days,
        )
        # Per-day samples drive Welch's t significance on each metric pill.
        sample_metrics = [src for _, src in _DASHBOARD_METRIC_FIELDS]
        current_samples = insights_repo.find_daily_metric_samples(
            client, user_id, ig_profile.ig_user_id, sample_metrics, since, until,
        )
        prior_samples = insights_repo.find_daily_metric_samples(
            client, user_id, ig_profile.ig_user_id,
            sample_metrics, prior_since, prior_until,
        )
        current.prior = prior
        current.comparisons = _build_dashboard_comparisons(
            current, prior, current_samples, prior_samples,
        )

    return current


@router.get("/insights/format-breakdown", response_model=FormatBreakdownResponse)
def get_format_breakdown(
    days: int = Query(90, ge=1, le=365),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Per-format aggregate performance, optionally with a prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_format_breakdown(
        client, user_id, ig_profile.ig_user_id, since, until,
    )
    response = FormatBreakdownResponse(
        period_days=days,
        data=[FormatBreakdownItem(**r) for r in rows],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_format_breakdown(
            client, user_id, ig_profile.ig_user_id, prior_since, prior_until,
        )
        response.prior = FormatBreakdownResponse(
            period_days=max(1, (prior_until - prior_since).days),
            data=[FormatBreakdownItem(**r) for r in prior_rows],
        )

    return response


@router.get("/insights/best-time", response_model=BestTimeResponse)
def get_best_time_to_post(
    days: int = Query(90, ge=1, le=365),
    min_sample: int = Query(3, ge=1, le=20),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Engagement heatmap across day-of-week × hour-of-day, with optional comparison."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_best_time_to_post(
        client, user_id, ig_profile.ig_user_id, since, min_sample, until,
    )
    format_rows = insights_repo.find_best_time_by_format(
        client, user_id, ig_profile.ig_user_id, since, min_sample, until,
    )
    response = BestTimeResponse(
        period_days=days,
        min_sample=min_sample,
        data=[BestTimeSlot(**r) for r in rows],
        by_format=[BestTimeByFormatSlot(**r) for r in format_rows],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_best_time_to_post(
            client, user_id, ig_profile.ig_user_id, prior_since, min_sample, prior_until,
        )
        prior_format_rows = insights_repo.find_best_time_by_format(
            client, user_id, ig_profile.ig_user_id, prior_since, min_sample, prior_until,
        )
        response.prior = BestTimeResponse(
            period_days=max(1, (prior_until - prior_since).days),
            min_sample=min_sample,
            data=[BestTimeSlot(**r) for r in prior_rows],
            by_format=[BestTimeByFormatSlot(**r) for r in prior_format_rows],
        )

    return response


def _build_algorithm_metrics(
    client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime,
    limit: int,
    period_days: int,
) -> AlgorithmMetricsResponse:
    posts_raw = insights_repo.find_algorithm_metrics_posts(
        client, user_id, ig_user_id, since, limit, until,
    )
    summary_raw = insights_repo.find_algorithm_metrics_summary(
        client, user_id, ig_user_id, since, until,
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
        period_days=period_days,
        summary=AlgorithmMetricsSummary(**summary_raw),
        posts=posts,
    )


def _build_algorithm_comparisons(
    current: AlgorithmMetricsResponse,
    prior: AlgorithmMetricsResponse,
    cur_post_samples: dict[str, list[float]] | None = None,
    prior_post_samples: dict[str, list[float]] | None = None,
) -> dict[str, ComparisonValue]:
    """Per-metric ComparisonValue for the algorithm-metrics summary.

    `account_save_rate` and `account_share_rate` are proportions (X / reach),
    so we run them through a 2-prop z-test. The three count fields
    (total_saves, total_shares, total_reach) get Welch's t-test on the
    per-post sample distributions when available, falling back to delta-only.
    """
    cur = current.summary
    pri = prior.summary
    out: dict[str, ComparisonValue] = {}

    count_metric_map = {
        "total_saves": "saved",
        "total_shares": "shares",
        "total_reach": "reach",
    }
    for field, sample_key in count_metric_map.items():
        cur_val = float(getattr(cur, field))
        prior_val = float(getattr(pri, field))
        significant: bool | None = None
        if cur_post_samples and prior_post_samples:
            significant = sample_significance(
                cur_post_samples.get(sample_key, []),
                prior_post_samples.get(sample_key, []),
            )
        out[field] = ComparisonValue(
            current=cur_val,
            prior=prior_val,
            delta_pct=pct_delta(cur_val, prior_val),
            significant=significant,
        )

    # Rate metrics: the denominator is the account-level total_reach for each
    # period. The counts (saves, shares) come from the same SQL row, so this
    # is mathematically what the 2-prop test was built for.
    rate_pairs = (
        ("account_save_rate", cur.total_saves, pri.total_saves),
        ("account_share_rate", cur.total_shares, pri.total_shares),
    )
    for field, cur_count, prior_count in rate_pairs:
        cur_rate = float(getattr(cur, field))
        prior_rate = float(getattr(pri, field))
        out[field] = ComparisonValue(
            current=cur_rate,
            prior=prior_rate,
            delta_pct=pct_delta(cur_rate, prior_rate),
            significant=rate_significance(
                current_count=float(cur_count),
                current_denom=float(cur.total_reach),
                prior_count=float(prior_count),
                prior_denom=float(pri.total_reach),
            ),
        )
    return out


@router.get("/insights/algorithm-metrics", response_model=AlgorithmMetricsResponse)
def get_algorithm_metrics(
    days: int = Query(30, ge=1, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(20, ge=1, le=50),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Per-post save/share rate + composite algorithm score, with optional comparison."""
    client = get_client()
    user_id = str(current_user.id)

    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    response = _build_algorithm_metrics(
        client, user_id, ig_profile.ig_user_id, since, until, limit, days,
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior = _build_algorithm_metrics(
            client, user_id, ig_profile.ig_user_id,
            prior_since, prior_until, limit,
            max(1, (prior_until - prior_since).days),
        )
        response.prior = prior

        def _post_samples(resp: AlgorithmMetricsResponse) -> dict[str, list[float]]:
            return {
                "saved": [p.saved for p in resp.posts],
                "shares": [p.shares for p in resp.posts],
                "reach": [p.reach for p in resp.posts],
            }

        response.comparisons = _build_algorithm_comparisons(
            response, prior, _post_samples(response), _post_samples(prior),
        )

    return response


@router.get("/stories", response_model=StoriesResponse)
async def get_stories(current_user: User = Depends(get_current_user)):
    """Fetch currently active stories with live insights from the Instagram API.

    Stories are non-critical enrichment data. If the API call fails (e.g. the
    token lost the stories permission, or the account has no active stories),
    we return an empty list rather than propagating a 502 that would break
    whichever page embeds this widget.
    """
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    ig_user_id = token_data.ig_user_id
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    try:
        raw_stories = await service.fetch_active_stories(ig_user_id, token)
    except InstagramAPIError as exc:
        # Stories permission revoked, token expired, or account has no active
        # stories — degrade gracefully rather than crashing the response.
        logger.warning(
            "Stories fetch failed for user %s (returning empty): %s",
            user_id, exc.message,
        )
        return StoriesResponse(stories=[])

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

def _rows_to_reels(rows) -> list[ReelRetentionItem]:
    return [
        ReelRetentionItem(
            ig_media_id=r[0], permalink=r[1], caption_preview=r[2] or "",
            timestamp=str(r[3]), avg_watch_time=float(r[4]),
            total_view_time=float(r[5]), reach=float(r[6]), views=float(r[7]),
            skip_rate=float(r[8]), estimated_avg_duration_sec=float(r[9]),
            hook_strength_pct=float(r[10]), estimated_replay_rate=float(r[11]),
        )
        for r in rows
    ]


@router.get("/insights/reels-retention", response_model=ReelsRetentionResponse)
def get_reels_retention(
    days: int = Query(90, ge=7, le=365),
    limit: int = Query(50, ge=1, le=100),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Per-Reel retention metrics, with optional prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_reels_retention(
        client, user_id, ig_profile.ig_user_id, since, limit, until,
    )
    response = ReelsRetentionResponse(period_days=days, reels=_rows_to_reels(rows))

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_reels_retention(
            client, user_id, ig_profile.ig_user_id, prior_since, limit, prior_until,
        )
        response.prior = ReelsRetentionResponse(
            period_days=max(1, (prior_until - prior_since).days),
            reels=_rows_to_reels(prior_rows),
        )

    return response


def _rows_to_trend(rows) -> list[ReelsTrendPoint]:
    return [
        ReelsTrendPoint(
            week_start=str(r[0]), reels_count=int(r[1]),
            avg_hook_strength_pct=float(r[2]), avg_watch_time_sec=float(r[3]),
            avg_reach=float(r[4]), avg_views=float(r[5]),
        )
        for r in rows
    ]


@router.get("/insights/reels-retention/trend", response_model=ReelsTrendResponse)
def get_reels_retention_trend(
    days: int = Query(180, ge=30, le=730),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Weekly Reels hook-strength trend, with optional prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_reels_retention_trend(
        client, user_id, ig_profile.ig_user_id, since, until,
    )
    response = ReelsTrendResponse(period_days=days, trend=_rows_to_trend(rows))

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_reels_retention_trend(
            client, user_id, ig_profile.ig_user_id, prior_since, prior_until,
        )
        response.prior = ReelsTrendResponse(
            period_days=max(1, (prior_until - prior_since).days),
            trend=_rows_to_trend(prior_rows),
        )

    return response


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
    """Follower growth spikes flagged for suspicious activity.

    Tier 2 / F5.5: each spike also carries `candidate_drivers` — posts in the
    same-day or +1d window that likely drove the gain, ordered by attributed
    follower share. Empty list when no eligible posts are found.
    """
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_follower_spikes(
        client, user_id, ig_profile.ig_user_id, since, threshold,
    )

    # Build the spikes list first so we can pass (date, follows_change) pairs
    # to the attribution helper in one shot. r[0] from the SQL is a DateTime
    # (toDate would lose the field name) — normalise to a date for the helper.
    pairs: list[tuple] = []
    for r in rows:
        spike_dt = r[0]
        spike_date = spike_dt.date() if hasattr(spike_dt, "date") else spike_dt
        pairs.append((spike_date, int(r[1])))

    drivers_by_date: dict[str, list[dict]] = {}
    try:
        drivers_by_date = insights_repo.find_candidate_drivers_for_spikes(
            client, user_id, ig_profile.ig_user_id, pairs,
        )
    except Exception:
        # Attribution is non-essential — if the query fails (e.g. the
        # post_hashtags / media_insights tables are missing on a fresh deploy),
        # still return the spike list without drivers so the chart renders.
        logger.exception(
            "Spike candidate-driver attribution failed for user %s", user_id,
        )

    spikes: list[FollowerSpike] = []
    for r in rows:
        spike_dt = r[0]
        spike_date = spike_dt.date() if hasattr(spike_dt, "date") else spike_dt
        date_key = spike_date.isoformat() if hasattr(spike_date, "isoformat") else str(spike_date)
        driver_dicts = drivers_by_date.get(date_key, [])
        spikes.append(FollowerSpike(
            spike_date=str(r[0]),
            follows_change=int(r[1]),
            interactions=int(r[2]),
            interaction_per_follow_ratio=float(r[3]),
            is_suspicious=bool(r[4]),
            candidate_drivers=[GrowthDriverItem(**d) for d in driver_dicts],
        ))

    return FollowerSpikesResponse(
        period_days=days, spike_threshold=threshold, spikes=spikes,
    )


# --- Phase 7: Drill-Down APIs ---

@router.get("/insights/format-breakdown/posts", response_model=FormatBreakdownPostsResponse)
def get_format_breakdown_posts(
    format: Literal["FEED", "REELS", "STORY"] = Query(
        ..., description="Content format: FEED, REELS, or STORY",
    ),
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
    rows = insights_repo.find_format_breakdown_posts(
        client, user_id, ig_profile.ig_user_id, since, format, limit,
    )

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
    rows = insights_repo.find_best_time_posts(
        client, user_id, ig_profile.ig_user_id, since, day, hour,
    )

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


# =====================================================================
# Tier 2 endpoints — all share the same `days` + optional `compare_to`
# parameter convention defined in tier2_implementation_plan_overview.md.
# =====================================================================

# --- Tier 2 / F5: Audience Growth Drivers ---

@router.get("/insights/growth-drivers", response_model=GrowthDriversResponse)
def get_growth_drivers(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(10, ge=1, le=50),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Top posts ranked by attributed follower acquisition over the period.

    Conservative attribution: same-day or +1d post → daily follower gain
    proportional to non-follower reach (falling back to total reach).
    """
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_growth_drivers(
        client, user_id, ig_profile.ig_user_id, since, limit, until,
    )
    response = GrowthDriversResponse(
        period_days=days,
        drivers=[GrowthDriverItem(**r) for r in rows],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_growth_drivers(
            client, user_id, ig_profile.ig_user_id, prior_since, limit, prior_until,
        )
        response.prior = GrowthDriversResponse(
            period_days=max(1, (prior_until - prior_since).days),
            drivers=[GrowthDriverItem(**r) for r in prior_rows],
        )

    return response


@router.get("/insights/growth-correlation", response_model=GrowthCorrelationResponse)
def get_growth_correlation(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Daily pairs of follows vs non-follower reach + Pearson r.

    Powers the scatter chart on AudienceDNAPage that lets users *see* whether
    high-reach days actually align with follower gains, rather than reading
    only the per-post attribution table.
    """
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    payload = insights_repo.find_growth_correlation(
        client, user_id, ig_profile.ig_user_id, since, until,
    )
    response = GrowthCorrelationResponse(
        period_days=days,
        points=[GrowthCorrelationPoint(**p) for p in payload["points"]],
        correlation=payload["correlation"],
        uses_non_follower_reach=payload["uses_non_follower_reach"],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_payload = insights_repo.find_growth_correlation(
            client, user_id, ig_profile.ig_user_id, prior_since, prior_until,
        )
        response.prior = GrowthCorrelationResponse(
            period_days=max(1, (prior_until - prior_since).days),
            points=[GrowthCorrelationPoint(**p) for p in prior_payload["points"]],
            correlation=prior_payload["correlation"],
            uses_non_follower_reach=prior_payload["uses_non_follower_reach"],
        )

    return response


# --- Tier 2 / F2: Hashtag Performance ---

def _hashtag_trend_rows_to_points(rows: list[dict]) -> list[HashtagTrendPoint]:
    return [
        HashtagTrendPoint(
            week_start=str(r["week_start"]),
            posts_used=int(r["posts_used"]),
            avg_reach=float(r["avg_reach"] or 0),
            avg_engagement_rate_pct=float(r["avg_engagement_rate_pct"] or 0),
        )
        for r in rows
    ]


@router.get("/insights/hashtags", response_model=HashtagsResponse)
def get_top_hashtags(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(30, ge=1, le=100),
    min_uses: int = Query(2, ge=1, le=20),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Top hashtags by average engagement rate, optionally with a prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()
    ig_user_id = ig_profile.ig_user_id

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_top_hashtags(
        client, user_id, ig_user_id, since, limit, min_uses, until,
    )
    response = HashtagsResponse(
        period_days=days,
        data=[HashtagPerformanceItem(**r) for r in rows],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_top_hashtags(
            client, user_id, ig_user_id, prior_since, limit, min_uses, prior_until,
        )
        response.prior = HashtagsResponse(
            period_days=max(1, (prior_until - prior_since).days),
            data=[HashtagPerformanceItem(**r) for r in prior_rows],
        )

    return response


@router.get("/insights/hashtags/trend", response_model=HashtagTrendResponse)
def get_hashtag_trend(
    tag: str = Query(..., min_length=1, max_length=100),
    days: int = Query(180, ge=30, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Weekly engagement trend for one hashtag, with optional prior-period overlay."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()
    ig_user_id = ig_profile.ig_user_id

    lowered = tag.lower()
    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_hashtag_trend(
        client, user_id, ig_user_id, lowered, since, until,
    )
    response = HashtagTrendResponse(
        tag=lowered,
        period_days=days,
        data=_hashtag_trend_rows_to_points(rows),
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_hashtag_trend(
            client, user_id, ig_user_id, lowered, prior_since, prior_until,
        )
        response.prior = HashtagTrendResponse(
            tag=lowered,
            period_days=max(1, (prior_until - prior_since).days),
            data=_hashtag_trend_rows_to_points(prior_rows),
        )

    return response


@router.get("/insights/hashtags/combos", response_model=HashtagComboResponse)
def get_hashtag_combos(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    min_uses: int = Query(2, ge=2, le=20),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Top co-occurring hashtag pairs, with optional prior-period comparison."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()
    ig_user_id = ig_profile.ig_user_id

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    rows = insights_repo.find_hashtag_combos(
        client, user_id, ig_user_id, since, min_uses, until,
    )
    response = HashtagComboResponse(
        period_days=days,
        data=[HashtagComboItem(**r) for r in rows],
    )

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        prior_rows = insights_repo.find_hashtag_combos(
            client, user_id, ig_user_id, prior_since, min_uses, prior_until,
        )
        response.prior = HashtagComboResponse(
            period_days=max(1, (prior_until - prior_since).days),
            data=[HashtagComboItem(**r) for r in prior_rows],
        )

    return response


# --- Tier 2 / F4: Comment Sentiment ---

def _build_sentiment_summary(
    client,
    user_id: str,
    since: datetime,
    until: datetime,
    period_days: int,
) -> SentimentSummaryResponse:
    """Loader for /insights/sentiment, reused by the compare_to branch."""
    distribution = insights_repo.find_sentiment_distribution(
        client, user_id, since, until,
    )
    trend_rows = insights_repo.find_sentiment_trend(client, user_id, since, until)
    return SentimentSummaryResponse(
        period_days=period_days,
        total=sum(distribution.values()),
        distribution=SentimentDistribution(**distribution),
        trend=[SentimentTrendPoint(**r) for r in trend_rows],
    )


@router.get("/insights/sentiment", response_model=SentimentSummaryResponse)
def get_sentiment_summary(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    compare_to: str | None = Query(None, pattern=COMPARE_TO_PATTERN),
    current_user: User = Depends(get_current_user),
):
    """Overall sentiment distribution + weekly trend, with optional comparison."""
    client = get_client()
    user_id = str(current_user.id)
    if instagram_repo.find_profile(client, user_id) is None:
        raise InstagramNotConnectedError()

    until = datetime.now(timezone.utc).replace(tzinfo=None)
    since = until - timedelta(days=days)
    since, until = resolve_current_window(compare_to, since, until)
    # Calendar presets (MTD/YTD) override the caller's window — recompute
    # `days` so response.period_days reflects what we actually queried.
    days = max(1, (until - since).days)
    response = _build_sentiment_summary(client, user_id, since, until, days)

    win = resolve_compare_window(compare_to, since, until)
    if win is not None:
        prior_since, prior_until = win
        response.prior = _build_sentiment_summary(
            client, user_id, prior_since, prior_until,
            max(1, (prior_until - prior_since).days),
        )

    return response


@router.get("/insights/sentiment/topics", response_model=TopicsResponse)
def get_topics(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Top topic clusters as labelled by the weekly topic_clustering job."""
    client = get_client()
    user_id = str(current_user.id)
    if instagram_repo.find_profile(client, user_id) is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_topics(client, user_id, since)
    topics = [TopicItem(**r) for r in rows]
    return TopicsResponse(period_days=days, topics=topics)


@router.get("/insights/sentiment/questions", response_model=QuestionPostsResponse)
def get_question_posts(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
):
    """Posts ranked by question-comment count — FAQ content opportunities."""
    client = get_client()
    user_id = str(current_user.id)
    if instagram_repo.find_profile(client, user_id) is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_question_posts(client, user_id, since, limit)
    posts = [QuestionPostItem(**r) for r in rows]
    return QuestionPostsResponse(period_days=days, posts=posts)


@router.get("/insights/sentiment/media/{media_id}", response_model=MediaSentimentResponse)
def get_media_sentiment(
    media_id: str,
    current_user: User = Depends(get_current_user),
):
    """Per-post sentiment distribution + representative samples per bucket."""
    client = get_client()
    user_id = str(current_user.id)
    if instagram_repo.find_profile(client, user_id) is None:
        raise InstagramNotConnectedError()

    distribution = insights_repo.find_media_sentiment_distribution(
        client, user_id, media_id,
    )
    total = sum(distribution.values())
    samples = insights_repo.find_media_sentiment_samples(client, user_id, media_id)
    return MediaSentimentResponse(
        ig_media_id=media_id,
        total=total,
        distribution=SentimentDistribution(**distribution),
        samples=[SentimentSampleComment(**s) for s in samples],
    )


@router.get(
    "/insights/sentiment/diagnose",
    response_model=SentimentDiagnoseResponse,
)
def diagnose_sentiment(current_user: User = Depends(get_current_user)):
    """Explain why Audience Voice may be empty.

    Compares ClickHouse-stored comment count against Meta's reported
    `comments_count` across the user's media. The most common cause of an
    empty Voice section is Meta silently dropping comment payloads when
    the app hasn't been approved for Advanced Access on
    `instagram_business_manage_comments`.
    """
    client = get_client()
    user_id = str(current_user.id)
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        return SentimentDiagnoseResponse(
            ig_comments_total=0,
            stored_comments=0,
            stored_sentiment=0,
            stored_topics=0,
            status="not_connected",
            reason="No Instagram account connected.",
        )

    ig_total_rows = client.query(
        COUNT_IG_COMMENTS_FROM_MEDIA,
        parameters={"user_id": user_id, "ig_user_id": profile.ig_user_id},
    ).result_rows
    ig_total = int(ig_total_rows[0][0] or 0) if ig_total_rows else 0

    stored_comments = int(client.query(
        COUNT_STORED_COMMENTS,
        parameters={"user_id": user_id},
    ).result_rows[0][0] or 0)
    stored_sentiment = int(client.query(
        COUNT_STORED_COMMENT_SENTIMENT,
        parameters={"user_id": user_id},
    ).result_rows[0][0] or 0)
    stored_topics = int(client.query(
        COUNT_STORED_COMMENT_TOPICS,
        parameters={"user_id": user_id},
    ).result_rows[0][0] or 0)

    if stored_comments > 0:
        status = "ok"
        reason = "Comments synced and ready."
    elif ig_total > 0:
        status = "scope_blocked"
        reason = (
            f"Your posts have {ig_total} comments on Instagram, but Meta is not "
            "returning the comment data to this app. This happens when "
            "instagram_business_manage_comments is in Standard Access. "
            "Add yourself as a test user in your Meta app, or submit for "
            "Advanced Access via App Review."
        )
    else:
        status = "no_data"
        reason = "Your posts have zero comments. Nothing to analyse yet."

    return SentimentDiagnoseResponse(
        ig_comments_total=ig_total,
        stored_comments=stored_comments,
        stored_sentiment=stored_sentiment,
        stored_topics=stored_topics,
        status=status,
        reason=reason,
    )


@router.post("/insights/sentiment/seed-demo", response_model=SeedDemoResponse)
def seed_sentiment_demo(current_user: User = Depends(get_current_user)):
    """Seed synthetic comments + sentiment + topics for the Audience Voice
    section. All rows are tagged with `synthetic_v1` / `synth_` markers so
    `/purge?synth_only=true` can clean them up later.

    Intended for users whose Meta app hasn't been approved for Advanced
    Access on `instagram_business_manage_comments` and therefore can't see
    real comment data flowing through.
    """
    user_id = str(current_user.id)
    counts = seed_demo_sentiment.seed_for_user(user_id)
    logger.info(
        "seed_sentiment_demo: user %s seeded %s",
        user_id, counts,
    )
    return SeedDemoResponse(**counts)


# --- Tier 2 / F3: Competitor Benchmarking ---

def _compute_self_snapshot(client, user_id: str) -> SelfSnapshot | None:
    """Build a SelfSnapshot from the user's own profile + last 25 posts.

    Engagement is computed the competitor way — (likes + comments) / followers —
    so the side-by-side comparison stays apples-to-apples.
    """
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        return None

    posts = insights_repo.find_self_last_25_posts(client, user_id, profile.ig_user_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    seven_days_ago = now - timedelta(days=7)

    likes = [int(p[3] or 0) for p in posts]
    comments = [int(p[4] or 0) for p in posts]
    posts_last_7d = sum(1 for p in posts if p[2] and p[2] >= seven_days_ago)
    reels_last_7d = sum(
        1 for p in posts
        if p[2] and p[2] >= seven_days_ago and (p[1] or "") == "REELS"
    )
    carousels_last_7d = sum(
        1 for p in posts
        if p[2] and p[2] >= seven_days_ago and (p[0] or "") == "CAROUSEL_ALBUM"
    )

    followers = profile.followers_count or 0
    avg_likes = sum(likes) / len(likes) if likes else 0.0
    avg_comments = sum(comments) / len(comments) if comments else 0.0
    if followers > 0 and posts:
        per_post = [(l + c) / followers * 100.0 for l, c in zip(likes, comments)]
        avg_er = sum(per_post) / len(per_post)
    else:
        avg_er = 0.0

    return SelfSnapshot(
        followers_count=followers,
        media_count=profile.media_count or 0,
        posts_last_7d=posts_last_7d,
        reels_last_7d=reels_last_7d,
        carousels_last_7d=carousels_last_7d,
        avg_likes_last_25=float(avg_likes),
        avg_comments_last_25=float(avg_comments),
        avg_engagement_rate_pct=float(avg_er),
    )


@router.get("/competitors/lookup", response_model=CompetitorLookupPreview)
async def lookup_competitor(
    handle: str = Query(..., min_length=1, max_length=30, pattern=r"^[A-Za-z0-9._]+$"),
    current_user: User = Depends(get_current_user),
):
    """Live Instagram lookup for the add-competitor preview.

    Hits Meta's Business Discovery API using the authenticated user's token and
    returns a profile preview *without* writing to ClickHouse. Returns 404 if
    Instagram rejects the lookup (handle not found, private, or personal
    account). Used by the AddCompetitorDialog to confirm the handle exists on
    Instagram before the user commits to tracking it via POST /competitors.
    """
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    handle_clean = handle.lower()
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    try:
        snap, err = await competitors.fetch_competitor_snapshot(
            token_data.ig_user_id, handle_clean, token,
        )
    except Exception as exc:
        raise InstagramAPIError(
            "Failed to look up the handle on Instagram"
        ) from exc

    if not snap:
        raise HTTPException(
            status_code=404,
            detail=err or "Account not found, or not a public Business or Creator account.",
        )

    return CompetitorLookupPreview(
        handle=handle_clean,
        ig_user_id=str(snap.get("id", "")),
        display_name=snap.get("name") or snap.get("username") or handle_clean,
        username=snap.get("username") or handle_clean,
        profile_picture_url=snap.get("profile_picture_url", "") or "",
        followers_count=int(snap.get("followers_count") or 0),
        media_count=int(snap.get("media_count") or 0),
    )


@router.get("/competitors", response_model=CompetitorListResponse)
def list_competitors(current_user: User = Depends(get_current_user)):
    """List the user's tracked competitor handles + their latest snapshots.

    Each item also carries `consecutive_failures` from the daily sync so the
    FE can render a stale-data indicator before the handle auto-disables at
    `competitor_repo.MAX_CONSECUTIVE_FAILURES`.
    """
    client = get_client()
    user_id = str(current_user.id)

    handles = competitor_repo.list_handles(client, user_id)
    snapshots = competitor_repo.latest_snapshots(client, user_id)
    competitors_out: list[CompetitorItem] = []
    for h in handles:
        snap = snapshots.get(h["handle"])
        latest = CompetitorSnapshot(**snap) if snap else None
        competitors_out.append(
            CompetitorItem(
                handle=h["handle"],
                ig_user_id=h["ig_user_id"],
                display_name=h["display_name"],
                profile_picture_url=h["profile_picture_url"],
                latest_snapshot=latest,
                consecutive_failures=h.get("consecutive_failures", 0),
            )
        )
    return CompetitorListResponse(
        competitors=competitors_out,
        you=_compute_self_snapshot(client, user_id),
    )


@router.post("/competitors", response_model=CompetitorItem)
async def add_competitor(
    payload: AddCompetitorRequest,
    current_user: User = Depends(get_current_user),
):
    """Validate a handle via Business Discovery, persist it, and save an initial snapshot."""
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    if competitor_repo.count_active_handles(client, user_id) >= competitor_repo.MAX_ACTIVE_COMPETITORS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot add more than {competitor_repo.MAX_ACTIVE_COMPETITORS} "
                "active competitors."
            ),
        )

    handle = payload.handle.lower()
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    try:
        snap, err = await competitors.fetch_competitor_snapshot(
            token_data.ig_user_id, handle, token,
        )
    except Exception as exc:
        raise InstagramAPIError(
            "Failed to look up the handle on Instagram"
        ) from exc

    if not snap:
        raise HTTPException(
            status_code=400,
            detail=err or "Account is not a public Business or Creator account.",
        )

    metrics = competitors.derive_snapshot_metrics(snap)
    competitor_repo.upsert_handle(
        client,
        user_id,
        handle,
        ig_user_id=str(snap.get("id", "")),
        display_name=snap.get("name") or snap.get("username") or "",
        profile_picture_url=snap.get("profile_picture_url", "") or "",
    )
    today = datetime.now(timezone.utc).date()
    competitor_repo.insert_snapshot(client, user_id, handle, today, metrics)

    return CompetitorItem(
        handle=handle,
        ig_user_id=str(snap.get("id", "")),
        display_name=snap.get("name") or snap.get("username") or "",
        profile_picture_url=snap.get("profile_picture_url", "") or "",
        latest_snapshot=CompetitorSnapshot(
            handle=handle,
            snapshot_date=today,
            **metrics,
        ),
    )


@router.delete("/competitors/{handle}", status_code=204)
def remove_competitor(
    handle: str,
    current_user: User = Depends(get_current_user),
):
    """Soft-delete (active=0). Snapshot history is preserved."""
    client = get_client()
    user_id = str(current_user.id)
    removed = competitor_repo.soft_delete_handle(client, user_id, handle.lower())
    if not removed:
        raise EntityNotFoundError("Competitor")


@router.get("/competitors/timeline", response_model=CompetitorTimelineResponse)
def get_competitor_timeline(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Daily follower series for every active competitor + the user themselves.

    The "you" series is sourced from `competitor_snapshots` under the reserved
    `handle='you'` written by the daily `competitor_sync` job. If the job
    hasn't run yet, the series falls back to a single point at "today" derived
    from the user's current profile so the chart still renders.
    """
    client = get_client()
    user_id = str(current_user.id)

    # Compute the cutoff as today_utc - days in date space to avoid an
    # off-by-one when the request fires near midnight UTC.
    since_date = datetime.now(timezone.utc).date() - timedelta(days=days)
    snapshot_series = competitor_repo.timeline(client, user_id, since_date)

    series: list[CompetitorTimelineSeries] = []

    # --- Self series ---
    # Prefer snapshot history (one row per day) when the daily job has run.
    # Otherwise fall back to a single "today" point from instagram_profiles so
    # the chart still shows a "You" line on freshly-onboarded accounts.
    self_points = snapshot_series.pop("you", [])
    if self_points:
        series.append(CompetitorTimelineSeries(
            handle="you",
            display_name="You",
            points=[
                CompetitorTimelinePoint(date=d.isoformat(), followers=f)
                for d, f in self_points
            ],
        ))
    else:
        profile = instagram_repo.find_profile(client, user_id)
        if profile is not None:
            series.append(CompetitorTimelineSeries(
                handle="you",
                display_name="You",
                points=[CompetitorTimelinePoint(
                    date=datetime.now(timezone.utc).date().isoformat(),
                    followers=profile.followers_count or 0,
                )],
            ))

    # --- Competitor series ---
    handles = competitor_repo.list_handles(client, user_id)
    display_by_handle = {
        h["handle"]: (h["display_name"] or f"@{h['handle']}") for h in handles
    }
    for handle, points in snapshot_series.items():
        series.append(CompetitorTimelineSeries(
            handle=handle,
            display_name=display_by_handle.get(handle, f"@{handle}"),
            points=[
                CompetitorTimelinePoint(date=d.isoformat(), followers=f)
                for d, f in points
            ],
        ))

    return CompetitorTimelineResponse(period_days=days, series=series)


@router.get("/competitors/content-mix", response_model=ContentMixResponse)
def get_competitor_content_mix(
    days: int = Query(30, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """Reels / Carousel / Image distribution per competitor + the user.

    Accepts up to INSIGHTS_MAX_LOOKBACK_DAYS (365) to match the other Tier 2
    endpoints and the FE's PeriodComparator chip options (7/30/90/180/365).
    """
    client = get_client()
    user_id = str(current_user.id)

    since_dt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    accounts: list[ContentMixAccount] = []

    # Self — scoped to the connected IG account if there is one. The
    # competitor side renders even before the user has connected, so a
    # missing profile just falls through with zeros.
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        self_mix = {"reels": 0.0, "carousel": 0.0, "image": 0.0}
    else:
        self_mix = insights_repo.find_self_content_mix(
            client, user_id, ig_profile.ig_user_id, since_dt,
        )
    accounts.append(ContentMixAccount(
        handle="you",
        display_name="You",
        mix=ContentMixDistribution(**self_mix),
    ))

    # Competitors — derived from the latest snapshot's last-7d counts.
    # We don't have per-post timestamps stored, so we treat the snapshot's
    # last-7d distribution as a proxy for the requested period. As more
    # snapshots accumulate this becomes a true period average.
    handles = competitor_repo.list_handles(client, user_id)
    snapshots = competitor_repo.latest_snapshots(client, user_id)
    for h in handles:
        snap = snapshots.get(h["handle"])
        if not snap:
            continue
        posts_7d = snap.get("posts_last_7d", 0) or 0
        reels_7d = snap.get("reels_last_7d", 0) or 0
        carousels_7d = snap.get("carousels_last_7d", 0) or 0
        image_7d = max(0, posts_7d - reels_7d - carousels_7d)
        total = posts_7d or 1
        accounts.append(ContentMixAccount(
            handle=h["handle"],
            display_name=h["display_name"] or f"@{h['handle']}",
            mix=ContentMixDistribution(
                reels=reels_7d / total,
                carousel=carousels_7d / total,
                image=image_7d / total,
            ),
        ))

    return ContentMixResponse(period_days=days, accounts=accounts)


# --- Tier 2 / F2: Branded Hashtag Tracking ---

@router.get("/branded-hashtags", response_model=BrandedHashtagListResponse)
def list_branded_hashtags(
    days: int = Query(90, ge=7, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    current_user: User = Depends(get_current_user),
):
    """List the user's tracked branded hashtags + aggregated mention counts.

    `mention_count` / `total_likes` / `unique_authors` are scoped to the
    requested `days` window so users can switch the comparator's day chip
    and see "how loud has my brand tag been this week vs. quarter".

    A mention is a comment on one of the user's own posts whose text
    contained the brand tag — NOT a public external post (Instagram Login
    API auth can't reach Meta's hashtag search endpoints).
    """
    client = get_client()
    user_id = str(current_user.id)

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    tags = branded_hashtag_repo.list_branded(client, user_id)
    counts = branded_hashtag_repo.find_mention_counts(client, user_id, since)

    branded = [
        BrandedHashtagItem(
            hashtag=t["hashtag"],
            last_synced_at=(
                str(t["last_synced_at"]) if t.get("last_synced_at") else None
            ),
            mention_count=counts.get(t["hashtag"], {}).get("mention_count", 0),
            total_likes=counts.get(t["hashtag"], {}).get("total_likes", 0),
            unique_authors=counts.get(t["hashtag"], {}).get("unique_authors", 0),
            latest_mention=counts.get(t["hashtag"], {}).get("latest_mention"),
        )
        for t in tags
    ]
    return BrandedHashtagListResponse(period_days=days, branded=branded)


def _run_branded_hashtag_initial_scan(user_id: str, hashtag: str) -> None:
    """Background task: scan the user's stored comment corpus for tag mentions."""
    client = get_client()
    try:
        inserted = branded_hashtag_repo.scan_comments_for_mentions(
            client, user_id, hashtag,
        )
        branded_hashtag_repo.touch_synced_at(client, user_id, hashtag)
        logger.info(
            "branded_hashtag add: user %s tag #%s initial scan -> %d mentions",
            user_id, hashtag, inserted,
        )
    except Exception:
        logger.exception(
            "branded_hashtag add: initial scan failed for user %s tag #%s",
            user_id, hashtag,
        )


@router.post("/branded-hashtags", response_model=BrandedHashtagItem)
def add_branded_hashtag(
    payload: AddBrandedHashtagRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """Track a hashtag. Schedules an initial comment-corpus scan in the
    background so the request returns quickly; the panel populates on next
    poll. The weekly scheduler keeps it fresh after that.
    """
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    if (
        branded_hashtag_repo.count_active(client, user_id)
        >= branded_hashtag_repo.MAX_BRANDED_HASHTAGS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot track more than {branded_hashtag_repo.MAX_BRANDED_HASHTAGS} "
                "branded hashtags."
            ),
        )

    hashtag = payload.hashtag.lower()
    branded_hashtag_repo.upsert_branded(client, user_id, hashtag, "")

    background_tasks.add_task(
        _run_branded_hashtag_initial_scan, user_id, hashtag,
    )

    return BrandedHashtagItem(
        hashtag=hashtag,
        last_synced_at=None,
    )


@router.delete("/branded-hashtags/{hashtag}", status_code=204)
def remove_branded_hashtag(
    hashtag: str,
    current_user: User = Depends(get_current_user),
):
    """Soft-delete (active=0). Mention history is preserved."""
    client = get_client()
    user_id = str(current_user.id)
    branded_hashtag_repo.soft_delete(client, user_id, hashtag.lower())


@router.get(
    "/branded-hashtags/{hashtag}/mentions",
    response_model=BrandedHashtagMentionsResponse,
)
def get_branded_hashtag_mentions(
    hashtag: str,
    days: int = Query(90, ge=1, le=INSIGHTS_MAX_LOOKBACK_DAYS),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """Recent public media that mentioned this tracked hashtag."""
    client = get_client()
    user_id = str(current_user.id)

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = branded_hashtag_repo.find_mentions(
        client, user_id, hashtag.lower(), since, limit,
    )
    return BrandedHashtagMentionsResponse(
        hashtag=hashtag.lower(),
        period_days=days,
        mentions=[BrandedHashtagMention(**r) for r in rows],
    )
