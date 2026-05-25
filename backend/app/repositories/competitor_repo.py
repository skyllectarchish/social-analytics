"""Competitor repository — ClickHouse operations for competitor handles + snapshots.

Schema:
* `competitor_handles` — user-added handles (one row per (user, handle))
* `competitor_snapshots` — daily snapshot per (user, handle)

Both use ReplacingMergeTree so "updates" are append-only.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    GET_COMPETITOR_HANDLES,
    GET_COMPETITOR_LATEST_SNAPSHOTS,
    GET_COMPETITOR_TIMELINE,
)
from .safe_query import is_schema_missing, log_schema_missing, safe_call

logger = logging.getLogger(__name__)

# Legacy column set — used as a fallback when migration 015 (which adds
# `consecutive_failures`) hasn't been applied yet so the GET_COMPETITOR_HANDLES
# query in queries.py errors out on the unknown column.
_LEGACY_GET_COMPETITOR_HANDLES = """
SELECT
    handle, ig_user_id, display_name, profile_picture_url
FROM competitor_handles FINAL
WHERE user_id = {user_id:UUID}
  AND active = 1
ORDER BY added_at ASC
"""

_LEGACY_LOAD_EXISTING_ROW = (
    "SELECT ig_user_id, display_name, profile_picture_url, added_at, active "
    "FROM competitor_handles FINAL "
    "WHERE user_id = {user_id:UUID} AND handle = {handle:String}"
)

#: Hard cap on active competitor handles per user. Keeps daily Graph API usage
#: well within Meta's per-app quota.
MAX_ACTIVE_COMPETITORS: int = 10

#: Threshold at which the daily competitor_sync job stops fetching a handle.
#: When `consecutive_failures` reaches this value, the handle is soft-deleted
#: so it no longer wastes API quota. Documented edge case in
#: tier2_competitor_benchmarking.md ("Competitor becomes private").
MAX_CONSECUTIVE_FAILURES: int = 3

#: Columns written on every competitor_handles insert. Pinned in one place so
#: the row layout stays consistent across upsert / soft_delete / failure-bump
#: paths — and so adding new columns (e.g., migration 015's
#: consecutive_failures) only needs to change two definitions.
_HANDLE_INSERT_COLUMNS: list[str] = [
    "id", "user_id", "handle", "ig_user_id", "display_name",
    "profile_picture_url", "active", "added_at", "updated_at",
    "consecutive_failures",
]
#: Legacy column set written when migration 015 hasn't been applied — the
#: failure counter is silently dropped, which is fine because the read path
#: already pads it back as 0.
_LEGACY_HANDLE_INSERT_COLUMNS: list[str] = [
    c for c in _HANDLE_INSERT_COLUMNS if c != "consecutive_failures"
]


def _insert_handle_row(client: Client, row: list) -> None:
    """Insert one row into `competitor_handles` with two layers of fallback.

    1. Try the full column set (includes `consecutive_failures`).
    2. If that errors out due to migration 015 not being applied, drop the
       counter column and retry with the legacy column set.
    3. If even the legacy insert fails because the table itself is missing
       (migration 012 not applied), log + skip rather than 500ing the request.
    """
    try:
        client.insert(
            "competitor_handles", [row], column_names=_HANDLE_INSERT_COLUMNS,
        )
        return
    except Exception as exc:
        if not is_schema_missing(exc):
            raise

    # Migration 015 missing: strip the consecutive_failures slot (last column)
    # and retry with the legacy column list.
    failures_idx = _HANDLE_INSERT_COLUMNS.index("consecutive_failures")
    legacy_row = row[:failures_idx] + row[failures_idx + 1:]
    try:
        client.insert(
            "competitor_handles", [legacy_row],
            column_names=_LEGACY_HANDLE_INSERT_COLUMNS,
        )
        log_schema_missing(
            "_insert_handle_row", exc,
            "dropped consecutive_failures (migration 015 not applied)",
        )
    except Exception as legacy_exc:
        if not is_schema_missing(legacy_exc):
            raise
        log_schema_missing(
            "_insert_handle_row", legacy_exc,
            "competitor_handles table missing — skipping insert",
        )


def _load_existing_handle_row(
    client: Client, user_id: str, handle: str,
) -> tuple | None:
    """Return the current handle row (ig_user_id, display_name, picture, added_at,
    active, consecutive_failures) or None if the handle isn't tracked.

    Falls back to the legacy column set (no `consecutive_failures`) when
    migration 015 hasn't been applied — the missing counter is padded with 0
    so downstream callers can rewrite the row safely. Returns None if the
    `competitor_handles` table itself is missing.
    """
    try:
        rows = client.query(
            "SELECT ig_user_id, display_name, profile_picture_url, added_at, "
            "       active, consecutive_failures "
            "FROM competitor_handles FINAL "
            "WHERE user_id = {user_id:UUID} AND handle = {handle:String}",
            parameters={"user_id": user_id, "handle": handle},
        ).result_rows
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        log_schema_missing(
            "_load_existing_handle_row", exc, "using legacy columns",
        )
        try:
            legacy = client.query(
                _LEGACY_LOAD_EXISTING_ROW,
                parameters={"user_id": user_id, "handle": handle},
            )
            rows = [(*r, 0) for r in legacy.result_rows]  # pad consecutive_failures=0
        except Exception as legacy_exc:
            if not is_schema_missing(legacy_exc):
                raise
            log_schema_missing(
                "_load_existing_handle_row", legacy_exc,
                "competitor_handles table missing — returning None",
            )
            return None

    if not rows:
        return None
    return rows[0]


def list_handles(client: Client, user_id: str) -> list[dict]:
    """Return active competitor handles for a user, with failure counters.

    Falls back to the legacy column set (no `consecutive_failures`) when
    migration 015 hasn't been applied, and to an empty list when the
    `competitor_handles` table itself is missing (migration 012 not run).
    """
    def primary():
        return client.query(
            GET_COMPETITOR_HANDLES, parameters={"user_id": user_id},
        ).result_rows

    try:
        rows = primary()
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        log_schema_missing(
            "list_handles", exc,
            "falling back to legacy column set (migration 015 not applied)",
        )
        try:
            legacy_rows = client.query(
                _LEGACY_GET_COMPETITOR_HANDLES,
                parameters={"user_id": user_id},
            ).result_rows
            rows = [(*r, 0) for r in legacy_rows]  # pad consecutive_failures=0
        except Exception as legacy_exc:
            if not is_schema_missing(legacy_exc):
                raise
            log_schema_missing(
                "list_handles", legacy_exc,
                "competitor_handles table missing — returning empty list",
            )
            return []

    return [
        {
            "handle": r[0],
            "ig_user_id": r[1] or "",
            "display_name": r[2] or "",
            "profile_picture_url": r[3] or "",
            "consecutive_failures": int(r[4] or 0) if len(r) > 4 else 0,
        }
        for r in rows
    ]


def count_active_handles(client: Client, user_id: str) -> int:
    """Return how many active handles the user has. 0 if the table is missing."""
    def primary() -> int:
        rows = client.query(
            "SELECT count() FROM competitor_handles FINAL "
            "WHERE user_id = {user_id:UUID} AND active = 1",
            parameters={"user_id": user_id},
        ).result_rows
        return int(rows[0][0]) if rows else 0

    return safe_call(primary, fallback=0, label="competitor_repo.count_active_handles")


def upsert_handle(
    client: Client,
    user_id: str,
    handle: str,
    ig_user_id: str,
    display_name: str,
    profile_picture_url: str,
    active: bool = True,
) -> None:
    """Insert or refresh a competitor handle row.

    Preserves the existing `consecutive_failures` counter if a row already
    exists so a user re-adding a handle (e.g. after manual removal) doesn't
    silently reset their failure history. New rows start at 0.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = _load_existing_handle_row(client, user_id, handle)
    existing_failures = int(existing[5] or 0) if existing else 0
    existing_added_at = existing[3] if existing else now

    _insert_handle_row(client, [
        str(uuid.uuid4()),
        user_id,
        handle,
        ig_user_id,
        display_name,
        profile_picture_url,
        1 if active else 0,
        existing_added_at or now,
        now,
        existing_failures,
    ])
    logger.info("Upserted competitor handle %s for user %s", handle, user_id)


