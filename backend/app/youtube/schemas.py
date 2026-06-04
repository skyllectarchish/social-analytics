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
