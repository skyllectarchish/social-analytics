"""YouTube repository — all ClickHouse operations for YouTube tables."""

import logging
import uuid
from datetime import datetime, timezone

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    COUNT_YOUTUBE_VIDEOS,
    GET_YOUTUBE_CHANNEL,
    GET_YOUTUBE_DAILY_METRICS,
    GET_YOUTUBE_LATEST_ANNOTATION_GENERATED,
    GET_YOUTUBE_LATEST_RETENTION_FETCH,
    GET_YOUTUBE_RETENTION_ANNOTATIONS,
    GET_YOUTUBE_RETENTION_CURVE,
    GET_YOUTUBE_TOKEN,
    GET_YOUTUBE_VIDEOS_PAGE,
)

logger = logging.getLogger(__name__)


# --- Tokens ---

def find_token(client: Client, user_id: str) -> dict | None:
    rows = client.query(GET_YOUTUBE_TOKEN, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    return {"yt_channel_id": rows[0][0], "refresh_token": rows[0][1]}


def upsert_token(client: Client, user_id: str, yt_channel_id: str, encrypted_refresh_token: str) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_tokens",
        [[str(uuid.uuid4()), user_id, yt_channel_id, encrypted_refresh_token, now, now]],
        column_names=["id", "user_id", "yt_channel_id", "refresh_token", "connected_at", "updated_at"],
    )


def delete_token(client: Client, user_id: str) -> None:
    client.command(
        "ALTER TABLE youtube_tokens DELETE WHERE user_id = {uid:UUID}",
        parameters={"uid": user_id},
        settings={"mutations_sync": 2},
    )


# --- Channels ---

def find_channel(client: Client, user_id: str) -> dict | None:
    rows = client.query(GET_YOUTUBE_CHANNEL, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {
        "yt_channel_id": r[0], "title": r[1], "description": r[2],
        "thumbnail_url": r[3], "subscriber_count": int(r[4]),
        "video_count": int(r[5]), "view_count": int(r[6]),
        "hidden_subscriber_count": bool(r[7]), "fetched_at": str(r[8]),
    }


def upsert_channel(client: Client, user_id: str, channel_data: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_channels",
        [[
            str(uuid.uuid4()), user_id,
            channel_data["yt_channel_id"], channel_data.get("title", ""),
            channel_data.get("description", ""), channel_data.get("thumbnail_url", ""),
            int(channel_data.get("subscriber_count", 0)), int(channel_data.get("video_count", 0)),
            int(channel_data.get("view_count", 0)),
            int(bool(channel_data.get("hidden_subscriber_count", False))), now,
        ]],
        column_names=[
            "id", "user_id", "yt_channel_id", "title", "description", "thumbnail_url",
            "subscriber_count", "video_count", "view_count", "hidden_subscriber_count", "fetched_at",
        ],
    )


# --- Videos ---

def count_videos(client: Client, user_id: str, yt_channel_id: str) -> int:
    rows = client.query(COUNT_YOUTUBE_VIDEOS, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
    }).result_rows
    return int(rows[0][0]) if rows else 0


def find_videos_page(client: Client, user_id: str, yt_channel_id: str, limit: int, offset: int) -> list[dict]:
    rows = client.query(GET_YOUTUBE_VIDEOS_PAGE, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
        "limit": limit, "offset": offset,
    }).result_rows
    return [
        {
            "video_id": r[0], "title": r[1], "thumbnail_url": r[2],
            "published_at": str(r[3]), "duration_seconds": int(r[4]),
            "video_format": r[5], "view_count": int(r[6]),
            "like_count": int(r[7]), "comment_count": int(r[8]),
        }
        for r in rows
    ]


