"""Tier 4 AI Copilot routes.

Mounted under `/api/ai/*` (and `/api/telemetry` for the shared sink).
All routes require JWT bearer auth via `get_current_user`.

Phase A scope:
  - GET  /api/ai/quota          live
  - POST /api/ai/feedback       live
  - POST /api/telemetry         live
  - GET  /api/ai/digest/weekly   → 501 (Phase B)
  - POST /api/ai/digest/regenerate → 501 (Phase B)
  - GET  /api/ai/digest/stream     → 501 (Phase B)
  - GET  /api/ai/ideas          → 501 (Phase C)
  - POST /api/ai/diagnose-post  → 501 (Phase D)
  - POST /api/ai/caption/suggest → 501 (Phase E)

The 501 stubs return a structured `detail.code` matching the
frontend's error taxonomy so the UI's error states render correctly
during development.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..auth.dependencies import get_current_user
from ..config import settings
from ..database import get_client
from ..models.user import User
from . import caption as caption_service
from . import comment_reply as comment_reply_service
from . import diagnostic as diagnostic_service
from . import digest as digest_service
from . import feedback as feedback_service
from . import ideas as ideas_service
from . import quota as quota_service
from . import telemetry as telemetry_service
from .schemas import (
    CaptionSuggestRequest,
    CaptionSuggestResponse,
    CommentReplySuggestRequest,
    CommentReplySuggestResponse,
    ContentIdeasResponse,
    DiagnoseRequest,
    DiagnosticResponse,
    FeedbackRequest,
    QuotaResponse,
    RegenerateDigestRequest,
    TelemetryRequest,
    WeeklyDigestResponse,
)


def _default_week_of() -> date:
    """The Monday of the current ISO week, UTC. Frontend leaves week_of
    blank to mean 'this week' — we resolve it server-side so multiple
    calls in the same week hit the same cache row."""
    today = datetime.now(timezone.utc).date()
    return today - timedelta(days=today.weekday())

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai"])


# --- Quota ---------------------------------------------------------------

@router.get("/api/ai/quota", response_model=QuotaResponse)
def get_quota(current_user: User = Depends(get_current_user)) -> QuotaResponse:
    """Return the user's current monthly AI call usage + limit."""
    client = get_client()
    used = quota_service.used_this_month(client, str(current_user.id))
    return QuotaResponse(
        used=used,
        limit=quota_service.effective_limit(),
        resets_at=quota_service.next_reset(),
    )


# --- Feedback ------------------------------------------------------------

@router.post("/api/ai/feedback", status_code=204)
def post_feedback(
    payload: FeedbackRequest,
    current_user: User = Depends(get_current_user),
) -> None:
    """Persist a thumbs feedback row. Idempotent on (user, feature, ref_id)."""
    client = get_client()
    feedback_service.upsert(
        client,
        user_id=str(current_user.id),
        feature=payload.feature,
        ref_id=payload.ref_id,
        rating=payload.rating,
        note=payload.note,
    )


# --- Telemetry -----------------------------------------------------------

@router.post("/api/telemetry", status_code=204)
def post_telemetry(
    payload: TelemetryRequest,
    current_user: User = Depends(get_current_user),
) -> None:
    """Append-only ingest of the frontend AI event batch."""
    max_per = settings.ai_telemetry_max_events_per_request
    if len(payload.events) > max_per:
        raise HTTPException(
            status_code=413,
            detail=f"Too many events in one request (max {max_per})",
        )
    client = get_client()
    telemetry_service.bulk_insert(
        client,
        user_id=str(current_user.id),
        events=payload.events,
    )


# --- Phase B/C/D/E stubs -------------------------------------------------
#
# Return 501 with a structured detail so the frontend's hook-side error
# paths (`useAIDigest`, `useContentIdeas`, etc.) can branch correctly
# during pre-backend integration.

def _not_implemented(feature: str) -> HTTPException:
    return HTTPException(
        status_code=501,
        detail=f"{feature} not implemented yet",
    )


# --- Weekly digest -------------------------------------------------------

@router.get("/api/ai/digest/weekly", response_model=WeeklyDigestResponse)
def get_weekly_digest(
    week_of: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
) -> WeeklyDigestResponse:
    """Read-only — return the cached digest, or a `stale` placeholder.

    Does NOT trigger synthesis or charge quota. Frontend uses this to
    populate the card on mount, then opens /digest/stream or POSTs
    /digest/regenerate when a fresh run is needed.
    """
    target_week = week_of or _default_week_of()
    client = get_client()
    cached = digest_service.find_cached(
        client, user_id=str(current_user.id), week_of=target_week,
    )
    if cached is not None:
        # Mark as stale if the cached row is older than 6h on the
        # current week — the frontend uses this to surface a "Last
        # refreshed Nh ago" pill and enable the regenerate button.
        if target_week == _default_week_of():
            age = datetime.now(timezone.utc) - cached.generated_at
            if age > timedelta(hours=6):
                return cached.model_copy(update={"status": "stale", "cached": True})
        return cached.model_copy(update={"cached": True})

    # No cache row. Don't synthesize here — return a 'stale' placeholder
    # so the frontend renders the empty digest card with a regenerate
    # CTA. The actual synthesis happens via /regenerate or /stream.
    return WeeklyDigestResponse(
        week_of=target_week,
        generated_at=datetime.now(timezone.utc),
        status="stale",
        cached=False,
        narrative_md="",
        bullets=[],
        followups=[],
    )


