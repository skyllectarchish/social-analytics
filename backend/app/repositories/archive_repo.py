"""Repository for the data-export archive tables (migration 026)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    GET_ARCHIVE_CONTENT_BY_MONTH,
    GET_ARCHIVE_FOLLOWER_GROWTH,
    GET_ARCHIVE_SUMMARY,
)

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def insert_posts(client: Client, user_id: str, rows_in: list[dict[str, Any]]) -> int:
    """Append archive posts. ReplacingMergeTree on (user, taken_at, caption)
    dedupes re-imports of the same export during background merges."""
    if not rows_in:
        return 0
    now = _now()
    rows = [
        [str(uuid.uuid4()), user_id, r["taken_at"], r.get("caption", ""),
         int(r.get("media_count", 1)), now]
        for r in rows_in
    ]
    client.insert(
        "archive_posts", rows,
        column_names=["id", "user_id", "taken_at", "caption", "media_count", "imported_at"],
    )
    return len(rows)


def insert_stories(client: Client, user_id: str, rows_in: list[dict[str, Any]]) -> int:
    if not rows_in:
        return 0
    now = _now()
    rows = [
        [str(uuid.uuid4()), user_id, r["taken_at"], r.get("caption", ""), now]
        for r in rows_in
    ]
    client.insert(
        "archive_stories", rows,
        column_names=["id", "user_id", "taken_at", "caption", "imported_at"],
    )
    return len(rows)


def insert_followers(client: Client, user_id: str, rows_in: list[dict[str, Any]]) -> int:
    """Append follower events. Deduped per (user, follower_username)."""
    if not rows_in:
        return 0
    now = _now()
    rows = [
        [str(uuid.uuid4()), user_id, r["follower_username"], r["followed_at"], now]
        for r in rows_in
    ]
    client.insert(
        "follower_events", rows,
        column_names=["id", "user_id", "follower_username", "followed_at", "imported_at"],
    )
    return len(rows)


def summary(client: Client, user_id: str) -> dict[str, Any]:
    rows = client.query(GET_ARCHIVE_SUMMARY, parameters={"user_id": user_id}).result_rows
    if not rows:
        return {"posts": 0, "stories": 0, "followers": 0}
    r = rows[0]

    def _iso(dt: Any) -> str | None:
        # ClickHouse min() over an empty set returns epoch — treat as missing.
        if dt is None or not hasattr(dt, "isoformat") or dt.year <= 1970:
            return None
        return dt.isoformat()

    return {
        "posts": int(r[0] or 0),
        "posts_from": _iso(r[1]),
        "stories": int(r[2] or 0),
        "stories_from": _iso(r[3]),
        "followers": int(r[4] or 0),
        "followers_from": _iso(r[5]),
    }


def follower_growth(client: Client, user_id: str) -> list[tuple]:
    return client.query(
        GET_ARCHIVE_FOLLOWER_GROWTH, parameters={"user_id": user_id},
    ).result_rows


def content_by_month(client: Client, user_id: str) -> list[tuple]:
    return client.query(
        GET_ARCHIVE_CONTENT_BY_MONTH, parameters={"user_id": user_id},
    ).result_rows
