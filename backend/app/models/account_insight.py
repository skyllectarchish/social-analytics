"""Account insight domain model."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class AccountInsight:
    """Represents a row in the `account_insights` table."""

    metric_name: str
    # ClickHouse stores metric_value as Decimal/Float for some metrics
    # (e.g. follower_count → int, save_rate → float). Use float so the
    # annotation matches what `from_row` actually receives.
    metric_value: float
    end_time: datetime

    @classmethod
    def from_row(cls, row: tuple) -> AccountInsight:
        """Construct from a GET_ACCOUNT_INSIGHTS result row.

        Expected column order: metric_name, metric_value, end_time
        """
        return cls(
            metric_name=row[0],
            metric_value=float(row[1]) if row[1] is not None else 0.0,
            end_time=row[2],
        )
