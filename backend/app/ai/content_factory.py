"""Content-factory synthesis: reel scripts, repurposing, question mining.

Three sibling features sharing the same pipeline shape (load context →
prompt → LLM → tolerant parse → quota record) and the same voice-corpus
loader, so they live in one module rather than three near-identical files.
Like Caption Studio, none of them cache — inputs are ephemeral.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..exceptions import AIProviderError, InstagramNotConnectedError
from ..models.queries import GET_CAPTION_TOP_CAPTIONS, GET_QUESTION_COMMENTS
from ..repositories import instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    QUESTION_MINING_OUTPUT_SCHEMA,
    QUESTION_MINING_SYSTEM,
    REEL_SCRIPT_OUTPUT_SCHEMA,
    REEL_SCRIPT_SYSTEM,
    REPURPOSE_OUTPUT_SCHEMA,
    REPURPOSE_SYSTEM,
    redact_pii,
    render_question_mining_user_block,
    render_reel_script_user_block,
    render_repurpose_user_block,
    truncate_caption,
)
from .schemas import (
    DemandTopic,
    QuestionMiningResponse,
    ReelScriptBeat,
    ReelScriptResponse,
    RepurposeResponse,
)

logger = logging.getLogger(__name__)

FACTORY_EFFORT = "medium"

#: Voice-reference captions pulled for script/repurpose prompts.
VOICE_CORPUS_LIMIT = 8
#: Max question comments fed to the miner — keeps the prompt bounded.
QUESTION_INPUT_LIMIT = 200

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_json_object(text: str, label: str) -> dict[str, Any]:
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise AIProviderError(f"{label}: no JSON object in model output", code="upstream_error")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"{label}: JSON parse failed: {exc}", code="upstream_error") from exc


def _load_voice_corpus(
    client: Client, user_id: str, ig_user_id: str, fmt: str = "REELS",
) -> list[dict[str, Any]]:
    """Top captions for `fmt`, shaped for the prompt context."""
    rows = client.query(
        GET_CAPTION_TOP_CAPTIONS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "format": fmt,
            "limit": VOICE_CORPUS_LIMIT,
        },
    ).result_rows
    return [
        {
            "caption": truncate_caption(redact_pii(r[3] or ""), 400),
            "reach": int(r[5] or 0),
            "saves": int(r[6] or 0),
            "shares": int(r[7] or 0),
            "interactions": int(r[10] or 0),
        }
        for r in rows
    ]


def _require_profile(client: Client, user_id: str):
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()
    return profile


# --- 1. Reel script ------------------------------------------------------

async def synthesize_reel_script(
    client: Client, *, user_id: str, title: str, summary: str | None,
) -> ReelScriptResponse:
    """Idea → ready-to-shoot reel script. Caller has enforced quota."""
    profile = _require_profile(client, user_id)
    ctx = {
        "idea": {
            "title": redact_pii(title.strip()),
            "summary": redact_pii((summary or "").strip())[:2000],
        },
        "top_reel_captions": _load_voice_corpus(client, user_id, profile.ig_user_id, "REELS"),
    }
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CONTENT_FACTORY,
        system=[{"type": "text", "text": REEL_SCRIPT_SYSTEM}],
        messages=[{"role": "user", "content": (
            "Write the reel script per the schema.\n\nDATA:\n"
            + render_reel_script_user_block(ctx)
        )}],
        effort=FACTORY_EFFORT,
        max_tokens=2048,
        stream=False,
        output_format={"type": "json_schema", "schema": REEL_SCRIPT_OUTPUT_SCHEMA},
    )
    payload = _parse_json_object(result.text, "Reel script")

    beats: list[ReelScriptBeat] = []
    for b in payload.get("beats") or []:
        if not isinstance(b, dict):
            continue
        action = str(b.get("action") or "").strip()
        if not action:
            continue
        try:
            seconds = max(0, min(90, int(b.get("seconds", 0))))
        except (TypeError, ValueError):
            seconds = 0
        beats.append(ReelScriptBeat(
            seconds=seconds,
            action=action[:300],
            voiceover=str(b.get("voiceover") or "").strip()[:300],
            on_screen_text=str(b.get("on_screen_text") or "").strip()[:200],
        ))
    if not beats:
        raise AIProviderError("Reel script: model returned no beats", code="upstream_error")

    try:
        duration = max(10, min(90, int(payload.get("duration_s", 30))))
    except (TypeError, ValueError):
        duration = 30

    response = ReelScriptResponse(
        title=title.strip(),
        hook=str(payload.get("hook") or "").strip()[:300],
        beats=beats,
        cta=str(payload.get("cta") or "").strip()[:300],
        duration_s=duration,
        rationale=str(payload.get("rationale") or "").strip()[:400],
    )
    quota_service.record_call(client, user_id=user_id, feature="reel_script", result=result)
    return response


# --- 2. Repurposer ---------------------------------------------------------

async def synthesize_repurpose(
    client: Client, *, user_id: str, content: str,
) -> RepurposeResponse:
    """One piece of content → four format assets. Caller has enforced quota."""
    profile = _require_profile(client, user_id)
    ctx = {
        "source_content": redact_pii(content.strip())[:6000],
        "voice_reference_captions": [
            c["caption"] for c in _load_voice_corpus(client, user_id, profile.ig_user_id, "REELS")
        ][:5],
    }
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CONTENT_FACTORY,
        system=[{"type": "text", "text": REPURPOSE_SYSTEM}],
        messages=[{"role": "user", "content": (
            "Produce the four assets per the schema.\n\nDATA:\n"
            + render_repurpose_user_block(ctx)
        )}],
        effort=FACTORY_EFFORT,
        max_tokens=4096,
        stream=False,
        output_format={"type": "json_schema", "schema": REPURPOSE_OUTPUT_SCHEMA},
    )
    payload = _parse_json_object(result.text, "Repurpose")

    def _md(key: str) -> str:
        return str(payload.get(key) or "").strip()

    response = RepurposeResponse(
        reel_script_md=_md("reel_script_md"),
        carousel_md=_md("carousel_md"),
        story_sequence_md=_md("story_sequence_md"),
        tweet_thread_md=_md("tweet_thread_md"),
    )
    if not any([response.reel_script_md, response.carousel_md,
                response.story_sequence_md, response.tweet_thread_md]):
        raise AIProviderError("Repurpose: model returned four empty assets", code="upstream_error")

    quota_service.record_call(client, user_id=user_id, feature="repurpose", result=result)
    return response


# --- 3. Question mining ------------------------------------------------------

async def synthesize_question_mining(
    client: Client, *, user_id: str, period_days: int, include_demo: bool = False,
) -> QuestionMiningResponse:
    """Cluster audience questions into demand topics. Caller has enforced quota.

    `include_demo=True` also mines the synthetic seed comments — useful for
    demoing the feature (e.g. the App Review screencast) before Meta unlocks
    real comment data. The response is flagged `demo=True` so the UI labels it.
    """
    _require_profile(client, user_id)
    since = (datetime.now(timezone.utc) - timedelta(days=period_days)).replace(tzinfo=None)
    rows = client.query(
        GET_QUESTION_COMMENTS,
        parameters={
            "user_id": user_id,
            "since": since,
            "limit": QUESTION_INPUT_LIMIT,
            "include_demo": 1 if include_demo else 0,
        },
    ).result_rows

    # Dedupe with counts: audiences repeat the same asks, and a long list of
    # near-identical questions sends reasoning models into deliberation loops
    # (observed: gpt-oss burning the whole token budget on hidden thinking).
    # A dozen distinct questions with counts is a trivial clustering task.
    counted: dict[str, int] = {}
    total = 0
    for r in rows:
        text = truncate_caption(redact_pii(r[0] or ""), 200).strip()
        if not text:
            continue
        total += 1
        counted[text.lower()] = counted.get(text.lower(), 0) + 1
    distinct = {t.lower(): t for r in rows if (t := truncate_caption(redact_pii(r[0] or ""), 200).strip())}
    questions = [
        {"question": distinct[key], "count": n}
        for key, n in sorted(counted.items(), key=lambda kv: -kv[1])
    ]

    if total < 3:
        # Not an LLM failure — there's just nothing to mine. No quota charge.
        return QuestionMiningResponse(
            period_days=period_days, questions_analyzed=total,
            demo=include_demo, topics=[],
        )

    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CONTENT_FACTORY,
        system=[{"type": "text", "text": QUESTION_MINING_SYSTEM}],
        messages=[{"role": "user", "content": (
            "Cluster the questions per the schema.\n\nDATA:\n"
            + render_question_mining_user_block({"questions": questions})
        )}],
        effort=FACTORY_EFFORT,
        # gpt-oss spends heavily on hidden reasoning when clustering many
        # questions — at 2048 the budget ran out before the JSON finished
        # (observed: 100 visible chars, output_tokens == max_tokens).
        max_tokens=8192,
        stream=False,
        output_format={"type": "json_schema", "schema": QUESTION_MINING_OUTPUT_SCHEMA},
    )
    payload = _parse_json_object(result.text, "Question mining")

    topics: list[DemandTopic] = []
    for t in payload.get("topics") or []:
        if not isinstance(t, dict):
            continue
        label = str(t.get("topic") or "").strip()
        pitch = str(t.get("content_pitch") or "").strip()
        fmt = t.get("suggested_format")
        if not label or not pitch or fmt not in ("REELS", "CAROUSEL", "IMAGE", "STORY"):
            continue
        try:
            count = max(1, int(t.get("question_count", 1)))
        except (TypeError, ValueError):
            count = 1
        topics.append(DemandTopic(
            id=f"dem_{uuid.uuid4().hex[:12]}",
            topic=label[:80],
            question_count=min(count, total),
            sample_questions=[str(q)[:200] for q in (t.get("sample_questions") or [])[:3]],
            content_pitch=pitch[:300],
            suggested_format=fmt,
        ))
    if not topics:
        raise AIProviderError("Question mining: model returned zero usable topics", code="upstream_error")
    topics.sort(key=lambda t: -t.question_count)

    response = QuestionMiningResponse(
        period_days=period_days, questions_analyzed=total,
        demo=include_demo, topics=topics,
    )
    quota_service.record_call(client, user_id=user_id, feature="question_mining", result=result)
    return response


__all__ = [
    "synthesize_reel_script",
    "synthesize_repurpose",
    "synthesize_question_mining",
]