def soft_delete_handle(client: Client, user_id: str, handle: str) -> bool:
    """Mark a handle inactive without dropping its snapshot history.

    Returns True if a row was found and soft-deleted, False if the handle
    wasn't tracked for this user (so the route can return 404 instead of
    a misleading 204 success).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = _load_existing_handle_row(client, user_id, handle)
    if existing is None:
        return False
    ig_user_id, display_name, profile_picture_url, added_at, _active, failures = existing
    _insert_handle_row(client, [
        str(uuid.uuid4()),
        user_id,
        handle,
        ig_user_id or "",
        display_name or "",
        profile_picture_url or "",
        0,
        added_at or now,
        now,
        int(failures or 0),
    ])
    logger.info("Soft-deleted competitor handle %s for user %s", handle, user_id)
    return True


def record_success(client: Client, user_id: str, handle: str) -> None:
    """Reset the consecutive_failures counter to 0 after a successful sync.

    No-op if the handle has no row or is already at 0.
    """
    existing = _load_existing_handle_row(client, user_id, handle)
    if existing is None:
        return
    failures = int(existing[5] or 0)
    if failures == 0:
        return
    ig_user_id, display_name, profile_picture_url, added_at, active, _ = existing
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_handle_row(client, [
        str(uuid.uuid4()),
        user_id,
        handle,
        ig_user_id or "",
        display_name or "",
        profile_picture_url or "",
        int(active or 0),
        added_at or now,
        now,
        0,
    ])
    logger.info(
        "Reset consecutive_failures for %s/%s (was %d)", user_id, handle, failures,
    )


def record_failure(client: Client, user_id: str, handle: str) -> int:
    """Increment `consecutive_failures` for one handle. Returns the new count.

    Callers (`competitor_sync`) compare the returned count to
    `MAX_CONSECUTIVE_FAILURES` to decide whether to soft-delete.
    """
    existing = _load_existing_handle_row(client, user_id, handle)
    if existing is None:
        return 0
    ig_user_id, display_name, profile_picture_url, added_at, active, failures = existing
    new_failures = int(failures or 0) + 1
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _insert_handle_row(client, [
        str(uuid.uuid4()),
        user_id,
        handle,
        ig_user_id or "",
        display_name or "",
        profile_picture_url or "",
        int(active or 0),
        added_at or now,
        now,
        new_failures,
    ])
    logger.warning(
        "Recorded failure %d for %s/%s", new_failures, user_id, handle,
    )
    return new_failures


def insert_snapshot(
    client: Client,
    user_id: str,
    handle: str,
    snapshot_date: date,
    metrics: dict[str, Any],
) -> None:
    """Append one snapshot row. `metrics` keys mirror CompetitorSnapshot fields.

    Silently skips if `competitor_snapshots` doesn't exist (migration 013 not
    applied) so the POST /competitors flow still succeeds — the FE just won't
    have historical data until the migration runs.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        client.insert(
            "competitor_snapshots",
            [[
                str(uuid.uuid4()),
                user_id,
                handle,
                snapshot_date,
                int(metrics.get("followers_count", 0)),
                int(metrics.get("media_count", 0)),
                int(metrics.get("posts_last_7d", 0)),
                int(metrics.get("reels_last_7d", 0)),
                int(metrics.get("carousels_last_7d", 0)),
                float(metrics.get("avg_likes_last_25", 0.0)),
                float(metrics.get("avg_comments_last_25", 0.0)),
                float(metrics.get("avg_engagement_rate_pct", 0.0)),
                now,
            ]],
            column_names=[
                "id", "user_id", "handle", "snapshot_date",
                "followers_count", "media_count",
                "posts_last_7d", "reels_last_7d", "carousels_last_7d",
                "avg_likes_last_25", "avg_comments_last_25", "avg_engagement_rate_pct",
                "fetched_at",
            ],
        )
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        logger.warning(
            "insert_snapshot: competitor_snapshots missing (%s) — skipping", exc,
        )


