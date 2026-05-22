"""Caption Studio synthesis — orchestration layer.

Same shape as the other AI features (load → prompt → LLM → parse →
quota record) with three deliberate differences:

1. **No cache.** Caption submissions are ephemeral — each draft is a
   different keyspace, and storing every one would be wasteful. We
   still record quota usage in `ai_quota_usage`.

2. **Server-side `length_fit`.** The plan (§6.4) is explicit: the LLM
   provides only `hook_strength`, `cta_presence`, and `overall`. We
   compute `length_fit` from the draft's character length vs the
   median length of the user's top captions for the format. Keeps the
   length meter accurate and the LLM honest about the other axes.

3. **Server-generated variant IDs.** The prompt instructs the model
   to put the literal placeholder `"PENDING"` in each `variant.id`;
   the server replaces with a stable `var_<12hex>` ID after parsing.
   Stable IDs give the frontend a clean `ref_id` for feedback.

Model: Haiku 4.5 — short outputs, latency-sensitive, cheapest tier.
"""

from __future__ import annotations

import json
import logging
import re
import statistics
import uuid
from datetime import datetime, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..exceptions import AIProviderError, InstagramNotConnectedError
from ..models.queries import GET_CAPTION_TOP_CAPTIONS
from ..repositories import instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    CAPTION_OUTPUT_SCHEMA,
    CAPTION_SYSTEM,
    redact_pii,
    render_caption_user_block,
    truncate_caption,
)
from .schemas import (
    CaptionScores,
    CaptionSuggestResponse,
    CaptionVariant,
)

logger = logging.getLogger(__name__)

# Synthesis tuning. Haiku 4.5 + effort=medium — caption work is
# pattern-matching with a short output, not deep reasoning.
CAPTION_EFFORT = "medium"
CAPTION_MAX_TOKENS = 2048

# Number of top captions to pull as the corpus. Plan §6.4 calls for 10.
TOP_CAPTION_LIMIT = 10

# Instagram's caption character cap. The score meter uses this as the
# upper edge of "length_fit" — drafts past this lose points fast.
INSTAGRAM_CAPTION_LIMIT = 2200

# Variants we accept in the response. The prompt also enumerates these
# in an enum, so the JSON-schema enforcement gives us a second guard.
_ALLOWED_LABELS = {
    "Punchier hook", "Stronger CTA", "Shorter", "Question hook",
    "Listicle", "Story arc", "Direct ask",
}


# --- Context loader -----------------------------------------------------

def _load_context(
    client: Client,
    *,
    user_id: str,
    ig_user_id: str,
    draft: str,
    fmt: str,
    topic_hint: str | None,
) -> tuple[dict[str, Any], list[int]]:
    """Pull the top captions for `fmt`. Returns the prompt context dict
    AND the list of caption lengths (for the server-side length_fit
    computation — kept separate so it isn't sent to the LLM)."""
    rows = client.query(
        GET_CAPTION_TOP_CAPTIONS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "format": fmt,
            "limit": TOP_CAPTION_LIMIT,
        },
    ).result_rows

    top_captions: list[dict[str, Any]] = []
    caption_lengths: list[int] = []
    for r in rows:
        (
            _ig_media_id, _mt, _mpt, raw_caption, ts,
            reach, saves, shares, likes, comments, interactions,
            algorithm_score_pct,
        ) = r
        safe = redact_pii(raw_caption or "")
        caption_lengths.append(len(safe))
        top_captions.append({
            "caption": truncate_caption(safe, 500),
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "reach": int(reach or 0),
            "saves": int(saves or 0),
            "shares": int(shares or 0),
            "likes": int(likes or 0),
            "comments": int(comments or 0),
            "interactions": int(interactions or 0),
            "algorithm_score_pct": float(algorithm_score_pct or 0),
            "length_chars": len(safe),
        })

    ctx: dict[str, Any] = {
        "format": fmt,
        "draft": redact_pii(draft.strip()),
        "draft_length_chars": len(draft.strip()),
        "topic_hint": (topic_hint or "").strip(),
        "instagram_caption_limit_chars": INSTAGRAM_CAPTION_LIMIT,
        "top_captions": top_captions,
    }
    return ctx, caption_lengths


# --- Server-side length_fit --------------------------------------------

def compute_length_fit(draft_length: int, top_lengths: list[int]) -> int:
    """Return a 0-100 length-fit score.

    Methodology:
      - If we have no historical captions to compare against, return 50
        (neutral — we have no signal).
      - Score 100 when the draft length is within ±20% of the median.
      - Linear falloff to 0 at 3x or 1/3x the median.
      - Hard penalty when over Instagram's character limit — clipped
        to 30 max regardless of distance from the median.

    Deterministic, dependency-free; same input → same output, every time.
    """
    if not top_lengths:
        return 50

    median = statistics.median(top_lengths)
    if median <= 0:
        return 50

    # Over IG limit — strong penalty.
    if draft_length > INSTAGRAM_CAPTION_LIMIT:
        overrun_pct = (draft_length - INSTAGRAM_CAPTION_LIMIT) / INSTAGRAM_CAPTION_LIMIT
        return max(0, int(round(30 - overrun_pct * 30)))

    ratio = draft_length / median if median > 0 else 1.0
    if ratio == 0:
        return 0

    # Symmetric in log space — 2x and 0.5x score the same.
    log_ratio = abs(_safe_log2(ratio))
    if log_ratio <= 0.30:        # within ±20% in log space
        return 100
    if log_ratio >= 1.58:        # 3x or 1/3x
        return 0
    # Linear interpolate 100 → 0 across [0.30, 1.58].
    return int(round(100 - (log_ratio - 0.30) / (1.58 - 0.30) * 100))


