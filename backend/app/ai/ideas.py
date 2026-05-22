"""Content ideas synthesis — orchestration layer.

Same shape as digest.py: context loader → prompt builder → LLM call →
parser → persistence → quota record.

Differences from the digest:
  - Model: Haiku 4.5 (cheap, fast — themes are pattern-matching work).
  - Cache: soft 6h on (user_id, period_days, limit). Calls within that
    window reuse the prior response without charging quota.
  - Adjacent flag: the model proposes it, but the server overrides
    using a set-difference between the proposed theme and the user's
    historical hashtag distribution. Cheaper than trusting the LLM and
    guarantees adjacency is grounded in real data.
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
from ..models.queries import (
    GET_AI_IDEAS_CACHE,
    GET_IDEAS_HISTORICAL_HASHTAGS,
    GET_IDEAS_TOP_POSTS,
)
from ..repositories import instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    IDEAS_SYSTEM,
    redact_pii,
    render_ideas_user_block,
    truncate_caption,
)
from .schemas import ContentIdeasResponse, Idea, IdeasSourcePost

logger = logging.getLogger(__name__)

# Synthesis tuning. Haiku 4.5 with effort=medium is the cost/quality
# sweet spot for theme extraction — see plan §1.1.
IDEAS_EFFORT = "medium"
IDEAS_MAX_TOKENS = 4096

# Soft cache window. The endpoint returns the cached row without an LLM
# call if generated_at is within this many hours.
CACHE_TTL_HOURS = 6

# Minimum sample to bother with theme extraction.
MIN_TOP_POSTS = 3

# How many historical hashtags to fetch as the "user's themes" set used
# in the adjacency check. 50 is generous — adjacency is the loose
# direction (rarely-used theme ≈ adjacent).
HISTORICAL_HASHTAG_LIMIT = 50


# --- Cache I/O -----------------------------------------------------------

def find_cached(
    client: Client,
    *,
    user_id: str,
    period_days: int,
    limit_n: int,
    ttl_hours: int = CACHE_TTL_HOURS,
) -> ContentIdeasResponse | None:
    """Return the cached response if it exists and is within `ttl_hours`."""
    rows = client.query(
        GET_AI_IDEAS_CACHE,
        parameters={
            "user_id": user_id,
            "period_days": period_days,
            "limit_n": limit_n,
        },
    ).result_rows
    if not rows:
        return None
    response_json, _themes_json, generated_at = rows[0]
    if not response_json:
        return None
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - generated_at > timedelta(hours=ttl_hours):
        return None
    try:
        return ContentIdeasResponse.model_validate_json(response_json)
    except Exception:  # noqa: BLE001
        logger.warning("ideas.cache.decode_failed user=%s", user_id)
        return None


def persist(
    client: Client,
    *,
    user_id: str,
    period_days: int,
    limit_n: int,
    response: ContentIdeasResponse,
    themes_detected: list[str],
    model: str,
    prompt_hash: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_write_tokens: int,
    latency_ms: int,
) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    generated_at = response.generated_at
    if generated_at.tzinfo is not None:
        generated_at = generated_at.astimezone(timezone.utc).replace(tzinfo=None)
    row: list[Any] = [
        user_id,
        period_days,
        limit_n,
        response.model_dump_json(),
        json.dumps(themes_detected, separators=(",", ":")),
        model,
        prompt_hash,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        latency_ms,
        generated_at,
        now,
    ]
    client.insert(
        "ai_ideas",
        [row],
        column_names=[
            "user_id", "period_days", "limit_n", "response_json",
            "themes_json", "model", "prompt_hash",
            "input_tokens", "output_tokens",
            "cache_read_tokens", "cache_write_tokens",
            "latency_ms", "generated_at", "updated_at",
        ],
    )


# --- Context loader -----------------------------------------------------

def _load_context(
    client: Client,
    *,
    user_id: str,
    ig_user_id: str,
    period_days: int,
    limit_n: int,
) -> dict[str, Any]:
    """Pull the top posts + the user's historical theme distribution."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=period_days)
    top_rows = client.query(
        GET_IDEAS_TOP_POSTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "limit": max(limit_n * 2, 10),  # over-fetch so the LLM can pick
        },
    ).result_rows
    hashtag_rows = client.query(
        GET_IDEAS_HISTORICAL_HASHTAGS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "limit": HISTORICAL_HASHTAG_LIMIT,
        },
    ).result_rows

    posts = []
    for r in top_rows:
        (
            ig_media_id, media_type, permalink, thumbnail_url,
            caption_preview, ts, reach, likes, saves, shares, interactions,
            algorithm_score_pct,
        ) = r
        posts.append({
            "id": ig_media_id,
            "type": media_type,
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "caption": truncate_caption(redact_pii(caption_preview or "")),
            "reach": int(reach or 0),
            "likes": int(likes or 0),
            "saves": int(saves or 0),
            "shares": int(shares or 0),
            "interactions": int(interactions or 0),
            "algorithm_score_pct": float(algorithm_score_pct or 0),
        })

    historical_hashtags = [
        {"tag": tag, "post_count": int(count)}
        for tag, count in hashtag_rows
    ]

    return {
        "period_days": period_days,
        "limit": limit_n,
        "top_posts": posts,
        "historical_hashtags": historical_hashtags,
    }


