"""Shared OAuth CSRF state helpers used by both Instagram and YouTube flows."""

import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from .config import settings
from .exceptions import OAuthError


def create_signed_oauth_state(user_id: str, purpose: str) -> str:
    """Mint a signed, short-lived JWT state token bound to the logged-in user."""
    payload = {
        "uid": user_id,
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(tz=timezone.utc)
        + timedelta(seconds=settings.oauth_state_ttl_seconds),
        "purpose": purpose,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_oauth_state(state: str, expected_user_id: str, purpose: str) -> None:
    """Verify a state token on /callback. Raises OAuthError on any failure."""
    try:
        payload = jwt.decode(
            state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise OAuthError("Invalid or expired OAuth state token")
    if payload.get("purpose") != purpose or payload.get("uid") != expected_user_id:
        raise OAuthError("OAuth state user mismatch")
