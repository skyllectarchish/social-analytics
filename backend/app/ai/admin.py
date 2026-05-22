"""Admin router for Tier 4 ops endpoints.

Header-keyed via `X-Admin-Key`. Distinct from JWT auth because admin
tooling typically runs from CI or a one-off script — not as a user
session. The key is set via the `ADMIN_API_KEY` env var; if blank,
the admin routes are not mounted at all (see main.py).

Endpoints:
  GET /api/admin/ai-cost — daily/feature/model spend breakdown from
                           ai_quota_usage. Used by ops to track LLM cost.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ..config import settings
from ..database import get_client
from ..models.queries import GET_AI_COST_BREAKDOWN

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    """Reject any request whose X-Admin-Key header doesn't match.

    Constant-time compare via `secrets.compare_digest`. Returns 401 if
    the configured key is unset (defence-in-depth: even if the route is
    mounted by mistake, no key configured = no access).
    """
    import secrets
    expected = settings.admin_api_key or ""
    provided = x_admin_key or ""
    if not expected or not secrets.compare_digest(expected, provided):
        raise HTTPException(status_code=401, detail="Admin auth required")


@router.get("/ai-cost", dependencies=[Depends(require_admin_key)])
def ai_cost(
    since: date | None = Query(default=None,
                               description="Start of window (UTC date). "
                                           "Defaults to 30 days ago."),
    until: date | None = Query(default=None,
                               description="End of window (UTC date, "
                                           "exclusive). Defaults to today + 1."),
):
    """Aggregate AI spend by (day, feature, model)."""
    today = datetime.now(timezone.utc).date()
    start_date = since or (today - timedelta(days=30))
    end_date = until or (today + timedelta(days=1))
    since_dt = datetime.combine(start_date, time.min)
    until_dt = datetime.combine(end_date, time.min)

    client = get_client()
    rows = client.query(
        GET_AI_COST_BREAKDOWN,
        parameters={"since": since_dt, "until": until_dt},
    ).result_rows

    items = []
    totals = {
        "calls": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "cost_usd": 0.0,
    }
    for r in rows:
        day, feature, model, calls, in_t, out_t, cache_r, cache_w, micros = r
        usd = float(micros) / 1_000_000.0
        items.append({
            "day": day.isoformat() if hasattr(day, "isoformat") else str(day),
            "feature": feature,
            "model": model,
            "calls": int(calls),
            "input_tokens": int(in_t),
            "output_tokens": int(out_t),
            "cache_read_tokens": int(cache_r),
            "cache_write_tokens": int(cache_w),
            "cost_usd": round(usd, 4),
        })
        totals["calls"] += int(calls)
        totals["input_tokens"] += int(in_t)
        totals["output_tokens"] += int(out_t)
        totals["cache_read_tokens"] += int(cache_r)
        totals["cache_write_tokens"] += int(cache_w)
        totals["cost_usd"] += usd

    totals["cost_usd"] = round(totals["cost_usd"], 4)
    return {
        "since": start_date.isoformat(),
        "until": end_date.isoformat(),
        "rows": items,
        "totals": totals,
    }
