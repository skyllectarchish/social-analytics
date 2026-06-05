"""Application-wide constants."""

# Token expiry
DEFAULT_TOKEN_EXPIRY_SECONDS: int = 60 * 24 * 3600  # 60 days

# Instagram Login API (direct, no Facebook Page required).
# IG Login Graph endpoints are unversioned and live on graph.instagram.com.
GRAPH_BASE_URL: str = "https://graph.instagram.com"
OAUTH_DIALOG_URL: str = "https://www.instagram.com/oauth/authorize"
TOKEN_EXCHANGE_URL: str = "https://api.instagram.com/oauth/access_token"

REQUIRED_INSTAGRAM_SCOPES: list[str] = [
    "instagram_business_basic",
    "instagram_business_manage_insights",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
]

INSTAGRAM_PROFILE_FIELDS: str = (
    "username,name,biography,profile_picture_url,"
    "followers_count,follows_count,media_count"
)

INSTAGRAM_MEDIA_FIELDS: str = (
    "id,media_type,media_product_type,media_url,thumbnail_url,permalink,"
    "caption,timestamp,like_count,comments_count"
)

# HTTP
HTTP_TIMEOUT_SECONDS: int = 30

# Pagination
DEFAULT_PAGE_SIZE: int = 12
MAX_PAGE_SIZE: int = 50
DEFAULT_MEDIA_FETCH_LIMIT: int = 50

# Validation
USERNAME_MIN_LENGTH: int = 3
USERNAME_MAX_LENGTH: int = 30
PASSWORD_MIN_LENGTH: int = 8

# --- Insights API Metrics ---

# Account-level time-series metrics (metric_type=time_series)
ACCOUNT_TIME_SERIES_METRICS: str = "reach"

# Account-level total-value metrics (metric_type=total_value) — incompatible with time_series
ACCOUNT_TOTAL_VALUE_METRICS: str = "views"

# Account-level demographic metrics (GET /{ig-user-id}/insights)
ACCOUNT_DEMOGRAPHIC_METRICS: list[str] = [
    "follower_demographics",
    "engaged_audience_demographics",
]

# Per-media metrics — FEED posts (GET /{media-id}/insights)
# Note: `reposts` was dropped from Meta's IG Insights Media API and now returns
# HTTP 400 "endpoint does not support the metrics: reposts". Removed.
MEDIA_FEED_METRICS: str = "likes,comments,saved,shares,reach,views,total_interactions,profile_visits"

# Per-media metrics — REELS (GET /{media-id}/insights)
MEDIA_REELS_METRICS: str = (
    "likes,comments,saved,shares,reach,views,total_interactions,"
    "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate"
)

# Per-media metrics — STORY (GET /{media-id}/insights)
MEDIA_STORY_METRICS: str = "reach,views,shares,replies,navigation,total_interactions"

# Insights sync defaults
INSIGHTS_LOOKBACK_DAYS: int = 30
# Maximum lookback exposed to query endpoints (1 year of accumulated ClickHouse data).
INSIGHTS_MAX_LOOKBACK_DAYS: int = 365
# Meta caps account-insights since/until at ~30 days per request — chunk size for backfill.
INSIGHTS_API_WINDOW_DAYS: int = 30
# How far back to backfill on first /callback. Meta retains ~90 days of historical insights.
INSIGHTS_INITIAL_FETCH_DAYS: int = 90

# Stories
STORY_FIELDS: str = "id,media_type,media_url,thumbnail_url,permalink,timestamp"

# --- YouTube API ---

YOUTUBE_DATA_API_BASE: str = "https://www.googleapis.com/youtube/v3"
YOUTUBE_ANALYTICS_API_BASE: str = "https://youtubeanalytics.googleapis.com/v2"
YOUTUBE_OAUTH_DIALOG_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
YOUTUBE_TOKEN_EXCHANGE_URL: str = "https://oauth2.googleapis.com/token"

YOUTUBE_REQUIRED_SCOPES: list[str] = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",  # caption download
]

YOUTUBE_DEFAULT_VIDEO_FETCH_LIMIT: int = 50
YOUTUBE_ANALYTICS_OVERVIEW_METRICS: str = (
    "views,estimatedMinutesWatched,subscribersGained,subscribersLost,"
    "impressions,impressionsCTR,averageViewDuration"
)

YOUTUBE_PUBSUBHUBBUB_HUB_URL: str = "https://pubsubhubbub.appspot.com/subscribe"
YOUTUBE_WEBSUB_LEASE_SECONDS: int = 864000  # 10 days
