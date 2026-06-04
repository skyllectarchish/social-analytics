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

/* Scalar metric with optional prior-period comparison (compare_to param). */
export interface ComparisonValue {
  current: number;
  prior: number | null;
  delta_pct: number | null;
  significant: boolean | null;
}

export interface DashboardSummary {
  period_days: number;
  total_views: number;
  total_reach: number;
  total_interactions: number;
  total_accounts_engaged: number;
  net_follower_growth: number;
  top_posts: TopPost[];
  comparisons?: Record<string, ComparisonValue> | null;
}

export interface InboxComment {
  ig_comment_id: string;
  ig_media_id: string;
  username: string;
  text: string;
  like_count: number;
  timestamp: string;
  sentiment: "positive" | "neutral" | "negative" | "";
  is_question: boolean;
  replied: boolean;
  permalink: string;
}

export interface CommentInboxResponse {
  total: number;
  comments: InboxComment[];
}

export interface CommentReplySuggestion {
  id: string;
  tone: "friendly" | "playful" | "professional";
  reply: string;
}

export interface CommentReplySuggestResponse {
  ig_comment_id: string;
  suggestions: CommentReplySuggestion[];
}

export interface AlertItem {
  id: string;
  kind: "metric_drop" | "metric_surge" | "post_overperform";
  severity: "positive" | "warning";
  title: string;
  detail: string;
  metric: string | null;
  delta_pct: number | null;
  ig_media_id: string | null;
  permalink: string | null;
  caption: string | null;
}

export interface AlertsResponse {
  period_days: number;
  baseline_days: number;
  alerts: AlertItem[];
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
  prior?: OverviewResponse | null;
}

/* ---------- Stories ---------- */
export interface StoryWithInsights {
  ig_media_id: string;
  media_type: string;
  media_url: string;
  thumbnail_url: string;
  permalink: string;
  timestamp: string;
  insights: { metric_name: string; value: number }[];
}
export interface StoriesResponse {
  stories: StoryWithInsights[];
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
  prior?: HashtagsResponse | null;
}
export interface HashtagTrendPoint {
  week_start: string;
  posts_used: number;
  avg_reach: number;
  avg_engagement_rate_pct: number;
}
export interface HashtagTrendResponse {
  tag: string;
  period_days: number;
  data: HashtagTrendPoint[];
}

/* ---------- Branded hashtags ---------- */
export interface BrandedHashtagItem {
  hashtag: string;
  last_synced_at: string | null;
  mention_count: number;
  total_likes: number;
  unique_authors: number;
  latest_mention: string | null;
}
export interface BrandedHashtagListResponse {
  period_days: number;
  branded: BrandedHashtagItem[];
}
export interface BrandedHashtagMention {
  ig_comment_id: string;
  ig_media_id: string;
  permalink: string;
  username: string;
  text: string;
  like_count: number;
  timestamp: string;
  source: "post" | "comment";
}
export interface BrandedHashtagMentionsResponse {
  hashtag: string;
  period_days: number;
  mentions: BrandedHashtagMention[];
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
  prior?: ReelsRetentionResponse | null;
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
  prior?: SentimentSummaryResponse | null;
}
export interface SentimentDiagnoseResponse {
  ig_comments_total: number;
  stored_comments: number;
  stored_sentiment: number;
  stored_topics: number;
  status: "ok" | "no_data" | "scope_blocked" | "not_connected";
  reason: string;
}
export interface SeedDemoResponse {
  comments: number;
  sentiment: number;
  topics: number;
}
export interface QuestionPostItem {
  ig_media_id: string;
  permalink: string;
  thumbnail_url: string | null;
  caption: string;
  timestamp: string;
  question_count: number;
  total_comments: number;
}
export interface QuestionPostsResponse {
  period_days: number;
  posts: QuestionPostItem[];
}

/* ---------- Growth drivers ---------- */
export interface GrowthDriverItem {
  ig_media_id: string;
  media_product_type: string;
  permalink: string;
  thumbnail_url: string | null;
  caption: string;
  reach: number;
  non_follower_reach: number;
  attributed_follows: number;
  conversion_rate_pct: number;
}
export interface GrowthDriversResponse {
  period_days: number;
  drivers: GrowthDriverItem[];
  prior?: GrowthDriversResponse | null;
}
export interface GrowthCorrelationPoint {
  day: string;
  follows: number;
  reach: number;
}
export interface GrowthCorrelationResponse {
  period_days: number;
  points: GrowthCorrelationPoint[];
  correlation: number | null;
  uses_non_follower_reach: boolean;
  prior?: GrowthCorrelationResponse | null;
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
  // Posts in the 24h window before the spike that likely drove it.
  candidate_drivers: GrowthDriverItem[];
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
  // Failed daily syncs in a row; auto-removed at 3 (stale-data warning).
  consecutive_failures: number;
}
export interface CompetitorLookupPreview {
  handle: string;
  username: string;
  display_name: string | null;
  followers_count: number;
  media_count: number;
  profile_picture_url: string | null;
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
  adjacent: boolean;
}
export interface IdeasSourcePost {
  ig_media_id: string;
  permalink: string | null;
  thumbnail_url: string | null;
  caption_preview: string | null;
  algorithm_score_pct: number;
}
export interface ContentIdeasResponse {
  period_days: number;
  generated_at: string;
  source_posts: IdeasSourcePost[];
  themes_detected: string[];
  ideas: Idea[];
}

/* Weekly digest */
export interface DigestBullet {
  kind: "win" | "warning" | "trend" | "experiment";
  headline: string;
  detail_md: string;
  link: { route: string; query: Record<string, string> } | null;
}
export interface WeeklyDigestResponse {
  week_of: string;
  generated_at: string;
  status: "ready" | "stale" | "generating" | "not_enough_data";
  cached: boolean;
  narrative_md: string;
  bullets: DigestBullet[];
  metrics_snapshot: {
    save_rate_pct_delta: number | null;
    reach_pct_delta: number | null;
    follows_delta: number | null;
    posts_count: number;
  };
  followups: string[];
}

/* Post diagnostic */
export interface BaselineMetrics {
  avg_reach: number;
  avg_engagement_rate_pct: number;
  avg_save_rate_pct: number;
}
export interface DiagnosticFactor {
  key: "format" | "timing" | "hashtags" | "topic" | "duration" | "hook";
  severity: "high" | "medium" | "low" | "neutral";
  headline: string;
  detail_md: string;
  evidence: { metric: string; value: number; comparison: string };
}
export interface DiagnosticResponse {
  ig_media_id: string;
  baseline: BaselineMetrics;
  observed: BaselineMetrics;
  underperformed: boolean;
  verdict_md: string;
  factors: DiagnosticFactor[];
  recommendations_md: string;
}

export interface FeedbackRequest {
  feature: "digest" | "ideas" | "diagnostic" | "caption";
  ref_id: string;
  rating: "up" | "down";
  note?: string | null;
}
export interface CaptionVariant {
  id: string;
  label: string;
  caption: string;
  rationale: string;
}
export interface CaptionSuggestResponse {
  draft: string;
  scores: { hook_strength: number; cta_presence: number; length_fit: number; overall: number };
  variants: CaptionVariant[];
  notes_md: string;
}
