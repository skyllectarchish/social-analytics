"""Application exception hierarchy.

All custom exceptions inherit from AppError so they can be caught
in a single FastAPI exception handler.
"""


class AppError(Exception):
    """Base exception for the application."""

    def __init__(self, message: str = "An unexpected error occurred") -> None:
        self.message = message
        super().__init__(self.message)


# --- Auth ---

class AuthenticationError(AppError):
    """Raised when credentials are invalid or token is expired/malformed."""

    def __init__(self, message: str = "Invalid credentials") -> None:
        super().__init__(message)


class DuplicateEntityError(AppError):
    """Raised when a unique-constraint violation occurs (e.g. duplicate email)."""

    def __init__(self, entity: str = "Entity", field: str = "field") -> None:
        super().__init__(f"{entity} with this {field} already exists")


class AccountDisabledError(AppError):
    """Raised when a deactivated user tries to authenticate."""

    def __init__(self) -> None:
        super().__init__("Account is disabled")


# --- Instagram ---

class InstagramNotConnectedError(AppError):
    """Raised when no Instagram account is linked to the user."""

    def __init__(self) -> None:
        super().__init__("No Instagram account connected")


class InstagramAPIError(AppError):
    """Raised when an Instagram/Meta Graph API call fails (network/5xx/Meta-side)."""

    def __init__(self, message: str = "Instagram API request failed") -> None:
        super().__init__(message)


class InstagramSetupError(AppError):
    """Raised when the user's Instagram account isn't set up correctly for analytics.

    Distinct from InstagramAPIError: this is a user-fixable configuration problem
    (e.g. account isn't Business/Creator, missing scope grant), not a Meta outage.
    Surfaced as 400 with the full message so the UI can guide the user.
    """

    def __init__(self, message: str = "Instagram account not set up for analytics") -> None:
        super().__init__(message)


class OAuthError(AppError):
    """Raised when the OAuth flow encounters an error."""

    def __init__(self, message: str = "OAuth flow failed") -> None:
        super().__init__(message)


# --- Database ---

class DatabaseError(AppError):
    """Raised when a database operation fails."""

    def __init__(self, message: str = "Database operation failed") -> None:
        super().__init__(message)


class EntityNotFoundError(AppError):
    """Raised when a queried entity does not exist."""

    def __init__(self, entity: str = "Entity") -> None:
        super().__init__(f"{entity} not found")


# --- AI / Tier 4 ---

class AIError(AppError):
    """Base for all AI-feature errors. Routes raise these and the global
    handler translates them to HTTP status codes + the documented `code`
    field in `detail` that the frontend's error taxonomy consumes."""

    code: str = "unknown"

    def __init__(self, message: str = "AI request failed") -> None:
        super().__init__(message)


class AINotConfiguredError(AIError):
    """ANTHROPIC_API_KEY is unset. Routes that need the LLM return 503."""

    code = "not_configured"

    def __init__(self) -> None:
        super().__init__("AI features are not configured")


class QuotaExhaustedError(AIError):
    """User has reached their monthly AI call quota."""

    code = "quota_exhausted"

    def __init__(self, resets_at: str | None = None) -> None:
        suffix = f" Resets {resets_at}." if resets_at else ""
        super().__init__(f"Monthly AI call limit reached.{suffix}")


class MediaNotEligibleError(AIError):
    """Media target is ineligible for diagnostics (typically < 24h old)."""

    code = "media_not_eligible"

    def __init__(self, message: str = "Media not eligible for diagnostic") -> None:
        super().__init__(message)


class AIProviderError(AIError):
    """Anthropic API hit an error (5xx, timeout, or upstream issue)."""

    code = "upstream_error"

    def __init__(self, message: str = "AI provider request failed",
                 code: str = "upstream_error") -> None:
        self.code = code
        super().__init__(message)


class AICircuitOpenError(AIError):
    """Circuit breaker is tripped — short-circuit instead of calling the provider."""

    code = "upstream_error"

    def __init__(self) -> None:
        super().__init__("AI provider temporarily unavailable")
