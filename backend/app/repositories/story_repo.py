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

from .safe_query import is_schema_missing, log_schema_missing

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


_SNAPSHOT_JOB_COLUMNS = [
    "id", "user_id", "status", "stories_captured", "error", "ran_at", "updated_at",
]


def record_snapshot_run(
    client: Client,
    user_id: str,
    *,
    status: str,
    stories_captured: int,
    error: str = "",
) -> None:
    """Record the outcome of one story-snapshot run for a user.

    One row per user (ReplacingMergeTree on user_id keeps the freshest). Status
    tracking is best-effort: if migration 041 hasn't been applied the snapshot
    itself still runs, this just no-ops and the status endpoint reports 'idle'.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = [
        str(uuid.uuid4()), user_id, status, int(stories_captured), error[:1000], now, now,
    ]
    try:
        client.insert("story_snapshot_jobs", [row], column_names=_SNAPSHOT_JOB_COLUMNS)
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        log_schema_missing(
            "story_repo.record_snapshot_run", exc,
            "story_snapshot_jobs missing (migration 041) — snapshot status not tracked",
        )