# --- Synthesis ----------------------------------------------------------

def build_ideas_prompt(ctx: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    user_block = render_ideas_user_block(ctx)
    system = [{"type": "text", "text": IDEAS_SYSTEM}]
    messages = [
        {"role": "user", "content": (
            f"Generate up to {ctx['limit']} content ideas for this account. "
            f"Use only the supplied data — do not invent themes the creator "
            f"hasn't engaged with.\n\nDATA:\n{user_block}"
        )},
    ]
    return system, messages


async def synthesize(
    client: Client,
    *,
    user_id: str,
    period_days: int,
    limit_n: int,
) -> ContentIdeasResponse:
    """Run the full pipeline. Caller has already enforced quota."""
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()

    ctx = _load_context(
        client,
        user_id=user_id,
        ig_user_id=profile.ig_user_id,
        period_days=period_days,
        limit_n=limit_n,
    )

    if len(ctx["top_posts"]) < MIN_TOP_POSTS:
        # Not enough data to extract themes meaningfully. Return an
        # empty response — the frontend renders the insufficient-data
        # empty state from `data === null` in useContentIdeas, so we
        # also leave the response empty and skip the LLM call entirely.
        # No quota charge.
        logger.info("ideas.skip_synthesis user=%s reason=insufficient_posts count=%d",
                    user_id, len(ctx["top_posts"]))
        return ContentIdeasResponse(
            period_days=period_days,
            generated_at=datetime.now(timezone.utc),
            source_posts=[],
            themes_detected=[],
            ideas=[],
        )

    system, messages = build_ideas_prompt(ctx)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_IDEAS,
        system=system,
        messages=messages,
        effort=IDEAS_EFFORT,
        max_tokens=IDEAS_MAX_TOKENS,
        stream=False,
    )
    parsed = parse_ideas_output(result.text)
    themes_detected = parsed["themes_detected"]
    ideas = parsed["ideas"]

    # Server-side adjacency: a theme is adjacent if the user's
    # historical hashtag set contains nothing close to it. The LLM's
    # `adjacent` flag is a hint; we override authoritatively here.
    historical_tags = {h["tag"].lower() for h in ctx["historical_hashtags"]}
    ideas = _mark_adjacency(ideas, historical_tags)

    # Server-generated stable IDs so feedback ref_id is consistent
    # across re-render of the cache row.
    for idea in ideas:
        idea.id = f"idea_{uuid.uuid4().hex[:12]}"

    source_posts = [
        IdeasSourcePost(
            ig_media_id=p["id"],
            permalink=None,  # not stored in ctx; fetched fresh isn't worth it for now
            thumbnail_url=None,
            caption_preview=p["caption"],
            algorithm_score_pct=int(round(p["algorithm_score_pct"])),
        )
        for p in ctx["top_posts"][:limit_n]
    ]

    response = ContentIdeasResponse(
        period_days=period_days,
        generated_at=datetime.now(timezone.utc),
        source_posts=source_posts,
        themes_detected=themes_detected,
        ideas=ideas[:limit_n],
    )

    persist(
        client,
        user_id=user_id,
        period_days=period_days,
        limit_n=limit_n,
        response=response,
        themes_detected=themes_detected,
        model=result.model,
        prompt_hash=_prompt_hash(system, messages),
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        latency_ms=result.latency_ms,
    )
    quota_service.record_call(
        client, user_id=user_id, feature="ideas", result=result,
    )
    return response


