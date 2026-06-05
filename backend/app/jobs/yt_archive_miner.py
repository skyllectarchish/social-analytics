"""Archive Miner — weekly job that surfaces revival opportunities from old videos.

For each user's videos older than 1 year:
1. LLM extracts the core topic keyword + Wikipedia article title.
2. YouTube Autocomplete API checks real-time search demand.
3. Wikipedia Pageviews API checks for a trending spike.
4. If either signal fires, LLM generates a revival recommendation.
"""

import asyncio
import json
import logging

import httpx

from ..config import settings
from ..database import get_client
from ..repositories import youtube_repo

logger = logging.getLogger(__name__)


async def _extract_topic(title: str, description: str) -> dict:
    """Returns {"keyword": str, "wikipedia_article": str}."""
    from ..ai.client import synthesize, _model_for_feature
    prompt = (
        f'Video title: "{title}"\nDescription snippet: "{description[:200]}"\n\n'
        "Return a JSON object with:\n"
        '- "keyword": the single best YouTube search keyword for this topic (2-4 words)\n'
        '- "wikipedia_article": the exact Wikipedia article title for this topic\n'
        "Keep both short and specific. If no clear Wikipedia article exists, use the keyword."
    )
    result = await synthesize(
        model=_model_for_feature(),
        system="Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=80,
    )
    data = json.loads(result.text)
    return {"keyword": data.get("keyword", title[:40]), "wikipedia_article": data.get("wikipedia_article", title[:40])}


async def _check_youtube_autocomplete(keyword: str) -> list[str]:
    url = "http://suggestqueries.google.com/complete/search"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params={"client": "firefox", "ds": "yt", "q": keyword})
            if resp.status_code != 200:
                return []
            data = resp.json()
            return list(data[1]) if len(data) > 1 else []
    except Exception:
        return []


async def _check_wikipedia_spike(article: str) -> float:
    """Returns % change in pageviews (last 7d avg vs prior 23d avg). 0.0 on error."""
    from datetime import datetime, timedelta
    end = datetime.utcnow()
    start = end - timedelta(days=30)
    url = (
        f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
        f"/en.wikipedia/all-access/all-agents/{article.replace(' ', '_')}/daily"
        f"/{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"User-Agent": "InfluenceIQ/2.0"})
            if resp.status_code != 200:
                return 0.0
            items = resp.json().get("items", [])
            if len(items) < 14:
                return 0.0
            recent_7d_avg = sum(i["views"] for i in items[-7:]) / 7
            prior_avg = sum(i["views"] for i in items[:-7]) / max(len(items) - 7, 1)
            if prior_avg == 0:
                return 0.0
            return (recent_7d_avg - prior_avg) / prior_avg * 100
    except Exception:
        return 0.0


async def _generate_recommendation(title: str, keyword: str, spike_pct: float, suggestions: list[str]) -> dict:
    """Returns {"suggestion_type": str, "llm_recommendation": str}."""
    from ..ai.client import synthesize, _model_for_feature
    context = []
    if spike_pct > 30:
        context.append(f"Wikipedia pageviews for '{keyword}' spiked +{spike_pct:.0f}% in the last 7 days")
    if suggestions:
        context.append(f"YouTube autocomplete shows active demand: {', '.join(suggestions[:3])}")
    context_str = ". ".join(context)

    prompt = (
        f'Old video: "{title}"\n'
        f"Trend signal: {context_str}\n\n"
        "Suggest ONE specific action. Return JSON with:\n"
        '- "suggestion_type": one of REMAKE / SHORT / UPDATE\n'
        '- "llm_recommendation": 1-2 sentence specific action for the creator'
    )
    result = await synthesize(
        model=_model_for_feature(),
        system="Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
    )
    data = json.loads(result.text)
    return {
        "suggestion_type": data.get("suggestion_type", "UPDATE"),
        "llm_recommendation": data.get("llm_recommendation", "Consider updating this video."),
    }


async def run_for_user(user_id: str) -> None:
    """Process one user's old videos and write archive suggestions."""
    from datetime import datetime, timedelta

    client = get_client()

    # Get user's own channel for yt_channel_id scoping
    channel = youtube_repo.find_channel(client, user_id)
    yt_channel_id = channel["yt_channel_id"] if channel else ""

    cutoff = datetime.utcnow() - timedelta(days=365)

    rows = client.query(
        "SELECT video_id, title, description FROM youtube_videos FINAL "
        "WHERE user_id = {uid:UUID} AND published_at < {cutoff:DateTime} "
        "ORDER BY published_at DESC LIMIT {limit:UInt32}",
        parameters={"uid": user_id, "cutoff": cutoff, "limit": settings.archive_miner_max_videos_per_run},
    ).result_rows

    if not rows:
        return

    for video_id, title, description in rows:
        try:
            topic = await _extract_topic(title, description)
            keyword = topic["keyword"]
            wiki_article = topic["wikipedia_article"]

            suggestions = await _check_youtube_autocomplete(keyword)
            spike_pct = await _check_wikipedia_spike(wiki_article)

            if spike_pct < 30 and not any(keyword.lower() in s.lower() for s in suggestions):
                continue

            rec = await _generate_recommendation(title, keyword, spike_pct, suggestions)

            youtube_repo.upsert_archive_suggestion(client, user_id, {
                "yt_channel_id": yt_channel_id,
                "video_id": video_id,
                "original_title": title,
                "trending_topic": keyword,
                "wikipedia_spike_pct": spike_pct,
                "autocomplete_matches": suggestions[:5],
                "suggestion_type": rec["suggestion_type"],
                "llm_recommendation": rec["llm_recommendation"],
            })
        except Exception:
            logger.exception("Archive miner failed for video %s user %s", video_id, user_id)


async def _run() -> None:
    """Weekly batch: run archive miner for all connected YouTube users."""
    client = get_client()
    rows = client.query("SELECT DISTINCT user_id FROM youtube_tokens FINAL").result_rows
    for row in rows:
        await run_for_user(str(row[0]))


def main() -> None:
    asyncio.run(_run())
