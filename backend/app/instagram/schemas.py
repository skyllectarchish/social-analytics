"""Instagram Pydantic schemas — request/response models for /api/instagram endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from ..models.instagram_media import IGMedia
    from ..models.instagram_profile import IGProfile


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
    """Response for GET /api/instagram/insights/overview."""

    views: MetricTimeSeries
    reach: MetricTimeSeries
    follows_and_unfollows: MetricTimeSeries
    total_interactions: MetricTimeSeries
    accounts_engaged: MetricTimeSeries


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
    """Pre-computed summary for the dashboard hero cards."""

    period_days: int
    total_views: int
    total_reach: int
    total_interactions: int
    total_accounts_engaged: int
    net_follower_growth: int
    top_posts: list[TopPost]


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


# --- Feature 2: Best Time to Post ---

class BestTimeSlot(BaseModel):
    day_of_week: int      # 1=Monday … 7=Sunday (ClickHouse toDayOfWeek convention)
    hour_of_day: int      # 0–23
    sample_size: int
    avg_interactions: float
    avg_reach: float
    avg_engagement_rate: float


class BestTimeResponse(BaseModel):
    period_days: int
    min_sample: int
    data: list[BestTimeSlot]


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
