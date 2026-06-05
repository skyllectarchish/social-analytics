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
    COUNT_YT_COMPETITORS,
    GET_YT_ARCHIVE_SUGGESTIONS,
    GET_YT_ALERTS,
    GET_YT_COMPETITOR_OUTLIERS,
    GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE,
    GET_YT_COMPETITORS,
    GET_YT_DAILY_SUBSCRIBER_NET,
    GET_YT_LAST_ARCHIVE_SCAN,
    GET_YT_LAST_OBSERVED_TITLE,
    GET_YT_MODEL_STATE,
    GET_YT_OWN_VELOCITY_SAMPLES,
    GET_YT_PREDICTION,
    GET_YT_TITLE_HISTORY,
    GET_YT_VELOCITY,
    GET_INSTAGRAM_REEL_POSTS,
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


# --- Competitors ---

def list_competitors(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_COMPETITORS, parameters={"user_id": user_id}).result_rows
    return [
        {"competitor_channel_id": r[0], "competitor_title": r[1],
         "competitor_thumbnail_url": r[2], "webhook_active": bool(r[3]),
         "added_at": str(r[4])}
        for r in rows
    ]


def count_competitors(client: Client, user_id: str) -> int:
    rows = client.query(COUNT_YT_COMPETITORS, parameters={"user_id": user_id}).result_rows
    return int(rows[0][0]) if rows else 0


def upsert_competitor(client: Client, user_id: str, yt_channel_id: str, competitor: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_competitors",
        [[str(uuid.uuid4()), user_id, yt_channel_id,
          competitor["competitor_channel_id"], competitor.get("competitor_title", ""),
          competitor.get("competitor_thumbnail_url", ""),
          bool(competitor.get("webhook_active", False)),
          False, now, now]],
        column_names=["id", "user_id", "yt_channel_id", "competitor_channel_id",
                      "competitor_title", "competitor_thumbnail_url",
                      "webhook_active", "is_deleted", "added_at", "updated_at"],
    )


def delete_competitor(client: Client, user_id: str, competitor_channel_id: str) -> None:
    client.command(
        "ALTER TABLE youtube_competitors DELETE WHERE user_id = {uid:UUID} AND competitor_channel_id = {cid:String}",
        parameters={"uid": user_id, "cid": competitor_channel_id},
        settings={"mutations_sync": 2},
    )


def mark_competitor_webhook_active(client: Client, user_id: str, competitor_channel_id: str, active: bool) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.command(
        "ALTER TABLE youtube_competitors UPDATE webhook_active = {active:Bool}, updated_at = {now:DateTime} "
        "WHERE user_id = {uid:UUID} AND competitor_channel_id = {cid:String}",
        parameters={"active": active, "now": now, "uid": user_id, "cid": competitor_channel_id},
        settings={"mutations_sync": 2},
    )


# --- Competitor Videos ---

def get_competitor_videos_for_baseline(client: Client, user_id: str, competitor_channel_id: str) -> list[dict]:
    rows = client.query(
        GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE,
        parameters={"user_id": user_id, "competitor_channel_id": competitor_channel_id},
    ).result_rows
    return [
        {"video_id": r[0], "view_count": int(r[1]), "published_at": r[2],
         "title": r[3], "thumbnail_url": r[4], "llm_analysis": r[5], "is_outlier": bool(r[6])}
        for r in rows
    ]


def bulk_insert_competitor_videos(client: Client, user_id: str, videos: list[dict]) -> None:
    if not videos:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [str(uuid.uuid4()), user_id, v["competitor_channel_id"], v["video_id"],
         v.get("title", ""), v.get("description", ""), v.get("thumbnail_url", ""),
         v.get("published_at", now), int(v.get("view_count", 0)),
         v.get("llm_analysis"), bool(v.get("is_outlier", False)), now]
        for v in videos
    ]
    client.insert(
        "youtube_competitor_videos", rows,
        column_names=["id", "user_id", "competitor_channel_id", "video_id", "title",
                      "description", "thumbnail_url", "published_at", "view_count",
                      "llm_analysis", "is_outlier", "fetched_at"],
    )