def latest_snapshots(client: Client, user_id: str) -> dict[str, dict]:
    """Return the most-recent snapshot per handle, keyed by handle.

    Returns an empty dict if `competitor_snapshots` doesn't exist
    (migration 013 not yet applied).
    """
    def primary():
        return client.query(
            GET_COMPETITOR_LATEST_SNAPSHOTS,
            parameters={"user_id": user_id},
        ).result_rows

    rows = safe_call(primary, fallback=[], label="competitor_repo.latest_snapshots")
    cols = [
        "handle", "snapshot_date", "followers_count", "media_count",
        "posts_last_7d", "reels_last_7d", "carousels_last_7d",
        "avg_likes_last_25", "avg_comments_last_25", "avg_engagement_rate_pct",
    ]
    out: dict[str, dict] = {}
    for r in rows:
        d = dict(zip(cols, r))
        out[d["handle"]] = d
    return out


def timeline(
    client: Client,
    user_id: str,
    since_date: date,
) -> dict[str, list[tuple[date, int]]]:
    """Return daily (date, followers) pairs per handle for the window.

    Returns an empty dict if `competitor_snapshots` doesn't exist.
    """
    def primary():
        return client.query(
            GET_COMPETITOR_TIMELINE,
            parameters={"user_id": user_id, "since_date": since_date},
        ).result_rows

    rows = safe_call(primary, fallback=[], label="competitor_repo.timeline")
    out: dict[str, list[tuple[date, int]]] = {}
    for handle, snapshot_date, followers_count in rows:
        out.setdefault(handle, []).append((snapshot_date, int(followers_count)))
    return out
