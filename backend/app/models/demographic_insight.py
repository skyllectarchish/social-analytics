"""Demographic insight domain model."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DemographicInsight:
    """Represents a row in the `demographic_insights` table."""

    metric_name: str
    dimension_key: str
    dimension_value: str
    metric_value: int
    timeframe: str

    @classmethod
    def from_row(cls, row: tuple) -> DemographicInsight:
        """Construct from a GET_DEMOGRAPHIC_INSIGHTS result row.

        Expected column order: metric_name, dimension_key, dimension_value, metric_value, timeframe
        """
        return cls(
            metric_name=row[0],
            dimension_key=row[1],
            dimension_value=row[2],
            metric_value=row[3],
            timeframe=row[4],
        )
