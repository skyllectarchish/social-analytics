"""Repository for story analytics retention — instagram_stories snapshots.

Story *insights* are not stored here: they reuse the media_insights table
(via insights_repo.bulk_upsert_media_insights), keyed by ig_media_id like
every other media. This module only owns the story snapshot rows that make
those insights queryable after Meta expires the story itself.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import COUNT_STORY_HISTORY, GET_STORY_HISTORY
from .safe_query import is_schema_missing, log_schema_missing, safe_call

logger = logging.getLogger(__name__)


def bulk_insert_stories(
    client: Client,
    user_id: str,
    ig_user_id: str,
    stories: list[dict[str, Any]],
) -> int:
    """Snapshot active stories (raw Graph API items) into instagram_stories.

    Re-snapshotting the same story is fine — ReplacingMergeTree on
    (user_id, ig_media_id) collapses dupes to the freshest fetched_at.
    Returns 0 (with a warning) when migration 033 hasn't been applied.
    """
    if not stories:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows: list[list[Any]] = []
    for s in stories:
        ts_str = s.get("timestamp", "")
        try:
            ts = (
                datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
        except (ValueError, TypeError):
            ts = now
        rows.append([
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            s.get("id", ""),
            s.get("media_type", "") or "",
            s.get("media_url", "") or "",
            s.get("thumbnail_url", "") or "",
            s.get("permalink", "") or "",
            ts,
            now,
        ])

    try:
        client.insert(
            "instagram_stories",
            rows,
            column_names=[
                "id", "user_id", "ig_user_id", "ig_media_id", "media_type",
                "media_url", "thumbnail_url", "permalink", "timestamp", "fetched_at",
            ],
        )
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        log_schema_missing(
            "bulk_insert_stories", exc,
            f"instagram_stories missing (migration 033) — skipped {len(rows)} rows",
        )
        return 0
    return len(rows)


def find_story_history(
    client: Client,
    user_id: str,
    ig_user_id: str,
    *,
    since: datetime,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Snapshotted stories + their retained insights, newest first."""
    rows = safe_call(
        lambda: client.query(
            GET_STORY_HISTORY,
            parameters={
                "user_id": user_id,
                "ig_user_id": ig_user_id,
                "since": since,
                "limit": limit,
            },
        ).result_rows,
        fallback=[],
        label="story_repo.find_story_history",
    )
    return [
        {
            "ig_media_id": r[0],
            "media_type": r[1],
            "permalink": r[2],
            "timestamp": r[3],
            "reach": int(r[4] or 0),
            "views": int(r[5] or 0),
            "replies": int(r[6] or 0),
            "shares": int(r[7] or 0),
            "interactions": int(r[8] or 0),
            "navigation": int(r[9] or 0),
        }
        for r in rows
    ]


def count_story_history(
    client: Client,
    user_id: str,
    ig_user_id: str,
    *,
    since: datetime,
) -> int:
    rows = safe_call(
        lambda: client.query(
            COUNT_STORY_HISTORY,
            parameters={"user_id": user_id, "ig_user_id": ig_user_id, "since": since},
        ).result_rows,
        fallback=[],
        label="story_repo.count_story_history",
    )
    return int(rows[0][0]) if rows else 0
