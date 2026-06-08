"""YouTube Pydantic schemas — request/response models for /api/youtube endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class YoutubeConnectResponse(BaseModel):
    oauth_url: str
    state: str


class YoutubeChannel(BaseModel):
    yt_channel_id: str
    title: str
    description: str
    thumbnail_url: str
    subscriber_count: int
    video_count: int
    view_count: int
    hidden_subscriber_count: bool


class YoutubeCallbackResponse(BaseModel):
    success: bool
    channel: YoutubeChannel


class YoutubeVideo(BaseModel):
    video_id: str
    title: str
    thumbnail_url: str
    published_at: str
    duration_seconds: int
    video_format: str
    view_count: int
    like_count: int
    comment_count: int


class YoutubeVideoListResponse(BaseModel):
    items: list[YoutubeVideo]
    total: int


class YoutubeMetricPoint(BaseModel):
    date: str
    value: float


class YoutubeMetricSeries(BaseModel):
    metric_name: str
    data: list[YoutubeMetricPoint]


class YoutubeOverviewResponse(BaseModel):
    period_days: int
    views: YoutubeMetricSeries
    watch_minutes: YoutubeMetricSeries
    subscribers_gained: YoutubeMetricSeries
    subscribers_lost: YoutubeMetricSeries


class RetentionCurvePoint(BaseModel):
    elapsed_ratio: float
    watch_ratio: float
    relative_performance: float


class RetentionAnnotation(BaseModel):
    timestamp_seconds: int
    annotation_text: str
    drop_pct: float


class RetentionResponse(BaseModel):
    video_id: str
    curve: list[RetentionCurvePoint]
    annotations: list[RetentionAnnotation]
    annotations_pending: bool


class YoutubeSyncResponse(BaseModel):
    success: bool
    message: str


class YoutubeCompetitor(BaseModel):
    competitor_channel_id: str
    competitor_title: str
    competitor_thumbnail_url: str
    webhook_active: bool
    added_at: str


class AddCompetitorRequest(BaseModel):
    handle: str  # @handle or youtube.com/@ URL


class CompetitorOutlier(BaseModel):
    competitor_channel_id: str
    video_id: str
    title: str
    thumbnail_url: str
    view_count: int
    published_at: str
    llm_analysis: str | None


class TitleHistoryEntry(BaseModel):
    title_text: str
    observed_at: str


class YoutubeArchiveSuggestion(BaseModel):
    video_id: str
    original_title: str
    trending_topic: str
    wikipedia_spike_pct: float
    autocomplete_matches: list[str]
    suggestion_type: str
    llm_recommendation: str
    generated_at: str


class ArchiveMinerStatus(BaseModel):
    last_scan: str | None
    suggestions: list[YoutubeArchiveSuggestion]


class VelocityPoint(BaseModel):
    hours: int
    view_count: int
    avg_watch_s: float
    ctr_pct: float


class YoutubePrediction(BaseModel):
    video_id: str
    four_hour_views: int
    four_hour_avg_watch_s: float
    ctr_pct: float
    predicted_30d_views: int
    predicted_low: int
    predicted_high: int
    revenue_low_usd: float
    revenue_high_usd: float
    predicted_at: str
    model_r2: float | None = None


class YoutubeAlert(BaseModel):
    id: str
    video_id: str
    alert_type: str
    alert_body: str
    is_read: bool
    created_at: str


class CrossPlatformDay(BaseModel):
    day: str
    subscribers_gained: int
    subscribers_lost: int
    net_subscribers: int
    has_instagram_reel: bool


class InstagramReelMarker(BaseModel):
    post_date: str
    ig_media_id: str
    thumbnail_url: str
    caption: str


class CrossPlatformResponse(BaseModel):
    days: list[CrossPlatformDay]
    reel_posts: list[InstagramReelMarker]
    correlation: float | None
