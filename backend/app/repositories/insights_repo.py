"""Insights repository — all ClickHouse operations for insights tables."""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.account_insight import AccountInsight
from ..models.demographic_insight import DemographicInsight
from ..models.media_insight import MediaInsight

from ..models.queries import (
    GET_ACCOUNT_INSIGHTS,
    GET_DEMOGRAPHIC_INSIGHTS,
    GET_MEDIA_INSIGHTS,
    GET_MEDIA_NEEDING_SYNC,
)

logger = logging.getLogger(__name__)


# --- Account Insights ---

def bulk_upsert_account_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metric_rows: list[dict[str, Any]],
) -> int:
    """Batch-insert account insight time-series rows.

    Each item in metric_rows must have: metric_name, metric_value, end_time (datetime).
    Returns count of rows inserted.
    """
    if not metric_rows:
        return 0

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            r["metric_name"],
            r["metric_value"],
            "day",
            r["end_time"],
            now,
            now,
        ]
        for r in metric_rows
    ]

    client.insert(
        "account_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_user_id", "metric_name", "metric_value",
            "period", "end_time", "fetched_at", "updated_at",
        ],
    )
    logger.info("Upserted %d account insight rows for user %s", len(rows), user_id)
    return len(rows)


def find_account_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metrics: list[str],
    since: datetime,
) -> list[AccountInsight]:
    """Fetch account insight time-series rows for given metrics since a date."""
    rows = client.query(
        GET_ACCOUNT_INSIGHTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "metrics": metrics,
            "since": since,
        },
    )
    return [AccountInsight.from_row(r) for r in rows.result_rows]


# --- Demographic Insights ---

def bulk_upsert_demographic_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    demo_rows: list[dict[str, Any]],
) -> None:
    """Batch-insert demographic insight rows.

    Each item must have: metric_name, dimension_key, dimension_value, metric_value, timeframe.
    """
    if not demo_rows:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            r["metric_name"],
            r["dimension_key"],
            r["dimension_value"],
            r["metric_value"],
            r.get("timeframe", "this_month"),
            now,
            now,
        ]
        for r in demo_rows
    ]

    client.insert(
        "demographic_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_user_id", "metric_name", "dimension_key",
            "dimension_value", "metric_value", "timeframe", "fetched_at", "updated_at",
        ],
    )
    logger.info("Upserted %d demographic rows for user %s", len(rows), user_id)


def find_demographic_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metric_name: str,
    dimension_key: str,
) -> list[DemographicInsight]:
    """Fetch demographic breakdown rows for a given metric and dimension."""
    rows = client.query(
        GET_DEMOGRAPHIC_INSIGHTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "metric_name": metric_name,
            "dimension_key": dimension_key,
        },
    )
    return [DemographicInsight.from_row(r) for r in rows.result_rows]


# --- Media Insights ---

def bulk_upsert_media_insights(
    client: Client,
    user_id: str,
    ig_media_id: str,
    metric_rows: list[dict[str, Any]],
) -> None:
    """Batch-insert per-media insight rows.

    Each item must have: metric_name, metric_value.
    """
    if not metric_rows:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_media_id,
            r["metric_name"],
            float(r["metric_value"]),
            now,
            now,
        ]
        for r in metric_rows
    ]

    client.insert(
        "media_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_media_id", "metric_name",
            "metric_value", "fetched_at", "updated_at",
        ],
    )


def find_media_insights(
    client: Client,
    user_id: str,
    ig_media_id: str,
) -> list[MediaInsight]:
    """Fetch all insight metrics for a given media item."""
    rows = client.query(
        GET_MEDIA_INSIGHTS,
        parameters={"user_id": user_id, "ig_media_id": ig_media_id},
    )
    return [MediaInsight.from_row(r) for r in rows.result_rows]


def find_media_needing_sync(
    client: Client,
    user_id: str,
    stale_hours: int = 24,
) -> list[tuple[str, str]]:
    """Return (ig_media_id, media_product_type) for media whose insights are stale or never synced."""
    stale_threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=stale_hours)
    rows = client.query(
        GET_MEDIA_NEEDING_SYNC,
        parameters={"user_id": user_id, "stale_threshold": stale_threshold},
    )
    return [(r[0], r[1]) for r in rows.result_rows]
