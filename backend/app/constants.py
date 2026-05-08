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
    "id,media_type,media_url,thumbnail_url,permalink,"
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