def mark_video_outlier(client: Client, user_id: str, video_id: str, llm_analysis: str) -> None:
    client.command(
        "ALTER TABLE youtube_competitor_videos UPDATE is_outlier = true, llm_analysis = {analysis:String}, fetched_at = now() "
        "WHERE user_id = {uid:UUID} AND video_id = {vid:String}",
        parameters={"uid": user_id, "vid": video_id, "analysis": llm_analysis},
        settings={"mutations_sync": 2},
    )


def get_competitor_outliers(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_COMPETITOR_OUTLIERS, parameters={"user_id": user_id}).result_rows
    return [
        {"competitor_channel_id": r[0], "video_id": r[1], "title": r[2],
         "thumbnail_url": r[3], "view_count": int(r[4]),
         "published_at": str(r[5]), "llm_analysis": r[6]}
        for r in rows
    ]


# --- Velocity ---

def insert_velocity_point(client: Client, user_id: str, channel_id: str, video_id: str,
                           hours: int, view_count: int, avg_watch_s: float = 0.0, ctr_pct: float = 0.0) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_competitor_velocity",
        [[str(uuid.uuid4()), user_id, channel_id, video_id, hours, view_count, avg_watch_s, ctr_pct, now]],
        column_names=["id", "user_id", "yt_channel_id", "video_id", "hours_since_publish",
                      "view_count", "avg_watch_s", "ctr_pct", "checked_at"],
    )


def get_velocity(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YT_VELOCITY, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    return [{"hours": int(r[0]), "view_count": int(r[1]), "avg_watch_s": float(r[2]),
             "ctr_pct": float(r[3]), "checked_at": str(r[4])} for r in rows]


def get_own_velocity_samples(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_OWN_VELOCITY_SAMPLES, parameters={"user_id": user_id}).result_rows
    return [{"video_id": r[0], "four_hour_views": int(r[1]), "four_hour_avg_watch_s": float(r[2]),
             "ctr_pct": float(r[3]), "final_views": int(r[4])} for r in rows]


# --- Title History ---

def record_title_if_changed(client: Client, user_id: str, channel_id: str, video_id: str, current_title: str) -> None:
    if not current_title:
        return
    rows = client.query(GET_YT_LAST_OBSERVED_TITLE,
                        parameters={"user_id": user_id, "video_id": video_id}).result_rows
    last_title = rows[0][0] if rows else None
    if last_title == current_title:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_title_history",
        [[str(uuid.uuid4()), user_id, channel_id, video_id, current_title, now]],
        column_names=["id", "user_id", "yt_channel_id", "video_id", "title_text", "observed_at"],
    )


