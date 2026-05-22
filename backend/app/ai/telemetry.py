"""Telemetry event sink. Receives the batched events the frontend
collects from every AI surface (catalog: frontend plan §16).

Append-only — `ai_events` uses MergeTree, not ReplacingMergeTree. No
dedupe at ingest time. The split between client-supplied `ts` and
server-stamped `received_at` lets us spot pipeline lag.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from .schemas import TelemetryEvent

logger = logging.getLogger(__name__)


def bulk_insert(
    client: Client,
    *,
    user_id: str,
    events: list[TelemetryEvent],
) -> int:
    """Insert a batch of telemetry events. Returns the row count."""
    if not events:
        return 0
    rows: list[list[Any]] = []
    for e in events:
        ts = e.ts
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        meta_str = json.dumps(e.meta, separators=(",", ":"), sort_keys=True) if e.meta else ""
        rows.append([
            uuid.uuid4(),
            user_id,
            ts,
            e.feature,
            e.action,
            e.ref_id or "",
            meta_str,
            int(e.latency_ms or 0),
        ])
    client.insert(
        "ai_events",
        rows,
        column_names=[
            "event_id", "user_id", "ts", "feature", "action",
            "ref_id", "meta_json", "latency_ms",
        ],
    )
    logger.info("ai.telemetry.ingested user=%s count=%d", user_id, len(rows))
    return len(rows)
