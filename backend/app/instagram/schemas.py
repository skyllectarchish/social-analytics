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
