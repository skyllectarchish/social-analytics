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
    state: str | None = Query(None, description="CSRF state token from /connect response"),
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
