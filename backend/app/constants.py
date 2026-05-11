"""Application-wide constants."""

# Token expiry
DEFAULT_TOKEN_EXPIRY_SECONDS: int = 60 * 24 * 3600  # 60 days

# Instagram Graph API
GRAPH_API_VERSION: str = "v21.0"
GRAPH_BASE_URL: str = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
OAUTH_DIALOG_URL: str = f"https://www.facebook.com/{GRAPH_API_VERSION}/dialog/oauth"

REQUIRED_INSTAGRAM_SCOPES: list[str] = [
    "instagram_basic",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_manage_insights",
    "business_management",
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

# Combined — kept for backward compat if needed
ACCOUNT_INTERACTION_METRICS: str = "views,reach,follows_and_unfollows,total_interactions,accounts_engaged"

# Account-level demographic metrics (GET /{ig-user-id}/insights)
ACCOUNT_DEMOGRAPHIC_METRICS: list[str] = [
    "follower_demographics",
    "engaged_audience_demographics",
]

# Per-media metrics — FEED posts (GET /{media-id}/insights)
MEDIA_FEED_METRICS: str = "likes,comments,saved,shares,reach,views,total_interactions,profile_visits,reposts"

# Per-media metrics — REELS (GET /{media-id}/insights)
MEDIA_REELS_METRICS: str = (
    "likes,comments,saved,shares,reach,views,total_interactions,"
    "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reposts"
)

# Per-media metrics — STORY (GET /{media-id}/insights)
MEDIA_STORY_METRICS: str = "reach,views,shares,replies,navigation,reposts,total_interactions"

# Insights sync defaults
INSIGHTS_LOOKBACK_DAYS: int = 30

# Stories
STORY_FIELDS: str = "id,media_type,media_url,thumbnail_url,permalink,timestamp"
