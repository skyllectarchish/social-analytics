"""Instagram Pydantic schemas — request/response models for /api/instagram endpoints."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from ..models.instagram_media import IGMedia
    from ..models.instagram_profile import IGProfile


# --- Tier 2 / F1: Period-over-Period comparison primitives ---

class ComparisonValue(BaseModel):
    """Single scalar metric with optional prior-period comparison.

    Routes that accept `compare_to` populate `prior`, `delta_pct`, and
    `significant`; routes called without `compare_to` leave them None so the
    response is backward-compatible.
    """

    current: float
    prior: float | None = None
    delta_pct: float | None = None
    significant: bool | None = None


class InstagramProfile(BaseModel):
    """Instagram profile data returned to the client."""

    id: str
    ig_user_id: str
    username: str
    name: str
    biography: str
    profile_picture_url: str
    followers_count: int
    follows_count: int
    media_count: int
    connected_at: str

    @classmethod
    def from_model(cls, model: IGProfile) -> InstagramProfile:
        """Construct from an IGProfile domain model."""
        return cls(**model.to_schema_dict())

    @classmethod
    def from_api_data(cls, user_id: str, ig_user_id: str, data: dict) -> InstagramProfile:
        """Construct from raw Instagram API response data (for callback/refresh)."""
        return cls(
            id=user_id,
            ig_user_id=ig_user_id,
            username=data.get("username", ""),
            name=data.get("name", ""),
            biography=data.get("biography", ""),
            profile_picture_url=data.get("profile_picture_url", ""),
            followers_count=data.get("followers_count", 0),
            follows_count=data.get("follows_count", 0),
            media_count=data.get("media_count", 0),
            connected_at="now",
        )


class InstagramMedia(BaseModel):
    """Single Instagram media item returned to the client."""

    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    caption: str
    timestamp: str
    like_count: int
    comments_count: int

    @classmethod
    def from_model(cls, model: IGMedia) -> InstagramMedia:
        """Construct from an IGMedia domain model."""
        return cls(**model.to_schema_dict())


class MediaListResponse(BaseModel):
    """Paginated list of media items."""

    items: list[InstagramMedia]
    total: int


class ConnectResponse(BaseModel):
    """OAuth URL response for the connect flow."""

    oauth_url: str
    state: str  # CSRF token — frontend must store and send back on callback


class CallbackResponse(BaseModel):
    """OAuth callback result."""

    success: bool
    profile: InstagramProfile


# --- Insights schemas ---

class InsightDataPoint(BaseModel):
    """A single time-series data point (e.g., reach=224 on 2025-01-15)."""

    end_time: str
    value: int


class MetricTimeSeries(BaseModel):
    """A named metric with its time-series values."""

    metric_name: str
    data: list[InsightDataPoint]


class OverviewResponse(BaseModel):
    """Response for GET /api/instagram/insights/overview.

    `prior` is populated when the request carries a non-empty `compare_to`
    query param and the comparison window has data; otherwise None. Same
    shape as the top-level fields so the FE can overlay the two series.
    """

    views: MetricTimeSeries
    reach: MetricTimeSeries
    follows_and_unfollows: MetricTimeSeries
    total_interactions: MetricTimeSeries
    accounts_engaged: MetricTimeSeries
    prior: "OverviewResponse | None" = None


class DemographicBreakdown(BaseModel):
    """A single demographic dimension value (e.g., city=Mumbai, value=120)."""

    dimension_value: str
    value: int


class DemographicResponse(BaseModel):
    """Response for GET /api/instagram/insights/demographics."""

    metric_name: str
    breakdown: str  # "age", "gender", "city", or "country"
    data: list[DemographicBreakdown]


class MediaInsightItem(BaseModel):
    """A single metric for a media item (e.g., saved=42)."""

    metric_name: str
    value: float


class MediaInsightsResponse(BaseModel):
    """Response for GET /api/instagram/insights/media/{media_id}."""

    ig_media_id: str
    insights: list[MediaInsightItem]


class SyncResponse(BaseModel):
    """Response for POST /api/instagram/insights/sync."""

    success: bool
    account_metrics_synced: int
    media_insights_synced: int
    demographics_synced: bool
    message: str = ""


class PurgeResponse(BaseModel):
    """Response for POST /api/instagram/purge."""

    success: bool
    ig_user_id: str
    media_deleted: int


# --- Data-export archive import ---

class ArchiveImportResponse(BaseModel):
    """Response for POST /api/instagram/import/archive."""

    posts_imported: int
    stories_imported: int
    followers_imported: int


class ArchiveGrowthPoint(BaseModel):
    month: str                   # ISO date (first of month)
    joins: int
    cumulative: int


class ArchiveContentPoint(BaseModel):
    month: str
    posts: int
    stories: int


class ArchiveSummaryResponse(BaseModel):
    """Response for GET /api/instagram/import/summary."""

    posts: int
    posts_from: str | None = None
    stories: int
    stories_from: str | None = None
    followers: int
    followers_from: str | None = None
    follower_growth: list[ArchiveGrowthPoint] = Field(default_factory=list)
    content_by_month: list[ArchiveContentPoint] = Field(default_factory=list)


# --- Format fatigue ---

class FormatWeekPoint(BaseModel):
    week: str                    # ISO date (Monday of week)
    posts: int
    avg_engagement: float


class FormatFatigueItem(BaseModel):
    format: str                  # REELS | CAROUSEL | IMAGE
    status: str                  # declining | improving | steady
    weeks_analyzed: int
    consecutive: int             # weeks moving in the `status` direction
    change_pct: float | None = None
    message: str
    weekly: list[FormatWeekPoint] = Field(default_factory=list)


class FormatFatigueResponse(BaseModel):
    """Response for GET /api/instagram/insights/format-fatigue."""

    weeks: int
    formats: list[FormatFatigueItem] = Field(default_factory=list)


# --- Comment inbox ---

class InboxComment(BaseModel):
    """One top-level comment in the unified inbox."""

    ig_comment_id: str
    ig_media_id: str
    username: str
    text: str
    like_count: int
    timestamp: str               # ISO-8601
    sentiment: str               # 'positive' | 'neutral' | 'negative' | '' (unscored)
    is_question: bool
    replied: bool                # creator has a reply under this comment
    permalink: str               # post permalink ('' if media row missing)
    is_collab: bool = False      # brand-collab inquiry (LLM flag or keyword heuristic)
    is_superfan: bool = False    # commenter is a repeat engager (see /comments/superfans)


class CommentInboxResponse(BaseModel):
    """Response for GET /api/instagram/comments/inbox."""

    total: int
    comments: list[InboxComment]


class SuperfanItem(BaseModel):
    """One repeat engager — ranked by comment volume across posts."""

    username: str
    comment_count: int
    posts_touched: int
    total_likes: int
    last_comment_at: str         # ISO-8601
    avg_sentiment_score: float   # -1..1 across their scored comments


class SuperfansResponse(BaseModel):
    """Response for GET /api/instagram/comments/superfans."""

    superfans: list[SuperfanItem]


class CommentReplyRequest(BaseModel):
    """Body for POST /api/instagram/comments/{comment_id}/reply."""

    message: str = Field(min_length=1, max_length=2200)


class CommentReplyResponse(BaseModel):
    """Response for POST /api/instagram/comments/{comment_id}/reply."""

    success: bool
    reply_id: str


# --- Anomaly alerts ---

class AlertItem(BaseModel):
    """One detected anomaly — a metric shift or an overperforming post."""

    id: str                      # stable key, e.g. "metric:reach" / "post:<media_id>"
    kind: str                    # "metric_drop" | "metric_surge" | "post_overperform"
    severity: str                # "warning" (negative) | "positive"
    title: str
    detail: str
    metric: str | None = None
    delta_pct: float | None = None
    ig_media_id: str | None = None
    permalink: str | None = None
    caption: str | None = None


class AlertsResponse(BaseModel):
    """Response for GET /api/instagram/insights/alerts."""

    period_days: int
    baseline_days: int
    alerts: list[AlertItem]


class TopPost(BaseModel):
    """A top-performing media post."""

    ig_media_id: str
    media_type: str
    permalink: str
    thumbnail_url: str
    media_url: str
    caption: str
    views: int
    interactions: int


class DashboardSummary(BaseModel):
    """Pre-computed summary for the dashboard hero cards.

    See `OverviewResponse.prior` for the comparison contract.

    `comparisons` is the per-metric `ComparisonValue` map used by the FE's
    `ComparisonMetricPill`. Populated only when `compare_to` is set and prior
    data exists. Keys mirror the scalar field names on this model.
    """

    period_days: int
    total_views: int
    total_reach: int
    total_interactions: int
    total_accounts_engaged: int
    net_follower_growth: int
    top_posts: list[TopPost]
    prior: "DashboardSummary | None" = None
    comparisons: dict[str, ComparisonValue] | None = None


class StoryWithInsights(BaseModel):
    """A single active story with its live insights."""

    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    timestamp: str
    insights: list[MediaInsightItem]


class StoriesResponse(BaseModel):
    """Response for GET /api/instagram/stories."""

    stories: list[StoryWithInsights]


class StoryHistoryItem(BaseModel):
    """A snapshotted story with its retained insights (survives the 24h expiry)."""

    ig_media_id: str
    media_type: str
    permalink: str
    timestamp: str               # ISO-8601 (when the story was posted)
    reach: int
    views: int
    replies: int
    shares: int
    interactions: int
    navigation: int              # taps forward/back/exit, summed


class StoryHistoryResponse(BaseModel):
    """Response for GET /api/instagram/stories/history."""

    total: int
    period_days: int
    stories: list[StoryHistoryItem]


# --- Comment-to-DM keyword funnels ---

class CreateDMFunnelRequest(BaseModel):
    """Body for POST /api/instagram/dm-funnels."""

    keyword: str = Field(min_length=2, max_length=40)
    dm_message: str = Field(min_length=1, max_length=1000)
    public_reply: str = Field(default="", max_length=2200)
    ig_media_id: str = Field(default="", max_length=64)  # '' = all posts


class DMFunnelItem(BaseModel):
    """One funnel + its lifetime send stats."""

    funnel_id: str
    keyword: str
    dm_message: str
    public_reply: str
    ig_media_id: str             # '' = all posts
    created_at: str              # ISO-8601
    sent_count: int = 0
    failed_count: int = 0
    last_sent_at: str | None = None


class DMFunnelListResponse(BaseModel):
    """Response for GET /api/instagram/dm-funnels."""

    funnels: list[DMFunnelItem]


class DMFunnelSendItem(BaseModel):
    """One funnel send-log entry (the activity feed)."""

    funnel_id: str
    keyword: str
    ig_comment_id: str
    ig_media_id: str
    commenter_username: str
    comment_text: str
    status: str                  # 'sent' | 'failed'
    error: str
    sent_at: str                 # ISO-8601


class DMFunnelSendsResponse(BaseModel):
    """Response for GET /api/instagram/dm-funnels/sends."""

    sends: list[DMFunnelSendItem]


# --- Feature 1: Content-Format Performance Breakdown ---

class FormatBreakdownItem(BaseModel):
    media_product_type: str
    media_type: str
    post_count: int
    avg_reach: float
    avg_views: float
    avg_likes: float
    avg_saves: float
    avg_shares: float
    avg_interactions: float
    avg_engagement_rate: float
    avg_save_rate: float
    avg_share_rate: float


class FormatBreakdownResponse(BaseModel):
    period_days: int
    data: list[FormatBreakdownItem]
    prior: "FormatBreakdownResponse | None" = None


# --- Feature 2: Best Time to Post ---

class BestTimeSlot(BaseModel):
    day_of_week: int      # 1=Monday … 7=Sunday (ClickHouse toDayOfWeek convention)
    hour_of_day: int      # 0–23
    sample_size: int
    avg_interactions: float
    avg_reach: float
    avg_engagement_rate: float


class BestTimeByFormatSlot(BaseModel):
    media_product_type: str  # FEED | REELS
    day_of_week: int
    hour_of_day: int
    sample_size: int
    avg_interactions: float
    avg_reach: float
    avg_engagement_rate: float


class BestTimeResponse(BaseModel):
    period_days: int
    min_sample: int
    data: list[BestTimeSlot]
    # Same slots split per format, so the FE can offer an All/Reels/Feed
    # toggle without a second request.
    by_format: list[BestTimeByFormatSlot] = []
    prior: "BestTimeResponse | None" = None


# --- Feature 3: Algorithm Metrics ---

class AlgorithmPostItem(BaseModel):
    ig_media_id: str
    media_product_type: str
    media_type: str
    permalink: str
    thumbnail_url: str
    media_url: str
    caption: str
    timestamp: str
    saved: float
    shares: float
    reach: float
    save_rate: float
    share_rate: float
    algorithm_score: float


class AlgorithmMetricsSummary(BaseModel):
    total_saves: float
    total_shares: float
    total_reach: float
    account_save_rate: float
    account_share_rate: float


class AlgorithmMetricsResponse(BaseModel):
    period_days: int
    summary: AlgorithmMetricsSummary
    posts: list[AlgorithmPostItem]
    prior: "AlgorithmMetricsResponse | None" = None
    # Per-metric ComparisonValue map for the summary fields. Keys:
    # total_saves, total_shares, total_reach, account_save_rate, account_share_rate.
    # The two rate fields carry a 2-prop z-test `significant` flag; the counts
    # carry delta only (significant=None) because we don't have per-period
    # variance from a single sum.
    comparisons: dict[str, ComparisonValue] | None = None


# --- Feature 4: Reels Retention ---

class ReelRetentionItem(BaseModel):
    ig_media_id: str
    permalink: str
    caption_preview: str
    timestamp: str
    avg_watch_time: float
    total_view_time: float
    reach: float
    views: float
    skip_rate: float
    estimated_avg_duration_sec: float
    hook_strength_pct: float
    estimated_replay_rate: float


class ReelsRetentionResponse(BaseModel):
    period_days: int
    reels: list[ReelRetentionItem]
    prior: "ReelsRetentionResponse | None" = None


class ReelsTrendPoint(BaseModel):
    week_start: str
    reels_count: int
    avg_hook_strength_pct: float
    avg_watch_time_sec: float
    avg_reach: float
    avg_views: float


class ReelsTrendResponse(BaseModel):
    period_days: int
    trend: list[ReelsTrendPoint]
    prior: "ReelsTrendResponse | None" = None


# --- Feature 5: Follower Quality Score ---

class FollowerQualityCohort(BaseModel):
    dimension_key: str
    dimension_value: str
    follower_count: int
    engaged_count: int
    engagement_rate_pct: float
    quality_tier: str


class FollowerQualityResponse(BaseModel):
    breakdown: str
    cohorts: list[FollowerQualityCohort]


class FollowerQualitySummary(BaseModel):
    breakdown: str
    total_cohorts: int
    total_followers_tracked: int
    total_engaged_tracked: int
    overall_quality_pct: float
    high_quality_cohorts: int
    medium_quality_cohorts: int
    low_quality_cohorts: int
    dormant_cohorts: int


class FollowerSpike(BaseModel):
    spike_date: str
    follows_change: int
    interactions: int
    interaction_per_follow_ratio: float
    is_suspicious: bool
    # Tier 2 / F5.5: candidate driver posts in the 24h window before this
    # spike. Empty list when no eligible posts were found or attribution
    # couldn't be computed — the FE renders the empty-state copy in that case.
    candidate_drivers: list["GrowthDriverItem"] = []


class FollowerSpikesResponse(BaseModel):
    period_days: int
    spike_threshold: int
    spikes: list[FollowerSpike]


# --- Phase 7: Drill-Down APIs ---

class FormatBreakdownPost(BaseModel):
    ig_media_id: str
    media_product_type: str
    media_type: str
    permalink: str
    thumbnail_url: str | None
    caption_preview: str
    timestamp: str
    reach: float
    likes: float
    saved: float
    shares: float
    algorithm_score_pct: float


class FormatBreakdownPostsResponse(BaseModel):
    format: str
    period_days: int
    posts: list[FormatBreakdownPost]


class BestTimePost(BaseModel):
    ig_media_id: str
    media_product_type: str
    permalink: str
    thumbnail_url: str | None
    caption_preview: str
    timestamp: str
    reach: float
    total_interactions: float
    engagement_rate_pct: float


class BestTimePostsResponse(BaseModel):
    day_of_week: int
    hour_of_day: int
    period_days: int
    posts: list[BestTimePost]


# --- Tier 2 / F5: Audience Growth Drivers ---

class GrowthDriverItem(BaseModel):
    ig_media_id: str
    media_product_type: str
    permalink: str
    thumbnail_url: str | None = None
    caption: str
    reach: float
    non_follower_reach: float
    attributed_follows: float
    conversion_rate_pct: float


class GrowthDriversResponse(BaseModel):
    period_days: int
    drivers: list[GrowthDriverItem]
    prior: "GrowthDriversResponse | None" = None


class GrowthCorrelationPoint(BaseModel):
    day: str
    follows: int
    reach: float


class GrowthCorrelationResponse(BaseModel):
    period_days: int
    points: list[GrowthCorrelationPoint]
    # Pearson r between daily follows and same-day (non-)follower reach.
    # None when the window has < 3 data points or zero variance.
    correlation: float | None = None
    # True when the response used non_follower_reach; False means the
    # breakdown sync hasn't populated yet and we fell back to total reach.
    uses_non_follower_reach: bool
    prior: "GrowthCorrelationResponse | None" = None


class PostConversionResponse(BaseModel):
    """Per-post follower-conversion stats for the PostInsightsDrawer.

    Mirrors the per-post slice of GrowthDriversResponse. `attributed_follows`
    is "share of the day's follower gain attributed to this post", not a
    causal claim — the FE labels it as a rough estimate.
    """

    ig_media_id: str
    non_follower_reach: float
    attributed_follows: float
    conversion_rate_pct: float


# --- Tier 2 / F2: Hashtag Performance ---

class HashtagPerformanceItem(BaseModel):
    hashtag: str
    post_count: int
    avg_reach: float
    avg_engagement_rate_pct: float
    avg_save_rate_pct: float


class HashtagsResponse(BaseModel):
    period_days: int
    data: list[HashtagPerformanceItem]
    prior: "HashtagsResponse | None" = None


class HashtagTrendPoint(BaseModel):
    week_start: str
    posts_used: int
    avg_reach: float
    avg_engagement_rate_pct: float


class HashtagTrendResponse(BaseModel):
    tag: str
    period_days: int
    data: list[HashtagTrendPoint]
    prior: "HashtagTrendResponse | None" = None


class HashtagComboItem(BaseModel):
    tag_a: str
    tag_b: str
    cooccurrence_count: int
    avg_engagement_pct: float


class HashtagComboResponse(BaseModel):
    period_days: int
    data: list[HashtagComboItem]
    prior: "HashtagComboResponse | None" = None


# --- Tier 2 / F4: Comment Sentiment ---

class SentimentDistribution(BaseModel):
    positive: int = 0
    neutral: int = 0
    negative: int = 0


class SentimentTrendPoint(BaseModel):
    week_start: str
    positive: int
    neutral: int
    negative: int


class SentimentSummaryResponse(BaseModel):
    period_days: int
    total: int
    distribution: SentimentDistribution
    trend: list[SentimentTrendPoint]
    # Populated when the request carries a non-empty `compare_to`. Mirrors the
    # comparison contract on every other Tier 2 endpoint so the FE can render
    # delta pills / overlay the prior weekly trend on the area chart.
    prior: "SentimentSummaryResponse | None" = None


class TopicItem(BaseModel):
    cluster_id: int
    label: str
    size: int
    is_question: bool = False


class TopicsResponse(BaseModel):
    period_days: int
    topics: list[TopicItem]


class QuestionPostItem(BaseModel):
    ig_media_id: str
    permalink: str
    thumbnail_url: str | None = None
    caption: str
    timestamp: str
    question_count: int
    total_comments: int


class QuestionPostsResponse(BaseModel):
    period_days: int
    posts: list[QuestionPostItem]


class SentimentDiagnoseResponse(BaseModel):
    """Why the Audience Voice section may be empty.

    `ig_comments_total` is what Meta reports across the user's media via
    `comments_count` (always accessible). `stored_comments` is what we
    actually have in our table. When the first is large and the second is
    zero, Meta is filtering comment payloads — usually because the app
    hasn't been approved for Advanced Access on
    `instagram_business_manage_comments`.
    """

    ig_comments_total: int
    stored_comments: int
    stored_sentiment: int
    stored_topics: int
    status: str  # "ok" | "no_data" | "scope_blocked" | "not_connected"
    reason: str


class SeedDemoResponse(BaseModel):
    """Counts written by the synthetic-data seeder. All rows are tagged with
    synthetic_v1 markers so /purge?synth_only=true can clean them later."""

    comments: int
    sentiment: int
    topics: int


class SentimentSampleComment(BaseModel):
    ig_comment_id: str
    username: str
    text: str
    sentiment: str


class MediaSentimentResponse(BaseModel):
    ig_media_id: str
    total: int
    distribution: SentimentDistribution
    samples: list[SentimentSampleComment]


# --- Tier 2 / F3: Competitor Benchmarking ---

class AddCompetitorRequest(BaseModel):
    handle: str = Field(..., min_length=1, max_length=30, pattern=r"^[A-Za-z0-9._]+$")


class CompetitorLookupPreview(BaseModel):
    """Live Instagram lookup result for the add-competitor preview.

    Returned by GET /competitors/lookup. Sourced from Meta Business Discovery,
    not from ClickHouse — used to confirm the handle exists and is a public
    Business/Creator account before the user commits to tracking it.
    """

    handle: str
    ig_user_id: str
    display_name: str
    username: str
    profile_picture_url: str
    followers_count: int
    media_count: int


class CompetitorSnapshot(BaseModel):
    handle: str
    snapshot_date: date
    followers_count: int
    media_count: int
    posts_last_7d: int
    reels_last_7d: int
    carousels_last_7d: int
    avg_likes_last_25: float
    avg_comments_last_25: float
    avg_engagement_rate_pct: float


class SelfSnapshot(BaseModel):
    """Authenticated user's metrics in the same shape as a competitor snapshot.

    Engagement rate here is computed the same way as for competitors
    (`(likes + comments) / followers_count` over the last 25 posts) so the
    side-by-side comparison is apples-to-apples.
    """

    followers_count: int
    media_count: int
    posts_last_7d: int
    reels_last_7d: int
    carousels_last_7d: int
    avg_likes_last_25: float
    avg_comments_last_25: float
    avg_engagement_rate_pct: float


class CompetitorItem(BaseModel):
    handle: str
    ig_user_id: str
    display_name: str
    profile_picture_url: str
    latest_snapshot: CompetitorSnapshot | None = None
    # Number of consecutive failed competitor_sync runs. Surfaced so the FE
    # can render a "data may be stale" indicator before the auto-disable
    # threshold (see competitor_repo.MAX_CONSECUTIVE_FAILURES). Always 0 for
    # freshly-added handles.
    consecutive_failures: int = 0


class CompetitorListResponse(BaseModel):
    competitors: list[CompetitorItem]
    you: SelfSnapshot | None = None


class CompetitorTimelinePoint(BaseModel):
    date: str
    followers: int


class CompetitorTimelineSeries(BaseModel):
    handle: str
    display_name: str
    points: list[CompetitorTimelinePoint]


class CompetitorTimelineResponse(BaseModel):
    period_days: int
    series: list[CompetitorTimelineSeries]


class ContentMixDistribution(BaseModel):
    reels: float = 0.0
    carousel: float = 0.0
    image: float = 0.0


class ContentMixAccount(BaseModel):
    handle: str
    display_name: str
    mix: ContentMixDistribution


class ContentMixResponse(BaseModel):
    period_days: int
    accounts: list[ContentMixAccount]


# --- Tier 2 / F2: Branded Hashtag Tracking ---


class AddBrandedHashtagRequest(BaseModel):
    hashtag: str = Field(..., min_length=1, max_length=60, pattern=r"^[A-Za-z0-9_]+$")


class BrandedHashtagMention(BaseModel):
    """A single mention of a tracked branded hashtag.

    `source` distinguishes:
      - 'post': the authenticated user's own post used the tag in its caption.
        `ig_comment_id` is then `'post:<ig_media_id>'` (synthetic dedup key),
        `username` is empty (it's your own post), and `text` is the post
        caption.
      - 'comment': a comment on one of the user's posts mentioned the tag.
        `ig_comment_id` is the real comment id; `username` is the commenter.

    We scan stored captions and comments — NOT external public posts —
    because the Instagram Login API doesn't grant access to Meta's
    ig_hashtag_search endpoint.
    """

    ig_comment_id: str
    ig_media_id: str
    permalink: str
    username: str
    text: str
    like_count: int
    timestamp: str
    source: str = "comment"


class BrandedHashtagItem(BaseModel):
    hashtag: str
    last_synced_at: str | None = None
    mention_count: int = 0
    total_likes: int = 0
    # Distinct commenters who used this brand tag in the window — a more
    # useful metric than raw mention count for spotting community pickup.
    unique_authors: int = 0
    latest_mention: str | None = None


class BrandedHashtagListResponse(BaseModel):
    period_days: int
    branded: list[BrandedHashtagItem]


class BrandedHashtagMentionsResponse(BaseModel):
    hashtag: str
    period_days: int
    mentions: list[BrandedHashtagMention]
