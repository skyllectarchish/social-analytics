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
    """Raised when an Instagram/Meta Graph API call fails."""

    def __init__(self, message: str = "Instagram API request failed") -> None:
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
