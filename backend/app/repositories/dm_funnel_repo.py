"""Repository for comment-to-DM keyword funnels — dm_funnels + dm_funnel_sends."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    GET_ALL_ACTIVE_DM_FUNNELS,
    GET_DM_FUNNEL_BY_ID,
    GET_DM_FUNNEL_RECENT_SENDS,
    GET_DM_FUNNEL_SEND_COUNTS,
    GET_DM_FUNNEL_SENT_COMMENT_IDS,
    GET_DM_FUNNELS,
    GET_RECENT_MEDIA_FOR_FUNNELS,
)
from .safe_query import safe_call

logger = logging.getLogger(__name__)

#: Hard cap on active funnels per user — keyword matching is per-comment ×
#: per-funnel, and a runaway funnel list multiplies Graph API sends.
MAX_ACTIVE_FUNNELS = 10


def _funnel_row_to_dict(r: tuple) -> dict[str, Any]:
    return {
        "funnel_id": r[0],
        "keyword": r[1],
        "dm_message": r[2],
        "public_reply": r[3],
        "ig_media_id": r[4],
        "created_at": r[5],
    }


def list_funnels(client: Client, user_id: str) -> list[dict[str, Any]]:
    rows = safe_call(
        lambda: client.query(GET_DM_FUNNELS, parameters={"user_id": user_id}).result_rows,
        fallback=[],
        label="dm_funnel_repo.list_funnels",
    )
    return [_funnel_row_to_dict(r) for r in rows]


def find_funnel(client: Client, user_id: str, funnel_id: str) -> dict[str, Any] | None:
    rows = client.query(
        GET_DM_FUNNEL_BY_ID,
        parameters={"user_id": user_id, "funnel_id": funnel_id},
    ).result_rows
    return _funnel_row_to_dict(rows[0]) if rows else None


def create_funnel(
    client: Client,
    user_id: str,
    *,
    keyword: str,
    dm_message: str,
    public_reply: str = "",
    ig_media_id: str = "",
) -> dict[str, Any]:
    """Insert a new active funnel and return it. Keyword is stored lowercased."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    funnel_id = uuid.uuid4().hex
    client.insert(
        "dm_funnels",
        [[
            str(uuid.uuid4()), user_id, funnel_id, keyword.lower().strip(),
            dm_message, public_reply, ig_media_id, 1, now, now,
        ]],
        column_names=[
            "id", "user_id", "funnel_id", "keyword", "dm_message",
            "public_reply", "ig_media_id", "active", "created_at", "updated_at",
        ],
    )
    return {
        "funnel_id": funnel_id,
        "keyword": keyword.lower().strip(),
        "dm_message": dm_message,
        "public_reply": public_reply,
        "ig_media_id": ig_media_id,
        "created_at": now,
    }


def soft_delete_funnel(client: Client, user_id: str, funnel_id: str) -> bool:
    """Deactivate a funnel (active=0 insert). Send history is preserved."""
    existing = find_funnel(client, user_id, funnel_id)
    if existing is None:
        return False
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "dm_funnels",
        [[
            str(uuid.uuid4()), user_id, funnel_id, existing["keyword"],
            existing["dm_message"], existing["public_reply"],
            existing["ig_media_id"], 0, existing["created_at"], now,
        ]],
        column_names=[
            "id", "user_id", "funnel_id", "keyword", "dm_message",
            "public_reply", "ig_media_id", "active", "created_at", "updated_at",
        ],
    )
    return True


def list_all_active_funnels(client: Client) -> dict[str, list[dict[str, Any]]]:
    """All active funnels across users, grouped by user_id — for the runner."""
    rows = safe_call(
        lambda: client.query(GET_ALL_ACTIVE_DM_FUNNELS).result_rows,
        fallback=[],
        label="dm_funnel_repo.list_all_active_funnels",
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        grouped.setdefault(str(r[0]), []).append({
            "funnel_id": r[1],
            "keyword": r[2],
            "dm_message": r[3],
            "public_reply": r[4],
            "ig_media_id": r[5],
            "created_at": r[6],
        })
    return grouped


def sent_comment_ids(client: Client, user_id: str) -> set[str]:
    """Comment ids already funnel-processed for this user (dedup guard)."""
    rows = safe_call(
        lambda: client.query(
            GET_DM_FUNNEL_SENT_COMMENT_IDS, parameters={"user_id": user_id},
        ).result_rows,
        fallback=[],
        label="dm_funnel_repo.sent_comment_ids",
    )
    return {r[0] for r in rows}


def log_send(
    client: Client,
    user_id: str,
    *,
    funnel_id: str,
    keyword: str,
    ig_comment_id: str,
    ig_media_id: str,
    commenter_username: str,
    comment_text: str,
    status: str,
    error: str = "",
) -> None:
    client.insert(
        "dm_funnel_sends",
        [[
            str(uuid.uuid4()), user_id, funnel_id, keyword, ig_comment_id,
            ig_media_id, commenter_username, comment_text[:500], status,
            error[:500], datetime.now(timezone.utc).replace(tzinfo=None),
        ]],
        column_names=[
            "id", "user_id", "funnel_id", "keyword", "ig_comment_id",
            "ig_media_id", "commenter_username", "comment_text", "status",
            "error", "sent_at",
        ],
    )


def send_counts(client: Client, user_id: str) -> dict[str, dict[str, Any]]:
    """Per-funnel sent/failed counts keyed by funnel_id."""
    rows = safe_call(
        lambda: client.query(
            GET_DM_FUNNEL_SEND_COUNTS, parameters={"user_id": user_id},
        ).result_rows,
        fallback=[],
        label="dm_funnel_repo.send_counts",
    )
    return {
        r[0]: {
            "sent_count": int(r[1]),
            "failed_count": int(r[2]),
            "last_sent_at": r[3],
        }
        for r in rows
    }


def recent_sends(client: Client, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    rows = safe_call(
        lambda: client.query(
            GET_DM_FUNNEL_RECENT_SENDS,
            parameters={"user_id": user_id, "limit": limit},
        ).result_rows,
        fallback=[],
        label="dm_funnel_repo.recent_sends",
    )
    return [
        {
            "funnel_id": r[0],
            "keyword": r[1],
            "ig_comment_id": r[2],
            "ig_media_id": r[3],
            "commenter_username": r[4],
            "comment_text": r[5],
            "status": r[6],
            "error": r[7],
            "sent_at": r[8],
        }
        for r in rows
    ]


def recent_media_ids(
    client: Client,
    user_id: str,
    ig_user_id: str,
    *,
    since: datetime,
    limit: int = 10,
) -> list[str]:
    """Recent comment-eligible media (FEED/REELS) the runner should scan."""
    rows = client.query(
        GET_RECENT_MEDIA_FOR_FUNNELS,
        parameters={
            "user_id": user_id, "ig_user_id": ig_user_id,
            "since": since, "limit": limit,
        },
    ).result_rows
    return [r[0] for r in rows]
