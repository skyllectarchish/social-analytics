"""Comment-reply suggestion synthesis — orchestration layer.

Same shape as the other AI features (load → prompt → LLM → parse →
quota record). Like Caption Studio there is **no cache**: each comment
is its own keyspace and a creator rarely asks twice for the same one.

Context sent to the model:
- the incoming comment (PII-redacted) + its sentiment / question flags,
- the caption of the post it was left on (truncated),
- up to 5 of the creator's own recent replies as voice samples.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from clickhouse_connect.driver.client import Client

from ..exceptions import AIProviderError, EntityNotFoundError, InstagramNotConnectedError
from ..repositories import comment_repo, instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    COMMENT_REPLY_OUTPUT_SCHEMA,
    COMMENT_REPLY_SYSTEM,
    redact_pii,
    render_comment_reply_user_block,
    truncate_caption,
)
from .schemas import CommentReplySuggestion, CommentReplySuggestResponse

logger = logging.getLogger(__name__)

# Short outputs, latency-sensitive — same tuning rationale as captions.
REPLY_EFFORT = "medium"
REPLY_MAX_TOKENS = 1024

#: Voice samples pulled from the creator's own past replies.
VOICE_SAMPLE_LIMIT = 5

#: Hard cap per suggestion; the prompt asks for < 500 chars.
REPLY_CHAR_LIMIT = 500

_EXPECTED_TONES = ("friendly", "playful", "professional")


async def synthesize(
    client: Client,
    *,
    user_id: str,
    ig_comment_id: str,
) -> CommentReplySuggestResponse:
    """Run the full pipeline. Caller has already enforced quota."""
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()

    ctx_row = comment_repo.find_comment_with_context(client, user_id, ig_comment_id)
    if ctx_row is None:
        raise EntityNotFoundError("Comment")

    voice_samples = comment_repo.find_recent_self_replies(
        client, user_id, profile.username, limit=VOICE_SAMPLE_LIMIT,
    )

    ctx: dict[str, Any] = {
        "comment": {
            "text": truncate_caption(redact_pii(ctx_row["text"]), 500),
            "sentiment": ctx_row["sentiment"] or "unscored",
            "is_question": ctx_row["is_question"],
        },
        "post_caption": truncate_caption(redact_pii(ctx_row["media_caption"]), 300),
        "voice_samples": [
            truncate_caption(redact_pii(s), 200) for s in voice_samples
        ],
    }

    system = [{"type": "text", "text": COMMENT_REPLY_SYSTEM}]
    messages = [
        {"role": "user", "content": (
            "Propose 3 replies per the schema.\n\nDATA:\n"
            + render_comment_reply_user_block(ctx)
        )},
    ]

    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_COMMENT_REPLY,
        system=system,
        messages=messages,
        effort=REPLY_EFFORT,
        max_tokens=REPLY_MAX_TOKENS,
        stream=False,
        output_format={"type": "json_schema", "schema": COMMENT_REPLY_OUTPUT_SCHEMA},
    )
    suggestions = parse_reply_output(result.text)

    response = CommentReplySuggestResponse(
        ig_comment_id=ig_comment_id,
        suggestions=[
            CommentReplySuggestion(
                id=f"rep_{uuid.uuid4().hex[:12]}",
                tone=s["tone"],
                reply=s["reply"],
            )
            for s in suggestions
        ],
    )

    quota_service.record_call(
        client, user_id=user_id, feature="comment_reply", result=result,
    )
    return response


# --- Parsing -----------------------------------------------------------

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_reply_output(text: str) -> list[dict[str, str]]:
    """Extract suggestions from the model response, defensively."""
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise AIProviderError(
            "Comment reply: no JSON object in model output",
            code="upstream_error",
        )
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIProviderError(
            f"Comment reply: JSON parse failed: {exc}",
            code="upstream_error",
        ) from exc

    # The prompt + schema both pin "suggestions"/"reply", but Ollama's
    # json_schema enforcement is advisory for some models (observed:
    # gpt-oss emitting "replies"/"text"). Accept the common aliases.
    items = payload.get("suggestions") or payload.get("replies") or []

    out: list[dict[str, str]] = []
    seen_tones: set[str] = set()
    for s in items:
        if not isinstance(s, dict):
            continue
        tone = s.get("tone")
        reply = str(s.get("reply") or s.get("text") or "").strip()
        if tone not in _EXPECTED_TONES or tone in seen_tones or not reply:
            continue
        seen_tones.add(tone)
        out.append({"tone": tone, "reply": reply[:REPLY_CHAR_LIMIT]})

    if not out:
        raise AIProviderError(
            "Comment reply: model returned zero usable suggestions",
            code="upstream_error",
        )
    return out


__all__ = ["synthesize", "parse_reply_output"]
