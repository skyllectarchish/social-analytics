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