def get_title_history(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YT_TITLE_HISTORY, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    return [{"title_text": r[0], "observed_at": str(r[1])} for r in rows]


# --- Archive Suggestions ---

def upsert_archive_suggestion(client: Client, user_id: str, suggestion: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_archive_suggestions",
        [[str(uuid.uuid4()), user_id, suggestion.get("yt_channel_id", ""),
          suggestion["video_id"], suggestion["original_title"],
          suggestion["trending_topic"], float(suggestion.get("wikipedia_spike_pct", 0)),
          suggestion.get("autocomplete_matches", []), suggestion["suggestion_type"],
          suggestion["llm_recommendation"], now]],
        column_names=["id", "user_id", "yt_channel_id", "video_id", "original_title",
                      "trending_topic", "wikipedia_spike_pct", "autocomplete_matches",
                      "suggestion_type", "llm_recommendation", "generated_at"],
    )


def get_archive_suggestions(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_ARCHIVE_SUGGESTIONS, parameters={"user_id": user_id}).result_rows
    return [{"video_id": r[0], "original_title": r[1], "trending_topic": r[2],
             "wikipedia_spike_pct": float(r[3]), "autocomplete_matches": list(r[4]),
             "suggestion_type": r[5], "llm_recommendation": r[6], "generated_at": str(r[7])}
            for r in rows]


def get_last_archive_scan(client: Client, user_id: str) -> datetime | None:
    rows = client.query(GET_YT_LAST_ARCHIVE_SCAN, parameters={"user_id": user_id}).result_rows
    val = rows[0][0] if rows else None
    return val if val and str(val) != "1970-01-01 00:00:00" else None


# --- Predictions ---

def upsert_prediction(client: Client, user_id: str, pred: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_predictions",
        [[str(uuid.uuid4()), user_id, pred["video_id"],
          int(pred["four_hour_views"]), float(pred["four_hour_avg_watch_s"]),
          float(pred["ctr_pct"]), int(pred["predicted_30d_views"]),
          int(pred["predicted_low"]), int(pred["predicted_high"]),
          float(pred["revenue_low_usd"]), float(pred["revenue_high_usd"]), now]],
        column_names=["id", "user_id", "video_id", "four_hour_views", "four_hour_avg_watch_s",
                      "ctr_pct", "predicted_30d_views", "predicted_low", "predicted_high",
                      "revenue_low_usd", "revenue_high_usd", "predicted_at"],
    )


def get_prediction(client: Client, user_id: str, video_id: str) -> dict | None:
    rows = client.query(GET_YT_PREDICTION, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {"video_id": r[0], "four_hour_views": int(r[1]), "four_hour_avg_watch_s": float(r[2]),
            "ctr_pct": float(r[3]), "predicted_30d_views": int(r[4]), "predicted_low": int(r[5]),
            "predicted_high": int(r[6]), "revenue_low_usd": float(r[7]),
            "revenue_high_usd": float(r[8]), "predicted_at": str(r[9])}


# --- Alerts ---

def insert_alert(client: Client, user_id: str, video_id: str, alert_type: str, alert_body: str) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_alerts",
        [[str(uuid.uuid4()), user_id, video_id, alert_type, alert_body, False, now]],
        column_names=["id", "user_id", "video_id", "alert_type", "alert_body", "is_read", "created_at"],
    )


def get_alerts(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_ALERTS, parameters={"user_id": user_id}).result_rows
    return [{"id": str(r[0]), "video_id": r[1], "alert_type": r[2],
             "alert_body": r[3], "is_read": bool(r[4]), "created_at": str(r[5])}
            for r in rows]


# --- Model State ---

def upsert_model_state(client: Client, user_id: str, state: dict) -> None:
    import json
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_model_state",
        [[str(uuid.uuid4()), user_id, json.dumps(state["coefficients"]),
          float(state["intercept"]), float(state["r2_score"]),
          int(state["sample_size"]), now]],
        column_names=["id", "user_id", "coefficients_json", "intercept",
                      "r2_score", "training_sample_size", "trained_at"],
    )


def get_model_state(client: Client, user_id: str) -> dict | None:
    import json
    rows = client.query(GET_YT_MODEL_STATE, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {"coefficients": json.loads(r[0]), "intercept": float(r[1]),
            "r2_score": float(r[2]), "sample_size": int(r[3]), "trained_at": str(r[4])}


# --- Cross-Platform ---

def get_daily_subscriber_net(client: Client, user_id: str, start_date: datetime) -> list[dict]:
    rows = client.query(GET_YT_DAILY_SUBSCRIBER_NET,
                        parameters={"user_id": user_id, "start_date": start_date}).result_rows
    return [{"day": str(r[0]), "gained": int(r[1]), "lost": int(r[2])} for r in rows]


def get_instagram_reel_posts(client: Client, user_id: str, start_date: datetime) -> list[dict]:
    rows = client.query(GET_INSTAGRAM_REEL_POSTS,
                        parameters={"user_id": user_id, "start_date": start_date}).result_rows
    return [{"post_date": str(r[0]), "ig_media_id": r[1], "thumbnail_url": r[2], "caption": r[3]}
            for r in rows]
