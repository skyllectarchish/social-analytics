"""Tier 2 / F4 — nightly sentiment + question/spam scoring via Claude Haiku.

Runs `comment_repo.find_comments_pending_sentiment` then asks Claude Haiku 4.5
to classify each comment in batches. Persists results back into
`comment_sentiment`.

The job is intentionally simple — one Claude call per comment. Haiku is cheap
enough at scale (~$0.30 per 1k comments) that a smarter prompt-pack batching
strategy isn't needed until ingestion volume rises.

Usage:
    cd backend
    python -m app.jobs.sentiment_batch
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..config import settings
from ..database import get_client
from ..repositories.comment_repo import (
    bulk_insert_sentiment,
    find_comments_pending_sentiment,
)

logger = logging.getLogger(__name__)

MODEL_ID = "claude-haiku-4-5"
SYSTEM_PROMPT = (
    "You analyze Instagram comments. Respond with a SINGLE JSON object — no "
    "prose. Schema: {\"sentiment\": \"positive\"|\"neutral\"|\"negative\", "
    "\"score\": -1..1, \"is_question\": true|false, \"is_spam\": true|false}. "
    "Be strict on spam (giveaway bots, copy-paste promo, link spam). Emoji-only "
    "comments still carry sentiment."
)

# Lazily constructed so this module is importable even when the anthropic
# package isn't installed (the rest of the app shouldn't import it).
_client = None


def _anthropic():
    global _client
    if _client is None:
        try:
            from anthropic import Anthropic  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "anthropic package not installed. Run `pip install anthropic`."
            ) from exc
        api_key = getattr(settings, "anthropic_api_key", None)
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not configured in settings.")
        _client = Anthropic(api_key=api_key)
    return _client


# Extracts the first {...} block from a model response in case it adds prose.
_JSON_RE = re.compile(r"\{[^{}]*\}", re.DOTALL)


def _parse_response(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_RE.search(text)
        if not match:
            return {}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {}


def analyze_one(text: str) -> dict[str, Any]:
    """Score a single comment via Haiku. Returns a partial dict on failure."""
    try:
        msg = _anthropic().messages.create(
            model=MODEL_ID,
            max_tokens=120,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text[:500]}],
        )
    except Exception as exc:
        logger.warning("Haiku sentiment call failed: %s", exc)
        return {"sentiment": "neutral", "score": 0.0, "is_question": False, "is_spam": False}

    content = msg.content[0].text if msg.content else ""
    parsed = _parse_response(content)
    sentiment = parsed.get("sentiment")
    if sentiment not in {"positive", "neutral", "negative"}:
        sentiment = "neutral"
    return {
        "sentiment": sentiment,
        "score": float(parsed.get("score", 0.0)),
        "is_question": bool(parsed.get("is_question", False)),
        "is_spam": bool(parsed.get("is_spam", False)),
    }


def main(limit: int = 5000) -> int:
    """Score up to `limit` pending comments. Returns the count processed."""
    client = get_client()
    pending = find_comments_pending_sentiment(client, limit=limit)
    if not pending:
        logger.info("sentiment_batch: nothing to do")
        return 0

    scored: list[dict[str, Any]] = []
    for user_id, ig_comment_id, ig_media_id, text in pending:
        analysis = analyze_one(text)
        scored.append({
            "user_id": user_id,
            "ig_comment_id": ig_comment_id,
            "ig_media_id": ig_media_id,
            "model": MODEL_ID,
            **analysis,
        })

    bulk_insert_sentiment(client, scored)
    logger.info("sentiment_batch: scored %d comments", len(scored))
    return len(scored)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
