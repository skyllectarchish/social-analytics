"""Branded hashtag repository (Tier 2 / F2).

Two tables:
* `branded_hashtags` — user-tracked tags (one row per (user, hashtag))
* `branded_hashtag_mentions` — public media that mentioned a tracked tag

Both use ReplacingMergeTree, so "updates" are append-only inserts with a
fresher `updated_at`. Reads use FINAL + argMax patterns.

All write paths route through `safe_call` so missing migrations 016/017
degrade to no-ops rather than 500ing the request.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    GET_BRANDED_HASHTAG_MENTION_COUNTS,
    GET_BRANDED_HASHTAG_MENTIONS,
    GET_BRANDED_HASHTAGS,
    GET_BRANDED_HASHTAGS_FOR_SYNC,
    SCAN_COMMENTS_FOR_BRANDED_HASHTAG,
    SCAN_POSTS_FOR_BRANDED_HASHTAG,
)
from .safe_query import safe_call

logger = logging.getLogger(__name__)

#: Per-user cap on active branded hashtags. Keeps total weekly Graph API
#: usage well within Meta's 30-hashtag-queries-per-7d quota (2 calls per tag
#: on first sync, 1 call per tag thereafter — so 3 tags ≈ 3 calls/week).
MAX_BRANDED_HASHTAGS: int = 3

_HANDLE_COLUMNS = [
    "id", "user_id", "hashtag", "ig_hashtag_id", "active",
    "last_synced_at", "added_at", "updated_at",
]


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def list_branded(client: Client, user_id: str) -> list[dict[str, Any]]:
    """Active branded hashtags for one user. Empty list if table missing."""
    rows = safe_call(
        lambda: client.query(
            GET_BRANDED_HASHTAGS, parameters={"user_id": user_id},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.list_branded",
    )
    return [
        {
            "hashtag": r[0],
            "ig_hashtag_id": r[1] or "",
            "active": bool(r[2]),
            "last_synced_at": r[3],
        }
        for r in rows
    ]


def list_all_active_for_sync(client: Client) -> list[tuple[str, str, str]]:
    """Cross-user list of (user_id, hashtag, ig_hashtag_id) for the sync job."""
    rows = safe_call(
        lambda: client.query(GET_BRANDED_HASHTAGS_FOR_SYNC).result_rows,
        fallback=[],
        label="branded_hashtag_repo.list_all_active_for_sync",
    )
    return [(str(r[0]), r[1], r[2] or "") for r in rows]


def count_active(client: Client, user_id: str) -> int:
    """Active row count — used by the router to enforce MAX_BRANDED_HASHTAGS."""
    return len(list_branded(client, user_id))


def upsert_branded(
    client: Client, user_id: str, hashtag: str, ig_hashtag_id: str = "",
) -> None:
    """Insert (or refresh) a branded hashtag row."""
    now = _now()
    existing = safe_call(
        lambda: client.query(
            "SELECT added_at FROM branded_hashtags FINAL "
            "WHERE user_id = {user_id:UUID} AND hashtag = {hashtag:String}",
            parameters={"user_id": user_id, "hashtag": hashtag},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.upsert.read",
    )
    added_at = existing[0][0] if existing else now

    # No initial sync has happened yet when ig_hashtag_id is unknown; touch_synced_at
    # bumps last_synced_at to a real timestamp once the first sync completes.
    last_synced_at = now if ig_hashtag_id else datetime(1970, 1, 1)
    row = [
        str(uuid.uuid4()), user_id, hashtag, ig_hashtag_id, 1,
        last_synced_at, added_at, now,
    ]
    safe_call(
        lambda: client.insert(
            "branded_hashtags", [row], column_names=_HANDLE_COLUMNS,
        ),
        fallback=None,
        label="branded_hashtag_repo.upsert.insert",
    )


def soft_delete(client: Client, user_id: str, hashtag: str) -> None:
    """Set active=0, preserve mention history."""
    now = _now()
    existing = safe_call(
        lambda: client.query(
            "SELECT ig_hashtag_id, last_synced_at, added_at "
            "FROM branded_hashtags FINAL "
            "WHERE user_id = {user_id:UUID} AND hashtag = {hashtag:String}",
            parameters={"user_id": user_id, "hashtag": hashtag},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.soft_delete.read",
    )
    if not existing:
        return
    ig_id, last_synced_at, added_at = existing[0]
    row = [
        str(uuid.uuid4()), user_id, hashtag, ig_id or "", 0,
        last_synced_at, added_at, now,
    ]
    safe_call(
        lambda: client.insert(
            "branded_hashtags", [row], column_names=_HANDLE_COLUMNS,
        ),
        fallback=None,
        label="branded_hashtag_repo.soft_delete.insert",
    )


def update_ig_hashtag_id(
    client: Client, user_id: str, hashtag: str, ig_hashtag_id: str,
) -> None:
    """Record the resolved ig_hashtag_id so future syncs skip ig_hashtag_search."""
    now = _now()
    existing = safe_call(
        lambda: client.query(
            "SELECT added_at, active FROM branded_hashtags FINAL "
            "WHERE user_id = {user_id:UUID} AND hashtag = {hashtag:String}",
            parameters={"user_id": user_id, "hashtag": hashtag},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.update_ig_hashtag_id.read",
    )
    if not existing:
        return
    added_at, active = existing[0]
    row = [
        str(uuid.uuid4()), user_id, hashtag, ig_hashtag_id, int(active or 0),
        now, added_at, now,
    ]
    safe_call(
        lambda: client.insert(
            "branded_hashtags", [row], column_names=_HANDLE_COLUMNS,
        ),
        fallback=None,
        label="branded_hashtag_repo.update_ig_hashtag_id.insert",
    )


def touch_synced_at(client: Client, user_id: str, hashtag: str) -> None:
    """Bump last_synced_at to now without changing ig_hashtag_id."""
    existing = safe_call(
        lambda: client.query(
            "SELECT ig_hashtag_id, added_at, active "
            "FROM branded_hashtags FINAL "
            "WHERE user_id = {user_id:UUID} AND hashtag = {hashtag:String}",
            parameters={"user_id": user_id, "hashtag": hashtag},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.touch_synced_at.read",
    )
    if not existing:
        return
    ig_id, added_at, active = existing[0]
    now = _now()
    row = [
        str(uuid.uuid4()), user_id, hashtag, ig_id or "", int(active or 0),
        now, added_at, now,
    ]
    safe_call(
        lambda: client.insert(
            "branded_hashtags", [row], column_names=_HANDLE_COLUMNS,
        ),
        fallback=None,
        label="branded_hashtag_repo.touch_synced_at.insert",
    )


#: Column order for the mention table. Migration 018 created the base
#: schema; migration 019 added `source` so a single row can be either a
#: 'comment' (someone commented with the tag) or 'post' (the user's own
#: caption used the tag).
_MENTION_COLUMNS = [
    "id", "user_id", "hashtag", "ig_comment_id", "ig_media_id", "permalink",
    "username", "text", "like_count", "timestamp", "fetched_at", "updated_at",
    "source",
]


def _has_word_boundary_match(text: str, needle: str) -> bool:
    """True iff `needle` appears in `text` followed by a non-identifier char.

    Word-boundary guard so `#brand` doesn't match `#brandextra`. ClickHouse
    `positionCaseInsensitive` already narrows the candidate set; this Python
    pass just disambiguates same-prefix hashtags.
    """
    text_lower = text.lower()
    needle_lower = needle.lower()
    idx = text_lower.find(needle_lower)
    while idx >= 0:
        end = idx + len(needle_lower)
        if end >= len(text_lower):
            return True
        nxt = text_lower[end]
        if not (nxt.isalnum() or nxt == "_"):
            return True
        idx = text_lower.find(needle_lower, end)
    return False


def _scan_comments(
    client: Client, user_id: str, hashtag: str,
) -> list[list[Any]]:
    """Build mention rows from comments that mention the tag (source='comment')."""
    needle = f"#{hashtag}"
    rows = safe_call(
        lambda: client.query(
            SCAN_COMMENTS_FOR_BRANDED_HASHTAG,
            parameters={"user_id": user_id, "needle": needle},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo._scan_comments",
    )
    now = _now()
    out: list[list[Any]] = []
    for r in rows:
        ig_comment_id, ig_media_id, username, text, like_count, ts, permalink = r
        text_str = str(text or "")
        if not _has_word_boundary_match(text_str, needle):
            continue
        out.append([
            str(uuid.uuid4()), user_id, hashtag, str(ig_comment_id or ""),
            str(ig_media_id or ""), str(permalink or ""),
            str(username or ""), text_str[:4000],
            int(like_count or 0), ts or now, now, now,
            "comment",
        ])
    return out


def _scan_posts(
    client: Client, user_id: str, hashtag: str,
) -> list[list[Any]]:
    """Build mention rows from the user's own posts using the tag (source='post').

    Posts don't have an ig_comment_id, so the dedup key is set to
    `post:<ig_media_id>` to keep the (user, hashtag, ig_comment_id) ORDER BY
    unique against any same-media comment row.
    """
    rows = safe_call(
        lambda: client.query(
            SCAN_POSTS_FOR_BRANDED_HASHTAG,
            parameters={"user_id": user_id, "hashtag": hashtag},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo._scan_posts",
    )
    now = _now()
    out: list[list[Any]] = []
    for r in rows:
        ig_media_id, permalink, caption, like_count, ts = r
        out.append([
            str(uuid.uuid4()), user_id, hashtag, f"post:{ig_media_id}",
            str(ig_media_id or ""), str(permalink or ""),
            "",  # username — your own post; FE renders as "Your post"
            str(caption or "")[:4000],
            int(like_count or 0), ts or now, now, now,
            "post",
        ])
    return out


def scan_for_mentions(
    client: Client, user_id: str, hashtag: str,
) -> int:
    """Scan both the user's own captions and inbound comments for the brand tag.

    Returns the number of rows written. Idempotent — the table is a
    ReplacingMergeTree keyed on (user_id, hashtag, ig_comment_id) where post
    rows use 'post:<ig_media_id>' as the synthetic comment id.
    """
    inserts = _scan_posts(client, user_id, hashtag) + _scan_comments(
        client, user_id, hashtag,
    )
    if not inserts:
        return 0
    inserted = safe_call(
        lambda: (client.insert(
            "branded_hashtag_comment_mentions", inserts,
            column_names=_MENTION_COLUMNS,
        ), len(inserts))[1],
        fallback=0,
        label="branded_hashtag_repo.scan_for_mentions.insert",
    )
    return inserted


# Backwards-compat shim — the scheduler job and router still import this name.
scan_comments_for_mentions = scan_for_mentions


def find_mentions(
    client: Client,
    user_id: str,
    hashtag: str,
    since: datetime,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Recent mention list for one tag in [since, now]."""
    rows = safe_call(
        lambda: client.query(
            GET_BRANDED_HASHTAG_MENTIONS,
            parameters={
                "user_id": user_id,
                "hashtag": hashtag,
                "since": since,
                "limit": limit,
            },
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.find_mentions",
    )
    return [
        {
            "ig_comment_id": r[0],
            "ig_media_id": r[1] or "",
            "permalink": r[2] or "",
            "username": r[3] or "",
            "text": r[4] or "",
            "like_count": int(r[5] or 0),
            "timestamp": str(r[6]),
            "source": r[7] or "comment",
        }
        for r in rows
    ]


def find_mention_counts(
    client: Client, user_id: str, since: datetime,
) -> dict[str, dict[str, Any]]:
    """Aggregate mention counts per tag, keyed by hashtag."""
    rows = safe_call(
        lambda: client.query(
            GET_BRANDED_HASHTAG_MENTION_COUNTS,
            parameters={"user_id": user_id, "since": since},
        ).result_rows,
        fallback=[],
        label="branded_hashtag_repo.find_mention_counts",
    )
    return {
        r[0]: {
            "mention_count": int(r[1] or 0),
            "total_likes": int(r[2] or 0),
            "unique_authors": int(r[3] or 0),
            "latest_mention": str(r[4]) if r[4] else None,
        }
        for r in rows
    }
