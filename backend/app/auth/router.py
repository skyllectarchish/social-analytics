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

# A bcrypt hash of a random throwaway password used to equalize verify_password
# latency when no user is found, so the response time on /login doesn't reveal
# whether an email is registered.
_BOGUS_PASSWORD_HASH = hash_password("not-a-real-password")


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
        # Run a dummy verify_password so the response time matches the
        # found-user branch — otherwise the latency delta leaks which emails
        # are registered.
        verify_password(body.password, _BOGUS_PASSWORD_HASH)
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