# --- Parsing + adjacency ------------------------------------------------

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_ideas_output(text: str) -> dict[str, Any]:
    """Extract the themes + ideas payload from the model's response."""
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise AIProviderError("Ideas: no JSON object in model output",
                              code="upstream_error")
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"Ideas: JSON parse failed: {exc}",
                              code="upstream_error") from exc

    themes_detected = [
        _normalize_theme(t) for t in payload.get("themes_detected") or []
        if isinstance(t, str) and t.strip()
    ]
    # Dedupe while preserving order.
    seen: set[str] = set()
    themes_detected = [t for t in themes_detected if not (t in seen or seen.add(t))]

    ideas_raw = payload.get("ideas") or []
    ideas: list[Idea] = []
    for it in ideas_raw:
        try:
            ideas.append(Idea(
                id="placeholder",  # overwritten by caller
                title=str(it["title"])[:120],
                body_md=str(it.get("body_md") or ""),
                suggested_format=it.get("suggested_format") or "REELS",
                rationale=str(it.get("rationale") or ""),
                adjacent=bool(it.get("adjacent", False)),
            ))
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("ideas.parse.skipped: %s", exc)
            continue

    if not ideas:
        raise AIProviderError("Ideas: model returned zero parseable ideas",
                              code="upstream_error")

    return {"themes_detected": themes_detected, "ideas": ideas}


_THEME_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _normalize_theme(t: str) -> str:
    """Force to lowercase kebab-case so adjacency checks are deterministic."""
    cleaned = _THEME_NORMALIZE_RE.sub("-", t.lower()).strip("-")
    return cleaned[:60]


def _mark_adjacency(ideas: list[Idea], historical_tags: set[str]) -> list[Idea]:
    """Override the LLM's `adjacent` flag with a deterministic set check.

    An idea is adjacent if its title + body don't share enough lexical
    overlap with the historical hashtag set. We extract content tokens
    from title + body and compare against the set of historical tag
    tokens (e.g. 'morning-routines' → {'morning', 'routines'}).
    """
    if not historical_tags:
        # No history at all → every idea is "adjacent" by definition.
        return [idea.model_copy(update={"adjacent": True}) for idea in ideas]

    historical_tokens: set[str] = set()
    for tag in historical_tags:
        for piece in re.split(r"[^a-z0-9]+", tag.lower()):
            if len(piece) >= 4:
                historical_tokens.add(piece)

    out: list[Idea] = []
    for idea in ideas:
        content = f"{idea.title} {idea.body_md}".lower()
        content_tokens = {
            p for p in re.split(r"[^a-z0-9]+", content)
            if len(p) >= 4
        }
        overlap = historical_tokens & content_tokens
        # Adjacent: low overlap with the user's historical themes.
        adjacent = len(overlap) < 2
        out.append(idea.model_copy(update={"adjacent": adjacent}))
    return out


def _prompt_hash(system: list[dict], messages: list[dict]) -> str:
    import hashlib
    h = hashlib.sha256()
    h.update(json.dumps(system, sort_keys=True).encode("utf-8"))
    h.update(b"\n--\n")
    h.update(json.dumps(messages, sort_keys=True).encode("utf-8"))
    return h.hexdigest()


__all__ = [
    "find_cached",
    "synthesize",
    "parse_ideas_output",
]
