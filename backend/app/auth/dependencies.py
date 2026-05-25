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
        sub = payload.get("sub")
        # Enforce sub-type: a forged token with `sub=[...]`/`sub={...}` would
        # otherwise be passed through to find_by_id as a non-string.
        if not isinstance(sub, str) or not sub:
            raise AuthenticationError("Token missing subject claim")
        user_id: str = sub
    except JWTError as exc:
        logger.warning("JWT decode failed: %s", exc)
        raise AuthenticationError("Invalid or expired token")
    except AuthenticationError:
        raise
    except Exception as exc:
        # Catch malformed-token cases (binascii errors, KeyError on missing
        # required claim, etc.) and surface as auth failure instead of 500.
        logger.warning("JWT processing failed: %s", exc)
        raise AuthenticationError("Invalid or expired token")

    client = get_client()
    user = user_repo.find_by_id(client, user_id)
    if user is None:
        raise EntityNotFoundError("User")

    return user
