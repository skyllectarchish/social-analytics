// API response types — mirror the FastAPI Pydantic schemas.

export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface InstagramProfile {
  id: string;
  ig_user_id: string;
  username: string;
  name: string;
  biography: string;
  profile_picture_url: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  connected_at: string;
}

export interface InstagramMedia {
  ig_media_id: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string;
  permalink: string;
  caption: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

export interface MediaListResponse {
  items: InstagramMedia[];
  total: number;
}

export interface ConnectResponse {
  oauth_url: string;
  state: string;
}

export interface CallbackResponse {
  success: boolean;
  profile: InstagramProfile;
}

export interface TopPost {
  ig_media_id: string;
  media_type: string;
  permalink: string;
  thumbnail_url: string;
  media_url: string;
  caption: string;
  views: number;
  interactions: number;
}

export interface DashboardSummary {
  period_days: number;
  total_views: number;
  total_reach: number;
  total_interactions: number;
  total_accounts_engaged: number;
  net_follower_growth: number;
  top_posts: TopPost[];
}

export interface InsightDataPoint {
  end_time: string;
  value: number;
}

export interface MetricTimeSeries {
  metric_name: string;
  data: InsightDataPoint[];
}

export interface OverviewResponse {
  views: MetricTimeSeries;
  reach: MetricTimeSeries;
  follows_and_unfollows: MetricTimeSeries;
  total_interactions: MetricTimeSeries;
  accounts_engaged: MetricTimeSeries;
}

export interface DemographicBreakdown {
  dimension_value: string;
  value: number;
}

export interface DemographicResponse {
  metric_name: string;
  breakdown: string;
  data: DemographicBreakdown[];
}

/* ---------- Content Lab ---------- */
export interface BestTimeSlot {
  day_of_week: number; // 1=Mon … 7=Sun
  hour_of_day: number;
  sample_size: number;
  avg_interactions: number;
  avg_reach: number;
  avg_engagement_rate: number;
}
export interface BestTimeByFormatSlot extends BestTimeSlot {
  media_product_type: string; // FEED | REELS
}
export interface BestTimeResponse {
  period_days: number;
  min_sample: number;
  data: BestTimeSlot[];
  by_format: BestTimeByFormatSlot[];
}
export interface BestTimePost {
  ig_media_id: string;
  media_product_type: string;
  permalink: string;
  thumbnail_url: string | null;
  caption_preview: string;
  timestamp: string;
  reach: number;
  total_interactions: number;
  engagement_rate_pct: number;
}
export interface BestTimePostsResponse {
  day_of_week: number;
  hour_of_day: number;
  period_days: number;
  posts: BestTimePost[];
}

export interface FormatBreakdownItem {
  media_product_type: string;
  media_type: string;
  post_count: number;
  avg_engagement_rate: number;
}
export interface FormatBreakdownResponse {
  period_days: number;
  data: FormatBreakdownItem[];
}
export interface FormatBreakdownPost {
  ig_media_id: string;
  media_product_type: string;
  media_type: string;
  permalink: string;
  thumbnail_url: string | null;
  caption_preview: string;
  timestamp: string;
  reach: number;
  likes: number;
  saved: number;
  shares: number;
  algorithm_score_pct: number;
}
export interface FormatBreakdownPostsResponse {
  format: string;
  period_days: number;
  posts: FormatBreakdownPost[];
}

export interface AlgorithmPostItem {
  ig_media_id: string;
  media_product_type: string;
  media_type: string;
  permalink: string;
  caption: string;
  timestamp: string;
  saved: number;
  shares: number;
  reach: number;
  save_rate: number;
  share_rate: number;
  algorithm_score: number;
}
export interface AlgorithmMetricsResponse {
  period_days: number;
  summary: {
    total_saves: number;
    total_shares: number;
    total_reach: number;
    account_save_rate: number;
    account_share_rate: number;
  };
  posts: AlgorithmPostItem[];
}

export interface HashtagPerformanceItem {
  hashtag: string;
  post_count: number;
  avg_reach: number;
  avg_engagement_rate_pct: number;
  avg_save_rate_pct: number;
}
export interface HashtagsResponse {
  period_days: number;
  data: HashtagPerformanceItem[];
}
export interface HashtagComboItem {
  tag_a: string;
  tag_b: string;
  cooccurrence_count: number;
  avg_engagement_pct: number;
}
export interface HashtagComboResponse {
  period_days: number;
  data: HashtagComboItem[];
}

/* ---------- Reels ---------- */
export interface ReelRetentionItem {
  ig_media_id: string;
  permalink: string;
  caption_preview: string;
  avg_watch_time: number;
  reach: number;
  views: number;
  skip_rate: number;
  hook_strength_pct: number;
}
export interface ReelsRetentionResponse {
  period_days: number;
  reels: ReelRetentionItem[];
}
export interface ReelsTrendPoint {
  week_start: string;
  reels_count: number;
  avg_hook_strength_pct: number;
  avg_watch_time_sec: number;
  avg_reach: number;
  avg_views: number;
}
export interface ReelsTrendResponse {
  period_days: number;
  trend: ReelsTrendPoint[];
}

/* ---------- Audience ---------- */
export interface SentimentSummaryResponse {
  period_days: number;
  total: number;
  distribution: { positive: number; neutral: number; negative: number };
  trend: { week_start: string; positive: number; neutral: number; negative: number }[];
}
export interface TopicsResponse {
  period_days: number;
  topics: { cluster_id: number; label: string; size: number; is_question: boolean }[];
}
export interface FollowerQualityResponse {
  breakdown: string;
  cohorts: {
    dimension_value: string;
    follower_count: number;
    engaged_count: number;
    engagement_rate_pct: number;
    quality_tier: string;
  }[];
}
export interface FollowerQualitySummary {
  breakdown: string;
  total_cohorts: number;
  total_followers_tracked: number;
  total_engaged_tracked: number;
  overall_quality_pct: number;
  high_quality_cohorts: number;
  medium_quality_cohorts: number;
  low_quality_cohorts: number;
  dormant_cohorts: number;
}
export interface FollowerSpike {
  spike_date: string;
  follows_change: number;
  interactions: number;
  interaction_per_follow_ratio: number;
  is_suspicious: boolean;
}
export interface FollowerSpikesResponse {
  period_days: number;
  spikes: FollowerSpike[];
}

/* ---------- Per-media insights (PostInsightsDrawer) ---------- */
export interface MediaInsightItem {
  metric_name: string;
  value: number;
}
export interface MediaInsightsResponse {
  ig_media_id: string;
  insights: MediaInsightItem[];
}

/* ---------- Competitors ---------- */
export interface CompetitorSnapshot {
  followers_count: number;
  reels_last_7d: number;
  avg_engagement_rate_pct: number;
}
export interface CompetitorItem {
  handle: string;
  display_name: string;
  profile_picture_url: string;
  latest_snapshot: CompetitorSnapshot | null;
}
export interface SelfSnapshot {
  followers_count: number;
  reels_last_7d: number;
  avg_engagement_rate_pct: number;
}
export interface CompetitorListResponse {
  competitors: CompetitorItem[];
  you: SelfSnapshot | null;
}
export interface CompetitorTimelineResponse {
  period_days: number;
  series: { handle: string; display_name: string; points: { date: string; followers: number }[] }[];
}
export interface ContentMixResponse {
  period_days: number;
  accounts: { handle: string; display_name: string; mix: { reels: number; carousel: number; image: number } }[];
}

/* ---------- AI Copilot ---------- */
export interface QuotaResponse {
  used: number;
  limit: number;
  resets_at: string;
}
export interface Idea {
  id: string;
  title: string;
  body_md: string;
  suggested_format: string;
  rationale: string;
}
export interface ContentIdeasResponse {
  period_days: number;
  themes_detected: string[];
  ideas: Idea[];
}
export interface CaptionVariant {
  id: string;
  label: string;
  caption: string;
  rationale: string;
}
export interface CaptionSuggestResponse {
  scores: { hook_strength: number; cta_presence: number; length_fit: number; overall: number };
  variants: CaptionVariant[];
  notes_md: string;
}