def _safe_log2(x: float) -> float:
    import math
    if x <= 0:
        return -10.0
    return math.log2(x)


# --- Synthesis ---------------------------------------------------------

def build_caption_prompt(ctx: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    user_block = render_caption_user_block(ctx)
    system = [{"type": "text", "text": CAPTION_SYSTEM}]
    messages = [
        {"role": "user", "content": (
            "Score the draft and produce 3 variants per the schema. "
            "Do not set length_fit — leave it at 0 for the server to "
            "fill in.\n\nDATA:\n" + user_block
        )},
    ]
    return system, messages


async def synthesize(
    client: Client,
    *,
    user_id: str,
    draft: str,
    fmt: str,
    topic_hint: str | None,
) -> CaptionSuggestResponse:
    """Run the full pipeline. Caller has already enforced quota."""
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()

    ctx, caption_lengths = _load_context(
        client,
        user_id=user_id,
        ig_user_id=profile.ig_user_id,
        draft=draft,
        fmt=fmt,
        topic_hint=topic_hint,
    )

    system, messages = build_caption_prompt(ctx)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CAPTION,
        system=system,
        messages=messages,
        effort=CAPTION_EFFORT,
        max_tokens=CAPTION_MAX_TOKENS,
        stream=False,
        output_format={"type": "json_schema", "schema": CAPTION_OUTPUT_SCHEMA},
    )
    parsed = parse_caption_output(result.text)

    # Server-authoritative length_fit overwrites whatever the LLM emitted
    # (the prompt told it to set 0, but the schema requires the field).
    length_fit = compute_length_fit(len(draft.strip()), caption_lengths)
    scores = CaptionScores(
        hook_strength=_clamp(parsed["scores"]["hook_strength"]),
        cta_presence=_clamp(parsed["scores"]["cta_presence"]),
        length_fit=length_fit,
        overall=_clamp(parsed["scores"]["overall"]),
    )

    # Server-assigned variant IDs replace the "PENDING" placeholder
    # the prompt tells the LLM to use. Stable per-call so the frontend
    # can use them as feedback ref_ids.
    variants: list[CaptionVariant] = []
    for v in parsed["variants"]:
        variants.append(CaptionVariant(
            id=f"var_{uuid.uuid4().hex[:12]}",
            label=v["label"],
            caption=v["caption"],
            rationale=v["rationale"],
        ))

    response = CaptionSuggestResponse(
        draft=draft.strip(),
        scores=scores,
        variants=variants,
        notes_md=parsed["notes_md"],
    )

    quota_service.record_call(
        client, user_id=user_id, feature="caption", result=result,
    )
    return response


def _clamp(v: Any, lo: int = 0, hi: int = 100) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return lo
    if n < lo:
        return lo
    if n > hi:
        return hi
    return n


# --- Parsing -----------------------------------------------------------

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_caption_output(text: str) -> dict[str, Any]:
    """Extract the structured caption payload from the model response.

    The JSON-schema enforcement should have already validated the
    shape, but we still parse defensively to handle stray prose
    wrapping the JSON object.
    """
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise AIProviderError(
            "Caption: no JSON object in model output",
            code="upstream_error",
        )
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIProviderError(
            f"Caption: JSON parse failed: {exc}",
            code="upstream_error",
        ) from exc

    scores_raw = payload.get("scores") or {}
    if not isinstance(scores_raw, dict):
        raise AIProviderError("Caption: scores object missing",
                              code="upstream_error")

    variants_raw = payload.get("variants") or []
    variants: list[dict[str, Any]] = []
    for v in variants_raw:
        if not isinstance(v, dict):
            continue
        label = v.get("label")
        if label not in _ALLOWED_LABELS:
            logger.warning("caption.parse.bad_label: %r", label)
            continue
        caption_text = str(v.get("caption") or "").strip()
        if not caption_text:
            continue
        # Cap each variant at IG's hard limit; the model is told to stay
        # under, but a runaway variant can sneak through.
        if len(caption_text) > INSTAGRAM_CAPTION_LIMIT:
            caption_text = caption_text[:INSTAGRAM_CAPTION_LIMIT]
        variants.append({
            "label": label,
            "caption": caption_text,
            "rationale": str(v.get("rationale") or "").strip()[:400],
        })

    if not variants:
        raise AIProviderError(
            "Caption: model returned zero usable variants",
            code="upstream_error",
        )

    return {
        "scores": {
            "hook_strength": _clamp(scores_raw.get("hook_strength")),
            "cta_presence": _clamp(scores_raw.get("cta_presence")),
            "overall": _clamp(scores_raw.get("overall")),
        },
        "variants": variants,
        "notes_md": str(payload.get("notes_md") or "").strip(),
    }


__all__ = [
    "synthesize",
    "parse_caption_output",
    "compute_length_fit",
]
