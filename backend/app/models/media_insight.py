"""Media insight domain model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MediaInsight:
    """Represents a row in the `media_insights` table."""

    ig_media_id: str
    metric_name: str
    metric_value: float

    @classmethod
    def from_row(cls, row: tuple) -> MediaInsight:
        """Construct from a GET_MEDIA_INSIGHTS result row.

        Expected column order: ig_media_id, metric_name, metric_value
        """
        return cls(
            ig_media_id=row[0],
            metric_name=row[1],
            metric_value=row[2],
        )
