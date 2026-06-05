"""Preflight AI check — fires immediately when a video is published via webhook.

Checks the video title for CTR anti-patterns.
Stores result as a PREFLIGHT alert (only if score < 80).
"""

import json
import logging

logger = logging.getLogger(__name__)


async def run_preflight(user_id: str, video_id: str, title: str) -> None:
    from ..database import get_client
    from ..repositories import youtube_repo
    from ..ai.client import synthesize, _model_for_feature

    if not title:
        return

    prompt = (
        f'Analyze this YouTube video title for CTR best practices: "{title}"\n\n'
        "Return a JSON object with:\n"
        '- "score": integer 0-100 (100 = perfect)\n'
        '- "issues": array of short strings describing problems found\n'
        '- "suggestions": array of short actionable improvements\n\n'
        "Check: title length (flag if >60 chars), presence of a hook or curiosity gap, "
        "keyword strength, mobile readability, and emotional trigger words."
    )

    try:
        result = await synthesize(
            model=_model_for_feature(),
            system="You are a YouTube SEO expert. Return only valid JSON.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            output_format={"type": "object", "properties": {
                "score": {"type": "integer"},
                "issues": {"type": "array", "items": {"type": "string"}},
                "suggestions": {"type": "array", "items": {"type": "string"}},
            }},
        )
        data = json.loads(result.text)
    except Exception:
        logger.exception("Preflight AI failed for video %s", video_id)
        return

    score = data.get("score", 0)
    if score >= 80:
        return  # No alert needed for high-scoring titles

    client = get_client()
    youtube_repo.insert_alert(client, user_id, video_id, "PREFLIGHT", json.dumps(data))
