"""Repository for Tier 2 / F4 — instagram_comments + comment_sentiment + comment_topics."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    COUNT_COMMENT_INBOX,
    GET_COMMENT_INBOX,
    GET_COMMENT_WITH_CONTEXT,
    GET_COMMENTS_PENDING_SENTIMENT,
    GET_RECENT_SELF_REPLIES,
)
from .safe_query import is_schema_missing, log_schema_missing

logger = logging.getLogger(__name__)


#: Columns written on every comment_topics insert. Pinned so the upsert path
#: and the migration-014 fallback path stay in sync.
_TOPIC_INSERT_COLUMNS: list[str] = [
    "id", "user_id", "cluster_id", "label", "sample_comment_ids",
    "size", "period_start", "period_end", "is_question", "computed_at",
]
_LEGACY_TOPIC_INSERT_COLUMNS: list[str] = [
    c for c in _TOPIC_INSERT_COLUMNS if c != "is_question"
]


def bulk_insert_comments(
    client: Client,
    user_id: str,
    ig_media_id: str,
    comments: list[dict[str, Any]],
) -> int:
    """Append comments fetched from Meta. `_parent_id` may be set by the fetcher."""
    if not comments:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows: list[list[Any]] = []
    for c in comments:
        ts_str = c.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(
                str(ts_str).replace("Z", "+00:00")
            ).replace(tzinfo=None)
        except (ValueError, TypeError):
            ts = now
        rows.append([
            str(uuid.uuid4()),
            user_id,
            ig_media_id,
            c.get("id", ""),
            c.get("_parent_id", ""),
            c.get("username", "") or "",
            c.get("text", "") or "",
            int(c.get("like_count") or 0),
            ts,
            now,
        ])

    client.insert(
        "instagram_comments",
        rows,
        column_names=[
            "id", "user_id", "ig_media_id", "ig_comment_id", "parent_comment_id",
            "username", "text", "like_count", "timestamp", "fetched_at",
        ],
    )
    return len(rows)


# --- Comment inbox ---

def _inbox_params(
    user_id: str,
    self_username: str,
    sentiment: str,
    questions_only: bool,
    unanswered_only: bool,
) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "self_username": self_username,
        "sentiment": sentiment,
        "questions_only": 1 if questions_only else 0,
        "unanswered_only": 1 if unanswered_only else 0,
    }


def find_inbox_page(
    client: Client,
    user_id: str,
    self_username: str,
    *,
    sentiment: str = "",
    questions_only: bool = False,
    unanswered_only: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> list[tuple]:
    """One page of the comment inbox, newest first. Spam always excluded."""
    params = _inbox_params(user_id, self_username, sentiment, questions_only, unanswered_only)
    return client.query(
        GET_COMMENT_INBOX,
        parameters={**params, "limit": limit, "offset": offset},
    ).result_rows


def count_inbox(
    client: Client,
    user_id: str,
    self_username: str,
    *,
    sentiment: str = "",
    questions_only: bool = False,
    unanswered_only: bool = False,
) -> int:
    """Total inbox rows for the same filter set (pagination)."""
    rows = client.query(
        COUNT_COMMENT_INBOX,
        parameters=_inbox_params(user_id, self_username, sentiment, questions_only, unanswered_only),
    ).result_rows
    return int(rows[0][0]) if rows else 0


def find_comment_with_context(
    client: Client,
    user_id: str,
    ig_comment_id: str,
) -> dict[str, Any] | None:
    """One comment + its post caption, scoped to the user. None when not found.

    The user scoping doubles as the ownership check for the reply endpoint —
    a comment id belonging to someone else's account simply won't resolve.
    """
    rows = client.query(
        GET_COMMENT_WITH_CONTEXT,
        parameters={"user_id": user_id, "ig_comment_id": ig_comment_id},
    ).result_rows
    if not rows:
        return None
    r = rows[0]
    return {
        "ig_comment_id": r[0],
        "ig_media_id": r[1],
        "username": r[2],
        "text": r[3],
        "sentiment": r[4],
        "is_question": bool(r[5]),
        "media_caption": r[6],
    }


def find_recent_self_replies(
    client: Client,
    user_id: str,
    self_username: str,
    limit: int = 5,
) -> list[str]:
    """The creator's most recent reply texts — AI voice samples."""
    rows = client.query(
        GET_RECENT_SELF_REPLIES,
        parameters={"user_id": user_id, "self_username": self_username, "limit": limit},
    ).result_rows
    return [r[0] for r in rows if r[0]]


