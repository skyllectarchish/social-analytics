"""Instagram media domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class IGMedia:
    """Represents a row in the `instagram_media` table."""

    ig_media_id: str
    media_type: str
    media_url: str
    thumbnail_url: str
    permalink: str
    caption: str
    timestamp: datetime
    like_count: int
    comments_count: int

    @classmethod
    def from_row(cls, row: tuple) -> IGMedia:
        """Construct from a GET_INSTAGRAM_MEDIA_PAGE result row.

        Expected column order:
            ig_media_id, media_type, media_url, thumbnail_url,
            permalink, caption, timestamp, like_count, comments_count
        """
        return cls(
            ig_media_id=row[0],
            media_type=row[1],
            media_url=row[2],
            thumbnail_url=row[3],
            permalink=row[4],
            caption=row[5],
            timestamp=row[6],
            like_count=row[7],
            comments_count=row[8],
        )

    def to_schema_dict(self) -> dict:
        """Return a dict suitable for InstagramMedia schema."""
        return {
            "ig_media_id": self.ig_media_id,
            "media_type": self.media_type,
            "media_url": self.media_url,
            "thumbnail_url": self.thumbnail_url,
            "permalink": self.permalink,
            "caption": self.caption,
            "timestamp": str(self.timestamp),
            "like_count": self.like_count,
            "comments_count": self.comments_count,
        }
