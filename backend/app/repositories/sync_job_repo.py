"""Repository for insights-sync job tracking — instagram_sync_jobs.

POST /insights/sync inserts a 'running' row; the background task closes it out
with a 'completed'/'failed' row carrying the same job_id. ReplacingMergeTree on
(user_id, job_id) keeps only the freshest state, so /insights/sync/status reads
the most recent run with a FINAL query.

The finish insert re-supplies started_at and lookback_days so they survive the
ReplacingMergeTree collapse (the winning row by updated_at replaces the whole
row, not just changed columns).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from clickhouse_connect.driver.client import Client

from ..models.queries import GET_LATEST_SYNC_JOB
from .safe_query import is_schema_missing, log_schema_missing, safe_call

logger = logging.getLogger(__name__)

_COLUMNS = [
    "user_id", "job_id", "status", "lookback_days",
    "error", "started_at", "finished_at", "updated_at",
]


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _insert(client: Client, row: list[Any]) -> None:
    """Insert one sync-job row; swallow only the missing-table (migration 036) case.

    Sync tracking is best-effort: if the table isn't there yet the sync itself
    still runs, the status endpoint just reports 'idle' and the frontend falls
    back to a plain reload.
    """
    try:
        client.insert("instagram_sync_jobs", [row], column_names=_COLUMNS)
    except Exception as exc:
        if not is_schema_missing(exc):
            raise
        log_schema_missing(
            "sync_job_repo._insert", exc,
            "instagram_sync_jobs missing (migration 036) — sync status not tracked",
        )


def start_sync_job(
    client: Client, user_id: str, job_id: str, *, lookback_days: int, started_at: datetime,
) -> None:
    """Record that a sync run has started (status='running', not yet finished)."""
    now = _now()
    _insert(client, [
        user_id, job_id, "running", lookback_days, "", started_at, None, now,
    ])


def finish_sync_job(
    client: Client,
    user_id: str,
    job_id: str,
    *,
    lookback_days: int,
    started_at: datetime,
    status: str,
    error: str = "",
) -> None:
    """Close out a sync run. `status` is 'completed' or 'failed'."""
    now = _now()
    _insert(client, [
        user_id, job_id, status, lookback_days, error[:1000], started_at, now, now,
    ])


def get_latest_sync_job(client: Client, user_id: str) -> Optional[dict[str, Any]]:
    """The user's most recent sync run, or None if they've never synced."""
    rows = safe_call(
        lambda: client.query(
            GET_LATEST_SYNC_JOB, parameters={"user_id": user_id},
        ).result_rows,
        fallback=[],
        label="sync_job_repo.get_latest_sync_job",
    )
    if not rows:
        return None
    r = rows[0]
    return {
        "job_id": r[0],
        "status": r[1],
        "lookback_days": int(r[2] or 0),
        "error": r[3] or "",
        "started_at": r[4],
        "finished_at": r[5],
    }
