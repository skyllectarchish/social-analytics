"""Repository for the editorial trending-audio feed (migration 042).

Global, not user-scoped: this list is curated by hand from public weekly
roundups, NOT scraped from Meta (the Graph API has no trending-audio data).
Reads return the most recently published week; writes replace a week in place.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    GET_LATEST_TRENDING_AUDIO,
    GET_TRENDING_AUDIO_BY_WEEK,
    LIST_TRENDING_AUDIO_WEEKS,
)
from .safe_query import safe_call

logger = logging.getLogger(__name__)

_COLUMNS = [
    "id", "week", "rank", "title", "artist", "reels_count",
    "delta", "use_case", "source", "updated_at",
]


def _map(r: Any) -> dict[str, Any]:
    """One result row (title, artist, reels_count, delta, use_case, source, week)
    → the API shape, with NULLs coerced to '' and week as an ISO date string."""
    return {
        "title": r[0],
        "artist": r[1] or "",
        "reels_count": r[2] or "",
        "delta": r[3] or "",
        "use_case": r[4] or "",
        "source": r[5] or "",
        "week": r[6].isoformat() if hasattr(r[6], "isoformat") else str(r[6]),
    }


def list_latest(client: Client, *, limit: int = 12) -> list[dict[str, Any]]:
    """The latest published week's curated audio, by rank. Empty when the
    table is missing (migration 042 not applied) or nothing's published yet."""
    rows = safe_call(
        lambda: client.query(
            GET_LATEST_TRENDING_AUDIO, parameters={"limit": limit},
        ).result_rows,
        fallback=[],
        label="trending_audio_repo.list_latest",
    )
    return [_map(r) for r in rows]


def list_for_week(client: Client, week: date, *, limit: int = 12) -> list[dict[str, Any]]:
    """A specific published week's curated audio, by rank. Empty if that week
    was never published."""
    rows = safe_call(
        lambda: client.query(
            GET_TRENDING_AUDIO_BY_WEEK, parameters={"week": week, "limit": limit},
        ).result_rows,
        fallback=[],
        label="trending_audio_repo.list_for_week",
    )
    return [_map(r) for r in rows]


def list_weeks(client: Client) -> list[str]:
    """All published weeks as ISO date strings, newest first — for the week
    selector. Empty when nothing's published."""
    rows = safe_call(
        lambda: client.query(LIST_TRENDING_AUDIO_WEEKS).result_rows,
        fallback=[],
        label="trending_audio_repo.list_weeks",
    )
    return [r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]) for r in rows]


def replace_week(client: Client, week: date, items: list[dict[str, Any]]) -> int:
    """Publish (or overwrite) a week's curated list. rank is assigned 1..N from
    list order; ReplacingMergeTree collapses re-publishes of the same week."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()), week, i,
            it.get("title", ""), it.get("artist", ""), it.get("reels_count", ""),
            it.get("delta", ""), it.get("use_case", ""), it.get("source", ""), now,
        ]
        for i, it in enumerate(items, start=1)
    ]
    client.insert("trending_audio", rows, column_names=_COLUMNS)
    return len(rows)
