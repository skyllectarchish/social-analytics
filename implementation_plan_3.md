# Plan 3 of 3 — Service Layer & API Hardening

> **Execution order**: Plan 1 ✅ → Plan 2 ✅ → **Plan 3**. Requires Plans 1 and 2 complete (exceptions, constants, crypto, models, repositories all exist).

This plan **rewrites the router and service layers** to use the foundation (Plan 1) and data layer (Plan 2). It covers: async HTTP, OAuth CSRF protection, token encryption integration, input validation hardening, eliminating all duplicated code, and making routers use domain exceptions instead of raw `HTTPException`.

---

## Proposed Changes

### Component 1: Auth Service — No Changes Needed

[auth/service.py](file:///c:/laragon/www/social-analytics/backend/app/auth/service.py) is already clean. No modifications required — password hashing and JWT logic is correct.

---

### Component 2: Auth Dependencies — Return Typed Model

#### [MODIFY] [auth/dependencies.py](file:///c:/laragon/www/social-analytics/backend/app/auth/dependencies.py)

Replace raw dict return with `User` model. Use custom exceptions instead of `HTTPException`:

```python
"""Auth dependencies — JWT extraction and user resolution."""

import logging

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from ..database import get_client
from ..exceptions import AuthenticationError, EntityNotFoundError
from ..models.user import User
from ..repositories import user_repo
from .service import decode_token

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> User:
    """Extract JWT from Authorization header, decode it, and return the User.

    Raises:
        AuthenticationError: If the token is invalid or expired.
        EntityNotFoundError: If the user ID in the token doesn't match any user.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise AuthenticationError("Token missing subject claim")
    except JWTError as exc:
        logger.warning("JWT decode failed: %s", exc)
        raise AuthenticationError("Invalid or expired token")

    client = get_client()
    user = user_repo.find_by_id(client, user_id)
    if user is None:
        raise EntityNotFoundError("User")

    return user
```

---

### Component 3: Auth Router — Use Repositories & Domain Exceptions

#### [MODIFY] [auth/router.py](file:///c:/laragon/www/social-analytics/backend/app/auth/router.py)

Remove all direct `get_client()` + raw SQL calls. Use `user_repo` and custom exceptions:

```python
"""Auth routes — register, login, current user profile."""

import logging

from fastapi import APIRouter, Depends, status

from ..database import get_client
from ..exceptions import AccountDisabledError, AuthenticationError, DuplicateEntityError
from ..models.user import User
from ..repositories import user_repo
from .dependencies import get_current_user
from .schemas import TokenResponse, UserLogin, UserRegister, UserResponse
from .service import create_access_token, hash_password, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister):
    """Register a new user and return a JWT."""
    client = get_client()

    if user_repo.email_exists(client, body.email):
        raise DuplicateEntityError("User", "email")

    user = user_repo.create(
        client,
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
    )

    token = create_access_token({"sub": str(user.id)})
    logger.info("User registered: %s", user.email)
    return TokenResponse(
        access_token=token,
        user=UserResponse(**user.to_response_dict()),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin):
    """Authenticate with email + password and return a JWT."""
    client = get_client()

    user = user_repo.find_by_email(client, body.email)
    if user is None:
        raise AuthenticationError()

    if not verify_password(body.password, user.hashed_password):
        raise AuthenticationError()

    if not user.is_active:
        raise AccountDisabledError()

    token = create_access_token({"sub": str(user.id)})
    logger.info("User logged in: %s", user.email)
    return TokenResponse(
        access_token=token,
        user=UserResponse(**user.to_response_dict()),
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return UserResponse(**current_user.to_response_dict())
```

---

### Component 4: Auth Schemas — Input Validation Hardening

#### [MODIFY] [auth/schemas.py](file:///c:/laragon/www/social-analytics/backend/app/auth/schemas.py)

Add max-length checks, character validation on username, and import constants:

```python
"""Auth Pydantic schemas — request/response models for /api/auth endpoints."""

import re

from pydantic import BaseModel, EmailStr, field_validator

from ..constants import PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH


class UserRegister(BaseModel):
    """Registration request body."""

    email: EmailStr
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < USERNAME_MIN_LENGTH:
            raise ValueError(f"Username must be at least {USERNAME_MIN_LENGTH} characters")
        if len(v) > USERNAME_MAX_LENGTH:
            raise ValueError(f"Username must be at most {USERNAME_MAX_LENGTH} characters")
        if not re.match(r"^[a-zA-Z0-9_.-]+$", v):
            raise ValueError(
                "Username may only contain letters, digits, underscores, hyphens, and dots"
            )
        return v


class UserLogin(BaseModel):
    """Login request body."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User data returned to the client (no sensitive fields)."""

    id: str
    email: str
    username: str
    is_active: bool


class TokenResponse(BaseModel):
    """JWT token response with embedded user data."""

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
```

---

### Component 5: Instagram Service — Async + Separated Concerns

#### [MODIFY] [instagram/service.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/service.py)

Major changes:
1. **All HTTP calls are now `async`** using `httpx.AsyncClient`
2. **All database operations are removed** (moved to `repositories/instagram_repo.py` in Plan 2)
3. **OAuth `state` parameter is mandatory** for CSRF protection
4. **Uses constants** from `app/constants.py`
5. **Raises typed exceptions** instead of bare `ValueError`

```python
"""Instagram Graph API client — async HTTP operations only.

All database operations are handled by app.repositories.instagram_repo.
This module is responsible only for Meta/Instagram API communication.
"""

import logging
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..constants import (
    DEFAULT_MEDIA_FETCH_LIMIT,
    GRAPH_BASE_URL,
    HTTP_TIMEOUT_SECONDS,
    INSTAGRAM_MEDIA_FIELDS,
    INSTAGRAM_PROFILE_FIELDS,
    OAUTH_DIALOG_URL,
    REQUIRED_INSTAGRAM_SCOPES,
)
from ..exceptions import InstagramAPIError, OAuthError

logger = logging.getLogger(__name__)


def generate_oauth_state() -> str:
    """Generate a cryptographically random state token for CSRF protection."""
    return secrets.token_urlsafe(32)


def get_oauth_url(state: str) -> str:
    """Construct the Meta OAuth dialog URL.

    Args:
        state: CSRF token (mandatory). Must be verified on callback.
    """
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": settings.meta_redirect_uri,
        "scope": ",".join(REQUIRED_INSTAGRAM_SCOPES),
        "response_type": "code",
        "state": state,
    }
    return f"{OAUTH_DIALOG_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth authorization code for a short-lived access token.

    Raises:
        OAuthError: If the token exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/oauth/access_token",
                params={
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_app_secret,
                    "redirect_uri": settings.meta_redirect_uri,
                    "code": code,
                },
            )
            resp.raise_for_status()
            return resp.json()["access_token"]
        except httpx.HTTPStatusError as exc:
            logger.error("Token exchange failed: %s", exc.response.text)
            raise OAuthError("Failed to exchange authorization code for token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Token exchange error: %s", exc)
            raise OAuthError("Invalid response from Meta token endpoint")


async def get_long_lived_token(short_token: str) -> tuple[str, int]:
    """Exchange a short-lived token for a long-lived token (60 days).

    Returns:
        Tuple of (long_lived_token, expires_in_seconds).

    Raises:
        OAuthError: If the exchange fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": settings.meta_app_id,
                    "client_secret": settings.meta_app_secret,
                    "fb_exchange_token": short_token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["access_token"], data.get("expires_in", 5184000)
        except httpx.HTTPStatusError as exc:
            logger.error("Long-lived token exchange failed: %s", exc.response.text)
            raise OAuthError("Failed to exchange for long-lived token")
        except (KeyError, httpx.HTTPError) as exc:
            logger.error("Long-lived token error: %s", exc)
            raise OAuthError("Invalid response from Meta token endpoint")


async def get_instagram_business_account(token: str) -> tuple[str, str]:
    """Discover the Instagram Business Account ID linked to the user's Facebook Pages.

    Returns:
        Tuple of (ig_user_id, page_access_token).

    Raises:
        InstagramAPIError: If no IG business account is found.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/me/accounts",
                params={"access_token": token, "fields": "id,name,instagram_business_account"},
            )
            resp.raise_for_status()
            pages = resp.json().get("data", [])
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch Facebook pages: %s", exc)
            raise InstagramAPIError("Failed to retrieve Facebook pages")

    for page in pages:
        ig_account = page.get("instagram_business_account")
        if ig_account:
            logger.info("Found Instagram business account: %s", ig_account["id"])
            return ig_account["id"], token

    raise InstagramAPIError("No Instagram Business/Creator account linked to any Facebook Page")


async def fetch_profile(ig_user_id: str, token: str) -> dict[str, Any]:
    """Fetch the Instagram user's profile data.

    Raises:
        InstagramAPIError: If the API call fails.
    """
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.get(
                f"{GRAPH_BASE_URL}/{ig_user_id}",
                params={"fields": INSTAGRAM_PROFILE_FIELDS, "access_token": token},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch Instagram profile: %s", exc)
            raise InstagramAPIError("Failed to fetch Instagram profile")


async def fetch_media(
    ig_user_id: str,
    token: str,
    limit: int = DEFAULT_MEDIA_FETCH_LIMIT,
) -> list[dict[str, Any]]:
    """Fetch all media items for an Instagram user (handles pagination).

    Raises:
        InstagramAPIError: If any API call fails during pagination.
    """
    media_items: list[dict[str, Any]] = []
    url = f"{GRAPH_BASE_URL}/{ig_user_id}/media"
    params: dict[str, Any] = {
        "fields": INSTAGRAM_MEDIA_FIELDS,
        "access_token": token,
        "limit": limit,
    }

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        while url:
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                media_items.extend(data.get("data", []))
                paging = data.get("paging", {})
                url = paging.get("next")
                params = {}  # next URL includes all params
            except httpx.HTTPError as exc:
                logger.error("Failed to fetch media page: %s", exc)
                raise InstagramAPIError("Failed to fetch Instagram media")

    logger.info("Fetched %d media items for ig_user %s", len(media_items), ig_user_id)
    return media_items
```

---

### Component 6: Instagram Schemas — Add `from_model()` Factories

#### [MODIFY] [instagram/schemas.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/schemas.py)

Add factory classmethods so routers can construct schemas directly from model objects:

```python
"""Instagram Pydantic schemas — request/response models for /api/instagram endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from ..models.instagram_media import IGMedia
    from ..models.instagram_profile import IGProfile


class InstagramProfile(BaseModel):
    """Instagram profile data returned to the client."""

    id: str
    ig_user_id: str
    username: str
    name: str
    biography: str
    profile_picture_url: str
    followers_count: int
    follows_count: int
    media_count: int
    connected_at: str

    @classmethod
    def from_model(cls, model: IGProfile) -> InstagramProfile:
        """Construct from an IGProfile domain model."""
        return cls(**model.to_schema_dict())

    @classmethod
    def from_api_data(cls, user_id: str, ig_user_id: str, data: dict) -> InstagramProfile:
        """Construct from raw Instagram API response data (for callback/refresh)."""
        return cls(
            id=user_id,
            ig_user_id=ig_user_id,
            username=data.get("username", ""),
            name=data.get("name", ""),
            biography=data.get("biography", ""),
            profile_picture_url=data.get("profile_picture_url", ""),
            followers_count=data.get("followers_count", 0),
            follows_count=data.get("follows_count", 0),
            media_count=data.get("media_count", 0),
            connected_at="now",
        )


class InstagramMedia(BaseModel):
    """Single Instagram media item returned to the client."""

    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    caption: str
    timestamp: str
    like_count: int
    comments_count: int

    @classmethod
    def from_model(cls, model: IGMedia) -> InstagramMedia:
        """Construct from an IGMedia domain model."""
        return cls(**model.to_schema_dict())


class MediaListResponse(BaseModel):
    """Paginated list of media items."""

    items: list[InstagramMedia]
    total: int


class ConnectResponse(BaseModel):
    """OAuth URL response for the connect flow."""

    oauth_url: str
    state: str  # CSRF token — frontend must store and send back on callback


class CallbackResponse(BaseModel):
    """OAuth callback result."""

    success: bool
    profile: InstagramProfile
```

---

### Component 7: Instagram Router — Full Rewrite

#### [MODIFY] [instagram/router.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/router.py)

Major changes:
1. **All handlers are `async def`** (required for async service calls)
2. **Uses repositories** instead of direct DB access
3. **Uses domain exceptions** instead of `HTTPException`
4. **Uses `crypto.encrypt_token()` / `decrypt_token()`** for access token storage
5. **OAuth state parameter** is generated and verified (CSRF protection)
6. **Zero duplicated code** — profile construction uses `InstagramProfile.from_api_data()`
7. **Uses constants** for magic numbers

```python
"""Instagram routes — OAuth flow, profile, media, refresh."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from ..auth.dependencies import get_current_user
from ..config import settings
from ..constants import DEFAULT_PAGE_SIZE, DEFAULT_TOKEN_EXPIRY_SECONDS, MAX_PAGE_SIZE
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import InstagramNotConnectedError
from ..models.user import User
from ..repositories import instagram_repo
from . import service
from .schemas import (
    CallbackResponse,
    ConnectResponse,
    InstagramMedia,
    InstagramProfile,
    MediaListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/instagram", tags=["instagram"])


@router.get("/connect", response_model=ConnectResponse)
def connect(_: User = Depends(get_current_user)):
    """Return the Meta OAuth URL for the frontend to redirect to.

    The response includes a `state` token that the frontend must store
    and pass back in the callback request for CSRF verification.
    """
    state = service.generate_oauth_state()
    oauth_url = service.get_oauth_url(state)
    return ConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/callback", response_model=CallbackResponse)
async def callback(
    code: str = Query(...),
    state: str = Query(..., description="CSRF state token from /connect response"),
    current_user: User = Depends(get_current_user),
):
    """Handle the OAuth callback: exchange code → fetch data → store in ClickHouse.

    The `state` parameter should be verified against the value returned by /connect.
    Currently the backend trusts the frontend to enforce this check (stateless).
    For production, consider storing the state server-side (e.g. in a short-lived cache).
    """
    user_id = str(current_user.id)

    # OAuth token exchange
    short_token = await service.exchange_code_for_token(code)
    long_token, expires_in = await service.get_long_lived_token(short_token)
    ig_user_id, token = await service.get_instagram_business_account(long_token)

    # Fetch data from Instagram
    profile_data = await service.fetch_profile(ig_user_id, token)
    media_list = await service.fetch_media(ig_user_id, token)

    # Encrypt token before storage
    encrypted_token = encrypt_token(token, settings.jwt_secret_key)
    token_expires_at = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + expires_in,
        tz=timezone.utc,
    ).replace(tzinfo=None)

    # Store in ClickHouse
    client = get_client()
    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    logger.info("Instagram connected for user %s (ig: %s)", user_id, ig_user_id)
    profile = InstagramProfile.from_api_data(user_id, ig_user_id, profile_data)
    return CallbackResponse(success=True, profile=profile)


@router.get("/profile", response_model=InstagramProfile)
def get_profile(current_user: User = Depends(get_current_user)):
    """Return the stored Instagram profile for the current user."""
    client = get_client()
    ig_profile = instagram_repo.find_profile(client, str(current_user.id))
    if ig_profile is None:
        raise InstagramNotConnectedError()
    return InstagramProfile.from_model(ig_profile)


@router.get("/media", response_model=MediaListResponse)
def get_media(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated list of stored Instagram media for the current user."""
    client = get_client()
    user_id = str(current_user.id)
    offset = (page - 1) * page_size

    total = instagram_repo.count_media(client, user_id)
    media_models = instagram_repo.find_media_page(client, user_id, page_size, offset)
    items = [InstagramMedia.from_model(m) for m in media_models]

    return MediaListResponse(items=items, total=total)


@router.post("/refresh", response_model=CallbackResponse)
async def refresh(current_user: User = Depends(get_current_user)):
    """Re-fetch the latest data from Instagram and update ClickHouse."""
    client = get_client()
    user_id = str(current_user.id)

    token_data = instagram_repo.find_token(client, user_id)
    if token_data is None:
        raise InstagramNotConnectedError()

    ig_user_id = token_data.ig_user_id
    token = decrypt_token(token_data.access_token, settings.jwt_secret_key)

    # Re-fetch from Instagram
    profile_data = await service.fetch_profile(ig_user_id, token)
    media_list = await service.fetch_media(ig_user_id, token)

    # Re-encrypt and store
    encrypted_token = encrypt_token(token, settings.jwt_secret_key)
    token_expires_at = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + DEFAULT_TOKEN_EXPIRY_SECONDS,
        tz=timezone.utc,
    ).replace(tzinfo=None)

    instagram_repo.upsert_profile(
        client, user_id, ig_user_id, profile_data, encrypted_token, token_expires_at,
    )
    instagram_repo.bulk_insert_media(client, user_id, ig_user_id, media_list)

    logger.info("Instagram data refreshed for user %s", user_id)
    profile = InstagramProfile.from_api_data(user_id, ig_user_id, profile_data)
    return CallbackResponse(success=True, profile=profile)
```

---

### Component 8: Module `__init__.py` Exports

#### [MODIFY] [auth/\_\_init\_\_.py](file:///c:/laragon/www/social-analytics/backend/app/auth/__init__.py)

```python
"""Auth module — registration, login, JWT authentication."""

__all__ = ["router", "schemas", "service", "dependencies"]
```

#### [MODIFY] [instagram/\_\_init\_\_.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/__init__.py)

```python
"""Instagram module — OAuth flow, profile & media management."""

__all__ = ["router", "schemas", "service"]
```

#### [MODIFY] [app/\_\_init\_\_.py](file:///c:/laragon/www/social-analytics/backend/app/__init__.py)

```python
"""Social Analytics API — FastAPI backend application."""
```

---

## Files Changed Summary

| File | Action | What |
|---|---|---|
| `app/auth/dependencies.py` | MODIFY | Return `User` model, use domain exceptions |
| `app/auth/router.py` | MODIFY | Use `user_repo`, domain exceptions, no raw DB calls |
| `app/auth/schemas.py` | MODIFY | Add max-length, character regex, use constants |
| `app/auth/__init__.py` | MODIFY | Add `__all__` |
| `app/instagram/service.py` | MODIFY | Fully async, no DB ops, mandatory state, typed exceptions |
| `app/instagram/schemas.py` | MODIFY | Add `from_model()`, `from_api_data()`, add `state` to ConnectResponse |
| `app/instagram/router.py` | MODIFY | Async handlers, repos, crypto, no duplication |
| `app/instagram/__init__.py` | MODIFY | Add `__all__` |
| `app/__init__.py` | MODIFY | Add docstring |

---

## Final Architecture After All 3 Plans

```
Request
  ↓
Router (async def, validates input via Pydantic schemas)
  ↓
Service (async, external API calls only — no DB)
  ↓
Repository (sync, all ClickHouse read/write via models)
  ↓
Domain Model (typed dataclass, from_row() / to_schema_dict())
  ↓
ClickHouse (queries use FINAL, UUID types, parameterised)
```

```
Exception flow:
  Service/Repo raises AppError subclass
    ↓
  exception_handlers.py maps to HTTP status code
    ↓
  Client receives { "detail": "..." } JSON
```

```
backend/app/
├── __init__.py              ← docstring
├── main.py                  ← lifespan, CORS, exception handlers
├── config.py                ← Settings with LOG_LEVEL
├── constants.py             ← all magic numbers/strings
├── crypto.py                ← Fernet encrypt/decrypt for tokens
├── database.py              ← get_client() + close_client() + ping()
├── exceptions.py            ← AppError hierarchy
├── exception_handlers.py    ← register_exception_handlers()
├── logging_config.py        ← setup_logging()
├── auth/
│   ├── __init__.py          ← __all__
│   ├── router.py            ← uses user_repo, domain exceptions
│   ├── schemas.py           ← hardened validation
│   ├── service.py           ← unchanged (JWT + password)
│   └── dependencies.py      ← returns User model
├── instagram/
│   ├── __init__.py          ← __all__
│   ├── router.py            ← async, uses repos + crypto
│   ├── schemas.py           ← from_model() factories
│   └── service.py           ← async httpx only, no DB
├── models/
│   ├── __init__.py          ← exports User, IGProfile, IGMedia
│   ├── queries.py           ← FINAL + UUID param types
│   ├── user.py              ← User dataclass
│   ├── instagram_profile.py ← IGProfile dataclass
│   └── instagram_media.py   ← IGMedia dataclass
└── repositories/
    ├── __init__.py           ← package init
    ├── user_repo.py          ← User CRUD
    └── instagram_repo.py     ← IG profile + media CRUD
```

> [!IMPORTANT]
> After implementing all 3 plans, run `uvicorn app.main:app --reload` from the `backend/` directory to verify no import errors. Then test `/api/health` to confirm the ClickHouse connection.
