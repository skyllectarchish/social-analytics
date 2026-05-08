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
