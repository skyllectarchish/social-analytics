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
    GET_ALGORITHM_METRICS_POSTS,
    GET_ALGORITHM_METRICS_SUMMARY,
    GET_BEST_TIME_POSTS,
    GET_BEST_TIME_TO_POST,
    GET_DEMOGRAPHIC_INSIGHTS,
    GET_FOLLOWER_QUALITY_BY_COHORT,
    GET_FOLLOWER_QUALITY_SUMMARY,
    GET_FOLLOWER_SPIKES,
    GET_FORMAT_BREAKDOWN,
    GET_FORMAT_BREAKDOWN_POSTS,
    GET_MEDIA_INSIGHTS,
    GET_MEDIA_NEEDING_SYNC,
    GET_REELS_RETENTION,
    GET_REELS_RETENTION_TREND,
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


# --- Feature 1: Content-Format Performance Breakdown ---

def find_format_breakdown(
    client: Client,
    user_id: str,
    since: datetime,
) -> list[dict]:
    """Return per-format aggregate performance metrics."""
    rows = client.query(
        GET_FORMAT_BREAKDOWN,
        parameters={"user_id": user_id, "since": since},
    )
    cols = [
        "media_product_type", "media_type", "post_count",
        "avg_reach", "avg_views", "avg_likes", "avg_saves", "avg_shares",
        "avg_interactions", "avg_engagement_rate", "avg_save_rate", "avg_share_rate",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


# --- Feature 2: Best Time to Post ---

def find_best_time_to_post(
    client: Client,
    user_id: str,
    since: datetime,
    min_sample: int = 3,
) -> list[dict]:
    """Return engagement-by-hour heatmap rows."""
    rows = client.query(
        GET_BEST_TIME_TO_POST,
        parameters={
            "user_id": user_id,
            "since": since,
            "min_sample": min_sample,
        },
    )
    cols = [
        "day_of_week", "hour_of_day", "sample_size",
        "avg_interactions", "avg_reach", "avg_engagement_rate",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


# --- Feature 3: Algorithm Metrics ---

def find_algorithm_metrics_posts(
    client: Client,
    user_id: str,
    since: datetime,
    limit: int = 20,
) -> list[dict]:
    """Return per-post save rate, share rate, and algorithm score."""
    rows = client.query(
        GET_ALGORITHM_METRICS_POSTS,
        parameters={"user_id": user_id, "since": since, "limit": limit},
    )
    cols = [
        "ig_media_id", "media_product_type", "media_type",
        "permalink", "thumbnail_url", "media_url", "caption", "timestamp",
        "saved", "shares", "reach", "likes", "comments",
        "save_rate", "share_rate", "algorithm_score",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


def find_algorithm_metrics_summary(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
) -> dict:
    """Return account-level aggregate save/share rates."""
    rows = client.query(
        GET_ALGORITHM_METRICS_SUMMARY,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "since": since},
    )
    if not rows.result_rows:
        return {
            "total_saves": 0.0, "total_shares": 0.0, "total_reach": 0.0,
            "account_save_rate": 0.0, "account_share_rate": 0.0,
        }
    r = rows.result_rows[0]
    return {
        "total_saves": float(r[0]),
        "total_shares": float(r[1]),
        "total_reach": float(r[2]),
        "account_save_rate": float(r[3]),
        "account_share_rate": float(r[4]),
    }


# --- Feature 4: Reels Retention ---

def find_reels_retention(
    client: Client,
    user_id: str,
    since: datetime,
    limit: int = 50,
) -> list[tuple]:
    return client.query(
        GET_REELS_RETENTION,
        parameters={"user_id": user_id, "since": since, "limit": limit},
    ).result_rows


def find_reels_retention_trend(
    client: Client,
    user_id: str,
    since: datetime,
) -> list[tuple]:
    return client.query(
        GET_REELS_RETENTION_TREND,
        parameters={"user_id": user_id, "since": since},
    ).result_rows


# --- Feature 5: Follower Quality Score ---

def find_follower_quality(
    client: Client,
    user_id: str,
    ig_user_id: str,
    breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_BY_COHORT,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows


def find_follower_quality_summary(
    client: Client,
    user_id: str,
    ig_user_id: str,
    breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_SUMMARY,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows


def find_follower_spikes(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    spike_threshold: int,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_SPIKES,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "spike_threshold": spike_threshold,
        },
    ).result_rows


# --- Phase 7: Drill-Down APIs ---

def find_format_breakdown_posts(
    client: Client,
    user_id: str,
    since: datetime,
    format_type: str,
    limit: int = 20,
) -> list[tuple]:
    return client.query(
        GET_FORMAT_BREAKDOWN_POSTS,
        parameters={"user_id": user_id, "since": since, "format": format_type, "limit": limit},
    ).result_rows


def find_best_time_posts(
    client: Client,
    user_id: str,
    since: datetime,
    day_of_week: int,
    hour_of_day: int,
) -> list[tuple]:
    return client.query(
        GET_BEST_TIME_POSTS,
        parameters={
            "user_id": user_id,
            "since": since,
            "day_of_week": day_of_week,
            "hour_of_day": hour_of_day,
        },
    ).result_rows
