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

// ── YouTube Phase 2 types ────────────────────────────────────────────────────

export interface YoutubeCompetitor {
  competitor_channel_id: string;
  competitor_title: string;
  competitor_thumbnail_url: string;
  webhook_active: boolean;
  added_at: string;
}

export interface CompetitorOutlier {
  competitor_channel_id: string;
  video_id: string;
  title: string;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
  llm_analysis: string | null;
}

export interface TitleHistoryEntry {
  title_text: string;
  observed_at: string;
}

export interface YoutubeArchiveSuggestion {
  video_id: string;
  original_title: string;
  trending_topic: string;
  wikipedia_spike_pct: number;
  autocomplete_matches: string[];
  suggestion_type: "REMAKE" | "SHORT" | "UPDATE";
  llm_recommendation: string;
  generated_at: string;
}

export interface ArchiveMinerStatus {
  last_scan: string | null;
  suggestions: YoutubeArchiveSuggestion[];
}

export interface VelocityPoint {
  hours: number;
  view_count: number;
  avg_watch_s: number;
  ctr_pct: number;
}

export interface YoutubePrediction {
  video_id: string;
  four_hour_views: number;
  four_hour_avg_watch_s: number;
  ctr_pct: number;
  predicted_30d_views: number;
  predicted_low: number;
  predicted_high: number;
  revenue_low_usd: number;
  revenue_high_usd: number;
  predicted_at: string;
  model_r2: number | null;
}

export interface YoutubeAlert {
  id: string;
  video_id: string;
  alert_type: string;
  alert_body: string;
  is_read: boolean;
  created_at: string;
}

export interface CrossPlatformDay {
  day: string;
  subscribers_gained: number;
  subscribers_lost: number;
  net_subscribers: number;
  has_instagram_reel: boolean;
}

export interface InstagramReelMarker {
  post_date: string;
  ig_media_id: string;
  thumbnail_url: string;
  caption: string;
}

export interface CrossPlatformResponse {
  days: CrossPlatformDay[];
  reel_posts: InstagramReelMarker[];
  correlation: number | null;
}
