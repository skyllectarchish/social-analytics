"""Per-user AI quota tracking.

The `users.ai_monthly_call_limit` column doesn't exist (yet) — we read
the default from settings. When a per-user override is wanted later,
add the column and update `effective_limit()` to prefer it.

Quota is enforced on cost-incurring routes (`digest/regenerate`,
`ideas` with refresh, `diagnose-post`, `caption/suggest`). Routes that
serve from cache (`digest/weekly`, `quota`, `feedback`) skip the check.

The scheduled weekly digest job records its calls under
`feature='digest_auto'`, which `GET_AI_QUOTA_USED_THIS_MONTH` excludes
so the user's monthly budget isn't burned by automation.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..config import settings
from ..exceptions import QuotaExhaustedError
from ..models.queries import GET_AI_QUOTA_USED_THIS_MONTH
from . import client as ai_client

logger = logging.getLogger(__name__)

# Per-user serialization so concurrent requests from the same user can't both
# pass the `used < limit` check between the read and the eventual `record_call`
# write. One lock per user; concurrent users still parallelize. Cross-process
# (multi-worker) races aren't covered — at worst limit can be exceeded by N
# workers, which is acceptable for a soft per-user cap.
_user_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
_user_locks_mu = threading.Lock()


def user_lock(user_id: str) -> asyncio.Lock:
    """Return a process-wide asyncio.Lock for one user's quota window."""
    with _user_locks_mu:
        return _user_locks[user_id]


def effective_limit() -> int:
    """The monthly AI-call cap for any user. Future: read a per-user override."""
    return int(settings.ai_monthly_call_limit)


def used_this_month(client: Client, user_id: str) -> int:
    """Count of the user's AI calls in the current calendar month (UTC)."""
    rows = client.query(
        GET_AI_QUOTA_USED_THIS_MONTH,
        parameters={"user_id": user_id},
    ).result_rows
    return int(rows[0][0]) if rows else 0


def next_reset() -> datetime:
    """First of next month, UTC. Frontend shows this in the quota badge tooltip."""
    now = datetime.now(timezone.utc).replace(
        microsecond=0, second=0, minute=0, hour=0
    )
    year = now.year + (1 if now.month == 12 else 0)
    month = 1 if now.month == 12 else now.month + 1
    return now.replace(year=year, month=month, day=1)


def enforce(client: Client, user_id: str) -> None:
    """Raise QuotaExhaustedError when the user has hit their monthly cap.

    Callers handling cost-incurring routes should also wrap the
    check + LLM call + record_call sequence in ``async with user_lock(user_id):``
    so two concurrent requests can't both slip past the check on the same window.
    """
    limit = effective_limit()
    used = used_this_month(client, user_id)
    if used >= limit:
        reset = next_reset().isoformat()
        raise QuotaExhaustedError(resets_at=reset)


def record_call(
    client: Client,
    *,
    user_id: str,
    feature: str,
    result: ai_client.SynthResult,
) -> None:
    """Persist one row to ai_quota_usage. Called by per-feature services
    after every successful LLM round-trip — including scheduled jobs
    (which pass feature='digest_auto')."""
    micros = ai_client.cost_usd_micros(
        result.model,
        result.input_tokens,
        result.output_tokens,
        result.cache_read_tokens,
        result.cache_write_tokens,
    )
    row: list[Any] = [
        user_id,
        str(uuid.uuid4()),
        feature,
        result.model,
        result.input_tokens,
        result.output_tokens,
        result.cache_read_tokens,
        result.cache_write_tokens,
        micros,
        datetime.now(timezone.utc).replace(tzinfo=None),
    ]
    client.insert(
        "ai_quota_usage",
        [row],
        column_names=[
            "user_id", "call_id", "feature", "model",
            "input_tokens", "output_tokens", "cache_read_tokens",
            "cache_write_tokens", "cost_usd_micros", "called_at",
        ],
    )
    logger.info(
        "ai.quota.charged user=%s feature=%s model=%s in=%d out=%d "
        "cache_read=%d cache_write=%d usd_micros=%d latency_ms=%d",
        user_id, feature, result.model,
        result.input_tokens, result.output_tokens,
        result.cache_read_tokens, result.cache_write_tokens,
        micros, result.latency_ms,
    )