def bulk_insert_videos(client: Client, user_id: str, yt_channel_id: str, videos: list[dict]) -> None:
    if not videos:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()), user_id, yt_channel_id,
            v["video_id"], v.get("title", ""), v.get("description", ""),
            v.get("thumbnail_url", ""), v.get("published_at", now),
            int(v.get("duration_seconds", 0)), v.get("video_format", "LONG_FORM"),
            int(v.get("view_count", 0)), int(v.get("like_count", 0)),
            int(v.get("comment_count", 0)), now,
        ]
        for v in videos
    ]
    client.insert(
        "youtube_videos", rows,
        column_names=[
            "id", "user_id", "yt_channel_id", "video_id", "title", "description",
            "thumbnail_url", "published_at", "duration_seconds", "video_format",
            "view_count", "like_count", "comment_count", "fetched_at",
        ],
    )


# --- Daily metrics ---

def bulk_insert_daily_metrics(client: Client, user_id: str, yt_channel_id: str, rows: list[dict]) -> None:
    if not rows:
        return
    data = [
        [user_id, yt_channel_id, r["metric_name"], float(r["metric_value"]), r["end_time"]]
        for r in rows
    ]
    client.insert(
        "youtube_daily_metrics", data,
        column_names=["user_id", "yt_channel_id", "metric_name", "metric_value", "end_time"],
    )


def find_daily_metrics(client: Client, user_id: str, yt_channel_id: str, metrics: list[str], since: datetime) -> list[dict]:
    rows = client.query(GET_YOUTUBE_DAILY_METRICS, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
        "metrics": metrics, "since": since,
    }).result_rows
    return [
        {"metric_name": r[0], "metric_value": float(r[1]), "end_time": r[2]}
        for r in rows
    ]


# --- Retention curves ---

def bulk_insert_retention_curve(client: Client, user_id: str, yt_channel_id: str, video_id: str, points: list[dict]) -> None:
    if not points:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = [
        [
            user_id, yt_channel_id, video_id,
            float(p["elapsed_video_time_ratio"]), float(p["audience_watch_ratio"]),
            float(p.get("relative_retention_performance", 0.0)), now,
        ]
        for p in points
    ]
    client.insert(
        "youtube_retention_curves", data,
        column_names=[
            "user_id", "yt_channel_id", "video_id", "elapsed_video_time_ratio",
            "audience_watch_ratio", "relative_retention_performance", "fetched_at",
        ],
    )


def find_retention_curve(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YOUTUBE_RETENTION_CURVE, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    return [
        {
            "elapsed_video_time_ratio": float(r[0]), "audience_watch_ratio": float(r[1]),
            "relative_retention_performance": float(r[2]), "fetched_at": r[3],
        }
        for r in rows
    ]


# --- Retention annotations ---

def bulk_insert_retention_annotations(client: Client, user_id: str, video_id: str, annotations: list[dict]) -> None:
    if not annotations:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = [
        [
            user_id, video_id, int(a["timestamp_seconds"]),
            a.get("annotation_text", ""), float(a.get("drop_pct", 0.0)),
            a.get("model", ""), now,
        ]
        for a in annotations
    ]
    client.insert(
        "youtube_retention_annotations", data,
        column_names=["user_id", "video_id", "timestamp_seconds", "annotation_text", "drop_pct", "model", "generated_at"],
    )


def find_retention_annotations(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YOUTUBE_RETENTION_ANNOTATIONS, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    return [
        {
            "timestamp_seconds": int(r[0]), "annotation_text": r[1],
            "drop_pct": float(r[2]), "model": r[3], "generated_at": str(r[4]),
        }
        for r in rows
    ]


def annotations_are_fresh(client: Client, user_id: str, video_id: str) -> bool:
    """True when annotations exist and were generated after the last retention curve fetch."""
    curve_rows = client.query(GET_YOUTUBE_LATEST_RETENTION_FETCH, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    ann_rows = client.query(GET_YOUTUBE_LATEST_ANNOTATION_GENERATED, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    if not curve_rows or not ann_rows:
        return False
    curve_at = curve_rows[0][0]
    ann_at = ann_rows[0][0]
    if not curve_at or not ann_at:
        return False
    return ann_at >= curve_at