@router.post("/api/ai/digest/regenerate", response_model=WeeklyDigestResponse)
async def regenerate_digest(
    payload: RegenerateDigestRequest,
    current_user: User = Depends(get_current_user),
) -> WeeklyDigestResponse:
    """Cache-bypassing synthesis. Charges one quota call."""
    target_week = payload.week_of or _default_week_of()
    client = get_client()
    user_id = str(current_user.id)
    async with quota_service.user_lock(user_id):
        quota_service.enforce(client, user_id)
        return await digest_service.synthesize(
            client, user_id=user_id, week_of=target_week,
        )


@router.get("/api/ai/digest/stream")
async def stream_digest(
    week_of: date | None = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    """SSE stream of the digest synthesis. Charges one quota call when
    synthesis succeeds. Headers are tuned to keep upstream proxies from
    buffering — `X-Accel-Buffering: no` for nginx, `no-cache` so
    intermediate caches don't replay stale frames."""
    target_week = week_of or _default_week_of()
    client = get_client()
    user_id = str(current_user.id)
    quota_service.enforce(client, user_id)
    generator = digest_service.stream_synthesis(
        client, user_id=user_id, week_of=target_week,
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/api/ai/ideas", response_model=ContentIdeasResponse)
async def get_ideas(
    days: int = Query(default=90, ge=7, le=365),
    limit: int = Query(default=5, ge=1, le=10),
    refresh: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
) -> ContentIdeasResponse:
    """Return content ideas. Soft 6h cache by (user, days, limit).

    Cache hit within window → returns cached response without an LLM
    call and without charging quota. `refresh=true` forces a fresh run
    (still subject to the user's monthly quota).
    """
    client = get_client()
    user_id = str(current_user.id)
    if not refresh:
        cached = ideas_service.find_cached(
            client, user_id=user_id, period_days=days, limit_n=limit,
        )
        if cached is not None:
            return cached
    async with quota_service.user_lock(user_id):
        quota_service.enforce(client, user_id)
        return await ideas_service.synthesize(
            client, user_id=user_id, period_days=days, limit_n=limit,
        )


@router.post("/api/ai/diagnose-post", response_model=DiagnosticResponse)
async def diagnose_post(
    payload: DiagnoseRequest,
    current_user: User = Depends(get_current_user),
) -> DiagnosticResponse:
    """Diagnose one post. 5-minute cache + eligibility (≥24h) + quota
    enforcement. The frontend's drawer reads HTTP status: 422 →
    not-eligible empty state, 429 → quota banner, 502 → retry CTA."""
    client = get_client()
    user_id = str(current_user.id)
    cached = diagnostic_service.find_cached(
        client, user_id=user_id, ig_media_id=payload.ig_media_id,
    )
    if cached is not None:
        return cached
    async with quota_service.user_lock(user_id):
        quota_service.enforce(client, user_id)
        return await diagnostic_service.synthesize(
            client, user_id=user_id, ig_media_id=payload.ig_media_id,
        )


@router.post("/api/ai/comment-reply", response_model=CommentReplySuggestResponse)
async def suggest_comment_reply(
    payload: CommentReplySuggestRequest,
    current_user: User = Depends(get_current_user),
) -> CommentReplySuggestResponse:
    """Return 3 reply suggestions for one comment, in the creator's voice.

    No caching — each comment is its own keyspace. Charges one quota
    slot per call. 404 when the comment isn't in the user's synced data.
    """
    client = get_client()
    user_id = str(current_user.id)
    async with quota_service.user_lock(user_id):
        quota_service.enforce(client, user_id)
        return await comment_reply_service.synthesize(
            client, user_id=user_id, ig_comment_id=payload.ig_comment_id,
        )


@router.post("/api/ai/caption/suggest", response_model=CaptionSuggestResponse)
async def suggest_caption(
    payload: CaptionSuggestRequest,
    current_user: User = Depends(get_current_user),
) -> CaptionSuggestResponse:
    """Score the supplied draft + return 3 rewrite variants.

    No caching — caption submissions are ephemeral. Each call charges
    one quota slot. The frontend's `useCaptionStudio` reads HTTP 429
    for quota and 502 for upstream errors.
    """
    client = get_client()
    user_id = str(current_user.id)
    async with quota_service.user_lock(user_id):
        quota_service.enforce(client, user_id)
        return await caption_service.synthesize(
            client,
            user_id=user_id,
            draft=payload.draft,
            fmt=payload.format,
            topic_hint=payload.topic_hint,
        )
