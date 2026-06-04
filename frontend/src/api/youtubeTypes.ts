// YouTube API response types — mirror the FastAPI Pydantic schemas.

export interface YoutubeConnectResponse {
  oauth_url: string;
  state: string;
}

export interface YoutubeChannel {
  yt_channel_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  hidden_subscriber_count: boolean;
}

export interface YoutubeCallbackResponse {
  success: boolean;
  channel: YoutubeChannel;
}

export interface YoutubeVideo {
  video_id: string;
  title: string;
  thumbnail_url: string;
  published_at: string;
  duration_seconds: number;
  video_format: string;
  view_count: number;
  like_count: number;
  comment_count: number;
}

export interface YoutubeVideoListResponse {
  items: YoutubeVideo[];
  total: number;
}

export interface YoutubeMetricPoint {
  date: string;
  value: number;
}

export interface YoutubeMetricSeries {
  metric_name: string;
  data: YoutubeMetricPoint[];
}

export interface YoutubeOverviewResponse {
  period_days: number;
  views: YoutubeMetricSeries;
  watch_minutes: YoutubeMetricSeries;
  subscribers_gained: YoutubeMetricSeries;
  subscribers_lost: YoutubeMetricSeries;
}

export interface RetentionCurvePoint {
  elapsed_ratio: number;
  watch_ratio: number;
  relative_performance: number;
}

export interface RetentionAnnotation {
  timestamp_seconds: number;
  annotation_text: string;
  drop_pct: number;
}

export interface RetentionResponse {
  video_id: string;
  curve: RetentionCurvePoint[];
  annotations: RetentionAnnotation[];
  annotations_pending: boolean;
}
