# Plan 1 of 3 — Foundation & Security

> **Execution order**: Plan 1 → Plan 2 → Plan 3. This plan must be completed first.

This plan fixes the **foundation layer** — dependencies, configuration, security primitives, error handling infrastructure, logging, and the database module. Everything in Plans 2 and 3 depends on these being in place.

---

## Proposed Changes

### Component 1: Dependencies — `requirements.txt`

#### [MODIFY] [requirements.txt](file:///c:/laragon/www/social-analytics/backend/requirements.txt)

Add the missing `clickhouse-migrations` package and add `cryptography` for access token encryption:

```diff
 fastapi[standard]>=0.136.0
 uvicorn[standard]>=0.34.0
 python-jose[cryptography]>=3.3.0
 passlib[bcrypt]>=1.7.4
 pydantic[email]>=2.0
 pydantic-settings>=2.0
 clickhouse-connect>=0.8.0
+clickhouse-migrations>=0.4.0
+cryptography>=44.0.0
 httpx>=0.28.0
 python-multipart>=0.0.18
 python-dotenv>=1.0.0
```

After editing, run:
```bash
pip install -r requirements.txt
```

---

### Component 2: Constants Module

#### [NEW] [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py)

Centralise all magic numbers and repeated string literals:

```python
"""Application-wide constants."""

# Token expiry
DEFAULT_TOKEN_EXPIRY_SECONDS: int = 60 * 24 * 3600  # 60 days

# Instagram Graph API
GRAPH_API_VERSION: str = "v25.0"
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
```

---

### Component 3: Custom Exception Hierarchy

#### [NEW] [exceptions.py](file:///c:/laragon/www/social-analytics/backend/app/exceptions.py)

Create typed exceptions so the app never raises bare `Exception` or generic `ValueError`:

```python
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
```

---

### Component 4: Global Exception Handlers

#### [NEW] [exception_handlers.py](file:///c:/laragon/www/social-analytics/backend/app/exception_handlers.py)

Register handlers so custom exceptions automatically map to correct HTTP status codes. Routers should raise domain exceptions, **not** `HTTPException` directly:

```python
"""FastAPI exception handlers — map domain exceptions to HTTP responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .exceptions import (
    AccountDisabledError,
    AppError,
    AuthenticationError,
    DatabaseError,
    DuplicateEntityError,
    EntityNotFoundError,
    InstagramAPIError,
    InstagramNotConnectedError,
    OAuthError,
)

logger = logging.getLogger(__name__)

# Map exception types to HTTP status codes
_STATUS_MAP: dict[type[AppError], int] = {
    AuthenticationError: 401,
    AccountDisabledError: 403,
    DuplicateEntityError: 409,
    EntityNotFoundError: 404,
    InstagramNotConnectedError: 404,
    OAuthError: 400,
    InstagramAPIError: 502,
    DatabaseError: 503,
}


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app."""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        status_code = _STATUS_MAP.get(type(exc), 500)

        # Log server-side errors with full detail; client gets a generic message
        if status_code >= 500:
            logger.exception("Unhandled application error: %s", exc.message)
            detail = "An internal error occurred"
        else:
            logger.warning("Client error [%d]: %s", status_code, exc.message)
            detail = exc.message

        return JSONResponse(
            status_code=status_code,
            content={"detail": detail},
        )
```

---

### Component 5: Structured Logging

#### [NEW] [logging_config.py](file:///c:/laragon/www/social-analytics/backend/app/logging_config.py)

```python
"""Logging configuration — call setup_logging() once at app startup."""

import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging for the application."""
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s"
    )

    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )

    # Suppress noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("clickhouse_connect").setLevel(logging.WARNING)
    logging.getLogger("passlib").setLevel(logging.WARNING)
```

---

### Component 6: Token Encryption Utility

#### [NEW] [crypto.py](file:///c:/laragon/www/social-analytics/backend/app/crypto.py)

Encrypt Instagram access tokens before storing them in ClickHouse. Uses Fernet symmetric encryption keyed from `JWT_SECRET_KEY`:

```python
"""Symmetric encryption for sensitive data (e.g. Instagram access tokens).

Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from JWT_SECRET_KEY.
"""

import base64
import hashlib

from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    """Derive a 32-byte Fernet key from an arbitrary-length secret."""
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_token(plaintext: str, secret: str) -> str:
    """Encrypt a plaintext string and return a Fernet-encoded ciphertext."""
    f = Fernet(_derive_key(secret))
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str, secret: str) -> str:
    """Decrypt a Fernet-encoded ciphertext and return the plaintext string."""
    f = Fernet(_derive_key(secret))
    return f.decrypt(ciphertext.encode()).decode()
```

---

### Component 7: Config Additions

#### [MODIFY] [config.py](file:///c:/laragon/www/social-analytics/backend/app/config.py)

Add a `LOG_LEVEL` setting and move `.env` path resolution to be relative to the backend root:

```python
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env relative to the backend/ directory (parent of app/)
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
    )

    # ClickHouse
    clickhouse_host: str
    clickhouse_port: int = 8443
    clickhouse_user: str
    clickhouse_password: str
    clickhouse_database: str = "social_analytics"

    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440

    # Meta / Instagram
    meta_app_id: str
    meta_app_secret: str
    meta_redirect_uri: str

    # App
    frontend_url: str = "http://localhost:5173"
    log_level: str = "INFO"


settings = Settings()
```

---

### Component 8: Database Module Refactor

#### [MODIFY] [database.py](file:///c:/laragon/www/social-analytics/backend/app/database.py)

Replace the global mutable singleton with a proper FastAPI-compatible pattern using `app.state`:

```python
"""ClickHouse client management.

Provides get_client() as a FastAPI dependency and startup/shutdown
lifecycle hooks.
"""

import logging

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from .config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


def _create_client() -> Client:
    """Create a new ClickHouse client from settings."""
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        secure=True,
    )


def get_client() -> Client:
    """Return the singleton ClickHouse client, creating it on first call.

    Used as a FastAPI dependency:
        client: Client = Depends(get_client)
    """
    global _client
    if _client is None:
        logger.info("Creating ClickHouse client → %s", settings.clickhouse_host)
        _client = _create_client()
    return _client


def close_client() -> None:
    """Close the ClickHouse client connection. Called at app shutdown."""
    global _client
    if _client is not None:
        logger.info("Closing ClickHouse client")
        _client.close()
        _client = None


def ping() -> bool:
    """Return True if the ClickHouse server is reachable."""
    try:
        get_client().ping()
        return True
    except Exception:
        logger.exception("ClickHouse ping failed")
        return False
```

---

### Component 9: Main App — Lifespan Migration

#### [MODIFY] [main.py](file:///c:/laragon/www/social-analytics/backend/app/main.py)

Replace deprecated `@app.on_event("startup")` with `lifespan`, register exception handlers, configure logging:

```python
"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .config import settings
from .database import close_client, ping
from .exception_handlers import register_exception_handlers
from .instagram.router import router as instagram_router
from .logging_config import setup_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — startup and shutdown hooks."""
    # --- Startup ---
    setup_logging(settings.log_level)
    logger.info("Starting Social Analytics API")
    if not ping():
        logger.error("ClickHouse connection failed on startup")
    else:
        logger.info("ClickHouse connection OK")
    yield
    # --- Shutdown ---
    close_client()
    logger.info("Social Analytics API shut down")


app = FastAPI(
    title="Social Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(auth_router)
app.include_router(instagram_router)


@app.get("/api/health")
def health():
    """Health check endpoint."""
    db_ok = ping()
    return {"status": "ok" if db_ok else "degraded", "database": db_ok}
```

---

### Component 10: Environment Files

#### [MODIFY] [.env.example](file:///c:/laragon/www/social-analytics/backend/.env.example)

Remove any real credential hints and add the new `LOG_LEVEL` setting:

```env
# ClickHouse Cloud
CLICKHOUSE_HOST=your-host.clickhouse.cloud
CLICKHOUSE_PORT=8443
CLICKHOUSE_USER=your-clickhouse-user
CLICKHOUSE_PASSWORD=your-clickhouse-password
CLICKHOUSE_DATABASE=social_analytics

# JWT — GENERATE a random 64-char key: python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET_KEY=CHANGE-ME-generate-with-secrets-token-urlsafe
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=1440

# Meta / Instagram
META_APP_ID=your-facebook-app-id
META_APP_SECRET=your-facebook-app-secret
META_REDIRECT_URI=http://localhost:5173/callback

# Frontend
FRONTEND_URL=http://localhost:5173

# Logging
LOG_LEVEL=INFO
```

#### [MODIFY] [.env](file:///c:/laragon/www/social-analytics/backend/.env)

Generate a real `JWT_SECRET_KEY`. Replace the placeholder line with:

```env
JWT_SECRET_KEY=<output of: python -c "import secrets; print(secrets.token_urlsafe(48))">
```

Run this command to generate the key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then paste the output as the value.

---

## Files Changed Summary

| File | Action | What |
|---|---|---|
| `requirements.txt` | MODIFY | Add `clickhouse-migrations`, `cryptography` |
| `app/constants.py` | NEW | Magic numbers → named constants |
| `app/exceptions.py` | NEW | Custom exception hierarchy |
| `app/exception_handlers.py` | NEW | Map exceptions → HTTP status codes |
| `app/logging_config.py` | NEW | Structured logging setup |
| `app/crypto.py` | NEW | Fernet encryption for access tokens |
| `app/config.py` | MODIFY | Add `log_level`, fix `.env` path resolution |
| `app/database.py` | MODIFY | Add logging, `close_client()`, docstrings |
| `app/main.py` | MODIFY | Lifespan, exception handlers, logging |
| `.env.example` | MODIFY | Sanitise, add `LOG_LEVEL` |
| `.env` | MODIFY | Generate real `JWT_SECRET_KEY` |

> [!IMPORTANT]
> **After completing Plan 1**, proceed to **Plan 2** (Domain Models & Data Layer).