def find_comments_pending_sentiment(
    client: Client,
    limit: int = 5000,
) -> list[tuple[str, str, str, str]]:
    """Pull (user_id, ig_comment_id, ig_media_id, text) for comments without sentiment yet."""
    rows = client.query(
        GET_COMMENTS_PENDING_SENTIMENT, parameters={"limit": limit},
    ).result_rows
    return [(r[0], r[1], r[2], r[3]) for r in rows]


def bulk_insert_sentiment(
    client: Client,
    rows_in: list[dict[str, Any]],
) -> int:
    """Persist scored rows from the sentiment_batch job.

    Each item: {user_id, ig_comment_id, ig_media_id, sentiment, score,
                is_question, is_spam, language?, model?}
    """
    if not rows_in:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            r["user_id"],
            r["ig_comment_id"],
            r["ig_media_id"],
            r.get("sentiment", "neutral"),
            float(r.get("score", 0.0)),
            1 if r.get("is_question") else 0,
            1 if r.get("is_spam") else 0,
            r.get("language", "") or "",
            [],  # embedding populated by a separate job
            r.get("model", "") or "",
            now,
        ]
        for r in rows_in
    ]
    client.insert(
        "comment_sentiment",
        rows,
        column_names=[
            "id", "user_id", "ig_comment_id", "ig_media_id",
            "sentiment", "score", "is_question", "is_spam",
            "language", "embedding", "model", "computed_at",
        ],
    )
    return len(rows)


def replace_topics_for_user(
    client: Client,
    user_id: str,
    period_start: datetime,
    period_end: datetime,
    clusters: list[dict[str, Any]],
) -> int:
    """Append topic rows for a (user, period) window.

    ReplacingMergeTree on (user_id, cluster_id, period_start) means re-running
    the job for the same window overwrites prior labels on background merges.

    `is_question` is optional in `clusters` — defaults to False/0 and is set
    by the topic_clustering job when the majority of a cluster's comments are
    flagged is_question=1 in `comment_sentiment`. Requires migration 014.
    """
    if not clusters:
        return 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            int(c.get("cluster_id", i)),
            c.get("label", "") or "",
            c.get("sample_comment_ids", []) or [],
            int(c.get("size", 0)),
            period_start,
            period_end,
            1 if c.get("is_question") else 0,
            now,
        ]
        for i, c in enumerate(clusters)
    ]
    try:
        client.insert(
            "comment_topics", rows, column_names=_TOPIC_INSERT_COLUMNS,
        )
        return len(rows)
    except Exception as exc:
        if not is_schema_missing(exc):
            raise

    # Migration 014 (is_question column) not applied — drop that slot and retry.
    is_question_idx = _TOPIC_INSERT_COLUMNS.index("is_question")
    legacy_rows = [r[:is_question_idx] + r[is_question_idx + 1:] for r in rows]
    try:
        client.insert(
            "comment_topics", legacy_rows,
            column_names=_LEGACY_TOPIC_INSERT_COLUMNS,
        )
        log_schema_missing(
            "replace_topics_for_user", exc,
            "dropped is_question (migration 014 not applied)",
        )
        return len(legacy_rows)
    except Exception as legacy_exc:
        if not is_schema_missing(legacy_exc):
            raise
        log_schema_missing(
            "replace_topics_for_user", legacy_exc,
            f"comment_topics missing — skipped {len(rows)} rows",
        )
        return 0
