from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from ..config import settings

# Pin bcrypt cost so it stays consistent across passlib upgrades (default
# drifts over time as the library bumps its recommendation).
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict[str, Any]) -> str:
    to_encode = data.copy()
    issued_at = datetime.now(timezone.utc)
    expire = issued_at + timedelta(minutes=settings.jwt_expiration_minutes)
    to_encode["iat"] = issued_at
    to_encode["nbf"] = issued_at
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    # Require sub and exp so a malformed token with a stripped subject can't
    # silently authenticate as nobody.
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp"]},
    )
