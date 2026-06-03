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
export interface BestTimeResponse {
  period_days: number;
  min_sample: number;
  data: BestTimeSlot[];
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

export interface AlgorithmPostItem {
  ig_media_id: string;
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
export interface FollowerSpikesResponse {
  period_days: number;
  spikes: { spike_date: string; follows_change: number; interactions: number; is_suspicious: boolean }[];
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
