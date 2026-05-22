"""Thumbs feedback persistence for AI artifacts.

The table is ReplacingMergeTree on (user_id, feature, ref_id) — repeat
submits with a different rating collapse to the latest row at merge
time, and `GET_AI_FEEDBACK` uses FINAL so the read path always returns
the current rating. No retry / dedupe logic needed here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

logger = logging.getLogger(__name__)


def upsert(
    client: Client,
    *,
    user_id: str,
    feature: str,
    ref_id: str,
    rating: str,
    note: str | None = None,
) -> None:
    """Insert (or upsert via ReplacingMergeTree) a feedback row."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row: list[Any] = [
        user_id,
        feature,
        ref_id,
        rating,
        note or "",
        now,
        now,
    ]
    client.insert(
        "ai_feedback",
        [row],
        column_names=[
            "user_id", "feature", "ref_id", "rating", "note",
            "created_at", "updated_at",
        ],
    )
    logger.info(
        "ai.feedback.upsert user=%s feature=%s ref_id=%s rating=%s",
        user_id, feature, ref_id, rating,
    )
