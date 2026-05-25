"""Instagram profile domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class IGProfile:
    """Represents a row in the `instagram_profiles` table.

    `user_id` and `access_token` are populated only by from_token_row / direct
    construction; from_profile_row leaves them as Optional/empty because
    GET_INSTAGRAM_PROFILE doesn't select them. Callers must use `find_token`
    when they actually need the encrypted token.
    """

    id: UUID
    ig_user_id: str
    username: str
    name: str
    biography: str
    profile_picture_url: str
    followers_count: int
    follows_count: int
    media_count: int
    access_token: str = ""  # encrypted ciphertext, "" when only profile fetched
    user_id: UUID | None = None
    token_expires_at: datetime | None = None
    connected_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_profile_row(cls, row: tuple) -> IGProfile:
        """Construct from a GET_INSTAGRAM_PROFILE result row.

        Expected column order:
            id, ig_user_id, username, name, biography,
            profile_picture_url, followers_count, follows_count,
            media_count, connected_at
        """
        return cls(
            id=row[0] if isinstance(row[0], UUID) else UUID(str(row[0])),
            ig_user_id=row[1],
            username=row[2],
            name=row[3],
            biography=row[4],
            profile_picture_url=row[5],
            followers_count=row[6],
            follows_count=row[7],
            media_count=row[8],
            connected_at=row[9] if len(row) > 9 else None,
        )

    @classmethod
    def from_token_row(cls, row: tuple) -> IGProfile:
        """Construct from a GET_INSTAGRAM_TOKEN result row.

        Expected column order: ig_user_id, access_token, token_expires_at
        """
        return cls(
            id=UUID(int=0),
            ig_user_id=row[0],
            username="",
            name="",
            biography="",
            profile_picture_url="",
            followers_count=0,
            follows_count=0,
            media_count=0,
            access_token=row[1],
            token_expires_at=row[2] if len(row) > 2 else None,
        )

    def to_schema_dict(self) -> dict:
        """Return a dict suitable for InstagramProfile schema."""
        return {
            "id": str(self.id),
            "ig_user_id": self.ig_user_id,
            "username": self.username,
            "name": self.name,
            "biography": self.biography,
            "profile_picture_url": self.profile_picture_url,
            "followers_count": self.followers_count,
            "follows_count": self.follows_count,
            "media_count": self.media_count,
            "connected_at": str(self.connected_at) if self.connected_at else "",
        }
