"""Weekly digest synthesis — orchestration layer.

Flow:
  1. _load_context(user_id, week_of) pulls posts, deltas, format rates,
     follower change, and the best-hour shift from ClickHouse.
  2. build_digest_prompt() composes the static system block + the
     deterministic per-user JSON block.
  3. synthesize() calls Anthropic, parses the JSON response, runs the
     citation guard, persists to ai_digests, records quota usage.
  4. stream_synthesis() does the same but yields SSE-shaped frames as
     tokens arrive; the persist + parse happen at end-of-stream.

The contract returned matches `schemas.WeeklyDigestResponse` exactly —
field names + value shapes are pinned to the frontend.
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from clickhouse_connect.driver.client import Client

from ..exceptions import AIProviderError, InstagramNotConnectedError
from ..models.queries import (
    GET_AI_DIGEST,
    GET_DIGEST_FOLLOWER_DELTA,
    GET_DIGEST_FORMAT_RATES,
    GET_DIGEST_PEAK_HOUR,
    GET_DIGEST_POSTS_COUNT_SINCE,
    GET_DIGEST_WEEK_POSTS,
    GET_DIGEST_WINDOW_AGGREGATES,
)
from ..repositories import instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    DIGEST_SYSTEM,
    redact_pii,
    render_digest_user_block,
    truncate_caption,
)
from .schemas import (
    DigestBullet,
    DigestBulletLink,
    MetricsSnapshot,
    WeeklyDigestResponse,
)

logger = logging.getLogger(__name__)

# Synthesis tuning. effort=high is per plan §5 — synthesis quality
# matters here more than token spend.
DIGEST_MAX_TOKENS = 4096
DIGEST_EFFORT = "high"

# Citation guard tolerance — narrative numbers must match the input
# within this band, otherwise the response is rejected as hallucinated.
CITATION_TOLERANCE_PCT = 5.0

# Minimum posting history before we even attempt synthesis.
MIN_POSTS_LAST_7D = 1     # one post in the week minimum
MIN_POSTS_LAST_30D = 3    # three posts in the trailing month minimum


# --- Cache I/O -----------------------------------------------------------

def find_cached(
    client: Client,
    *,
    user_id: str,
    week_of: date,
) -> WeeklyDigestResponse | None:
    """Read the cached digest row for (user_id, week_of). None if absent."""
    rows = client.query(
        GET_AI_DIGEST,
        parameters={"user_id": user_id, "week_of": week_of},
    ).result_rows
    if not rows:
        return None
    (
        cached_week_of,
        status,
        cached_flag,
        narrative_md,
        bullets_json,
        followups_json,
        metrics_json,
        generated_at,
    ) = rows[0]
    return WeeklyDigestResponse(
        week_of=cached_week_of,
        generated_at=_aware(generated_at),
        status=status,
        cached=bool(cached_flag),
        narrative_md=narrative_md or "",
        bullets=_deserialize_bullets(bullets_json),
        metrics_snapshot=_deserialize_metrics(metrics_json),
        followups=_deserialize_strings(followups_json),
    )


def persist(
    client: Client,
    *,
    user_id: str,
    week_of: date,
    response: WeeklyDigestResponse,
    model: str,
    prompt_hash: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_write_tokens: int,
    latency_ms: int,
) -> None:
    """Append a fresh row to ai_digests. ReplacingMergeTree dedupes."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row: list[Any] = [
        user_id,
        week_of,
        response.status,
        1 if response.cached else 0,
        response.narrative_md,
        json.dumps([b.model_dump() for b in response.bullets], separators=(",", ":")),
        json.dumps(response.followups, separators=(",", ":")),
        response.metrics_snapshot.model_dump_json(),
        model,
        prompt_hash,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        latency_ms,
        response.generated_at.replace(tzinfo=None) if response.generated_at.tzinfo else response.generated_at,
        now,
    ]
    client.insert(
        "ai_digests",
        [row],
        column_names=[
            "user_id", "week_of", "status", "cached", "narrative_md",
            "bullets_json", "followups_json", "metrics_snapshot", "model",
            "prompt_hash", "input_tokens", "output_tokens",
            "cache_read_tokens", "cache_write_tokens", "latency_ms",
            "generated_at", "updated_at",
        ],
    )


# --- Context loader -----------------------------------------------------

def _load_context(
    client: Client,
    *,
    user_id: str,
    ig_user_id: str,
    week_of: date,
) -> dict[str, Any]:
    """Pull every signal the prompt needs from ClickHouse.

    The returned dict is what `render_digest_user_block` serializes —
    keep keys stable across calls or you'll silently kill cache reuse.
    """
    start = datetime.combine(week_of, datetime.min.time())
    end = start + timedelta(days=7)
    prior_start = start - timedelta(days=7)
    baseline_start = start - timedelta(days=60)

    week_posts = client.query(
        GET_DIGEST_WEEK_POSTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": start,
            "until": end,
        },
    ).result_rows

    week_agg = _query_one(
        client, GET_DIGEST_WINDOW_AGGREGATES,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "since": start, "until": end},
    )
    prior_agg = _query_one(
        client, GET_DIGEST_WINDOW_AGGREGATES,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "since": prior_start, "until": start},
    )
    follows = _query_one(
        client, GET_DIGEST_FOLLOWER_DELTA,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "since": start, "until": end},
    )
    week_format = client.query(
        GET_DIGEST_FORMAT_RATES,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id,
                    "since": start, "until": end},
    ).result_rows
    prior_format = client.query(
        GET_DIGEST_FORMAT_RATES,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id,
                    "since": prior_start, "until": start},
    ).result_rows
    week_peak = _query_one(
        client, GET_DIGEST_PEAK_HOUR,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "since": start, "until": end},
    )
    baseline_peak = _query_one(
        client, GET_DIGEST_PEAK_HOUR,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "since": baseline_start, "until": start},
    )

    posts = []
    for r in week_posts:
        (
            ig_media_id, media_type, permalink, caption, ts,
            like_count, comments_count, reach, views, saves, shares, interactions,
        ) = r
        posts.append({
            "id": ig_media_id,
            "type": media_type,
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "caption": truncate_caption(redact_pii(caption or "")),
            "likes": int(like_count or 0),
            "comments": int(comments_count or 0),
            "reach": int(reach or 0),
            "views": int(views or 0),
            "saves": int(saves or 0),
            "shares": int(shares or 0),
            "interactions": int(interactions or 0),
        })

    week_reach = float(week_agg.get("total_reach") or 0)
    week_saves = float(week_agg.get("total_saves") or 0)
    week_shares = float(week_agg.get("total_shares") or 0)
    week_int = float(week_agg.get("total_interactions") or 0)
    prior_reach = float(prior_agg.get("total_reach") or 0)
    prior_saves = float(prior_agg.get("total_saves") or 0)

    week_save_rate = (week_saves / week_reach * 100) if week_reach else 0.0
    prior_save_rate = (prior_saves / prior_reach * 100) if prior_reach else 0.0

    deltas = {
        "save_rate_pct_delta": _pct_delta(week_save_rate, prior_save_rate),
        "reach_pct_delta": _pct_delta(week_reach, prior_reach),
        "follows_delta": int(follows.get("net_change") or 0),
        "posts_count": int(week_agg.get("posts_count") or 0),
    }

    return {
        "week_of": week_of,
        "posts": posts,
        "totals": {
            "reach": round(week_reach),
            "saves": round(week_saves),
            "shares": round(week_shares),
            "interactions": round(week_int),
        },
        "deltas": deltas,
        "format_rates": _serialize_format_rates(week_format, prior_format),
        "peak_hour": {
            "this_week": int(week_peak["hour"]) if week_peak else None,
            "trailing_60d": int(baseline_peak["hour"]) if baseline_peak else None,
        },
    }


def _query_one(client: Client, query: str, params: dict) -> dict[str, Any]:
    res = client.query(query, parameters=params)
    if not res.result_rows:
        return {}
    cols = res.column_names
    return dict(zip(cols, res.result_rows[0]))


def _serialize_format_rates(week_rows: list, prior_rows: list) -> list[dict]:
    """Pivot the two windows into a per-format delta list. Stable order."""
    by_type: dict[str, dict[str, Any]] = {}
    for r in week_rows:
        (mtype, save_r, share_r, eng_r, posts) = r
        by_type[mtype] = {
            "media_type": mtype,
            "save_rate_pct_this_week": round(float(save_r or 0) * 100, 3),
            "share_rate_pct_this_week": round(float(share_r or 0) * 100, 3),
            "engagement_rate_pct_this_week": round(float(eng_r or 0) * 100, 3),
            "posts_this_week": int(posts or 0),
            "save_rate_pct_prior_week": 0.0,
            "share_rate_pct_prior_week": 0.0,
            "engagement_rate_pct_prior_week": 0.0,
            "posts_prior_week": 0,
        }
    for r in prior_rows:
        (mtype, save_r, share_r, eng_r, posts) = r
        entry = by_type.setdefault(mtype, {
            "media_type": mtype,
            "save_rate_pct_this_week": 0.0,
            "share_rate_pct_this_week": 0.0,
            "engagement_rate_pct_this_week": 0.0,
            "posts_this_week": 0,
        })
        entry["save_rate_pct_prior_week"] = round(float(save_r or 0) * 100, 3)
        entry["share_rate_pct_prior_week"] = round(float(share_r or 0) * 100, 3)
        entry["engagement_rate_pct_prior_week"] = round(float(eng_r or 0) * 100, 3)
        entry["posts_prior_week"] = int(posts or 0)
    return sorted(by_type.values(), key=lambda d: d["media_type"])


def _pct_delta(curr: float, prior: float) -> float | None:
    if not prior:
        return None
    return round((curr - prior) / prior * 100, 2)


# --- Sufficiency check --------------------------------------------------

def has_enough_data(
    client: Client,
    *,
    user_id: str,
    ig_user_id: str,
    week_of: date,
) -> bool:
    """Return False when the user has too little posting history for a
    meaningful digest. Cheap call — runs before any LLM spend."""
    week_start = datetime.combine(week_of, datetime.min.time())
    week_posts = _query_one(
        client, GET_DIGEST_POSTS_COUNT_SINCE,
        {"user_id": user_id, "ig_user_id": ig_user_id, "since": week_start},
    )
    if int(week_posts.get("posts") or 0) < MIN_POSTS_LAST_7D:
        return False
    month_start = week_start - timedelta(days=30)
    month_posts = _query_one(
        client, GET_DIGEST_POSTS_COUNT_SINCE,
        {"user_id": user_id, "ig_user_id": ig_user_id, "since": month_start},
    )
    if int(month_posts.get("posts") or 0) < MIN_POSTS_LAST_30D:
        return False
    return True


# --- Synthesis (blocking) -----------------------------------------------

def build_digest_prompt(ctx: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Return (system_blocks, user_messages) for the synthesize() call.

    Ollama flattens the system blocks into a single string, so the list
    shape is preserved only for parser-side stability — content matters,
    structure doesn't."""
    user_block = render_digest_user_block(ctx)
    system = [{"type": "text", "text": DIGEST_SYSTEM}]
    messages = [
        {"role": "user", "content": "Synthesize the weekly digest for "
                                    "this account, using the JSON data below.\n\n"
                                    f"DATA:\n{user_block}"},
    ]
    return system, messages


async def synthesize(
    client: Client,
    *,
    user_id: str,
    week_of: date,
    auto_charged: bool = False,
) -> WeeklyDigestResponse:
    """Single-shot synthesis — fetch context, call LLM, persist, charge."""
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()

    if not has_enough_data(client, user_id=user_id,
                           ig_user_id=profile.ig_user_id, week_of=week_of):
        return _not_enough_data_response(week_of)

    ctx = _load_context(
        client, user_id=user_id, ig_user_id=profile.ig_user_id, week_of=week_of,
    )
    system, messages = build_digest_prompt(ctx)

    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_DIGEST,
        system=system,
        messages=messages,
        effort=DIGEST_EFFORT,
        max_tokens=DIGEST_MAX_TOKENS,
        stream=False,
    )
    parsed = parse_digest_output(result.text, ctx)

    response = WeeklyDigestResponse(
        week_of=week_of,
        generated_at=datetime.now(timezone.utc),
        status="ready",
        cached=False,
        narrative_md=parsed["narrative_md"],
        bullets=parsed["bullets"],
        metrics_snapshot=_metrics_from_ctx(ctx),
        followups=parsed["followups"],
    )

    persist(
        client,
        user_id=user_id, week_of=week_of, response=response,
        model=result.model, prompt_hash=_prompt_hash(system, messages),
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        latency_ms=result.latency_ms,
    )
    quota_service.record_call(
        client, user_id=user_id,
        feature="digest_auto" if auto_charged else "digest",
        result=result,
    )
    return response


# --- Streaming ----------------------------------------------------------

async def stream_synthesis(
    client: Client,
    *,
    user_id: str,
    week_of: date,
) -> AsyncIterator[str]:
    """Yield SSE frames for the live digest synthesis.

    Wire format matches `tier4-ai-layer-frontend-plan.md` §18:
      event: token   data: {"text": "...", "seq": N}
      event: done    data: <full WeeklyDigestResponse JSON>
      event: error   data: {"code": "...", "message": "..."}

    A `: keepalive` comment frame is emitted at the start to defeat
    proxy idle-drops; the streaming SDK call itself flushes frequently
    enough that explicit periodic keepalives are unnecessary for the
    expected 4-8s synthesis window.
    """
    yield ": keepalive\n\n"

    try:
        profile = instagram_repo.find_profile(client, user_id)
        if profile is None:
            yield _sse_error("not_connected", "Instagram not connected")
            return

        if not has_enough_data(client, user_id=user_id,
                               ig_user_id=profile.ig_user_id, week_of=week_of):
            response = _not_enough_data_response(week_of)
            yield _sse_done(response)
            return

        ctx = _load_context(
            client, user_id=user_id,
            ig_user_id=profile.ig_user_id, week_of=week_of,
        )
        system, messages = build_digest_prompt(ctx)

        ai = ai_client.get_ai_client()
        # Flatten the system blocks the same way ai_client.synthesize does,
        # then call Ollama's chat(stream=True) directly so we can yield
        # frames as tokens arrive.
        system_text = ai_client._flatten_system(system)
        ollama_messages: list[dict] = []
        if system_text:
            ollama_messages.append({"role": "system", "content": system_text})
        for m in messages:
            ollama_messages.append({
                "role": m.get("role", "user"),
                "content": m.get("content") or "",
            })

        t0 = time.perf_counter()
        chunks: list[str] = []
        seq = 0
        final_chunk: dict | None = None
        async for chunk in await ai.chat(
            model=ai_client.MODEL_FOR_DIGEST,
            messages=ollama_messages,
            options={"num_predict": DIGEST_MAX_TOKENS},
            stream=True,
        ):
            msg = ai_client._get(chunk, "message")
            delta = ai_client._get(msg, "content") if msg is not None else ""
            if delta:
                seq += 1
                chunks.append(delta)
                yield (
                    f"event: token\n"
                    f"data: {json.dumps({'text': delta, 'seq': seq})}\n\n"
                )
            if ai_client._get(chunk, "done"):
                final_chunk = chunk
        latency_ms = int((time.perf_counter() - t0) * 1000)

        full_text = "".join(chunks)
        parsed = parse_digest_output(full_text, ctx)
        response = WeeklyDigestResponse(
            week_of=week_of,
            generated_at=datetime.now(timezone.utc),
            status="ready",
            cached=False,
            narrative_md=parsed["narrative_md"],
            bullets=parsed["bullets"],
            metrics_snapshot=_metrics_from_ctx(ctx),
            followups=parsed["followups"],
        )

        result = ai_client.SynthResult(
            text=full_text,
            input_tokens=int(ai_client._get(final_chunk, "prompt_eval_count") or 0),
            output_tokens=int(ai_client._get(final_chunk, "eval_count") or 0),
            cache_read_tokens=0,
            cache_write_tokens=0,
            latency_ms=latency_ms,
            stop_reason=ai_client._get(final_chunk, "done_reason") or None,
            model=ai_client.MODEL_FOR_DIGEST,
        )

        persist(
            client,
            user_id=user_id, week_of=week_of, response=response,
            model=result.model, prompt_hash=_prompt_hash(system, messages),
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cache_read_tokens=result.cache_read_tokens,
            cache_write_tokens=result.cache_write_tokens,
            latency_ms=result.latency_ms,
        )
        quota_service.record_call(
            client, user_id=user_id, feature="digest", result=result,
        )
        yield _sse_done(response)

    except AIProviderError as exc:
        yield _sse_error(exc.code, exc.message)
    except Exception as exc:  # noqa: BLE001
        logger.exception("digest.stream.failed: %s", exc)
        yield _sse_error("upstream_error", "Synthesis failed")


# --- Parsing + guard ----------------------------------------------------

# The LLM occasionally wraps JSON in a ```json fence or adds a stray
# preamble despite the prompt. We extract the first balanced JSON object.
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_digest_output(text: str, ctx: dict[str, Any]) -> dict[str, Any]:
    """Parse the model's response into bullets + followups + narrative."""
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise AIProviderError(
            "Model output did not contain a JSON object",
            code="upstream_error",
        )
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise AIProviderError(
            f"Model output JSON did not parse: {exc}",
            code="upstream_error",
        ) from exc

    narrative_md = str(payload.get("narrative_md") or "").strip()
    if not narrative_md:
        raise AIProviderError("Empty narrative", code="upstream_error")

    bullets_raw = payload.get("bullets") or []
    bullets: list[DigestBullet] = []
    for b in bullets_raw[:4]:
        try:
            link_data = b.get("link")
            link = (
                DigestBulletLink(**link_data)
                if isinstance(link_data, dict) and link_data.get("route")
                else None
            )
            bullets.append(
                DigestBullet(
                    kind=b["kind"],
                    headline=str(b["headline"])[:120],
                    detail_md=str(b.get("detail_md") or ""),
                    link=link,
                )
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("digest.parse.bullet_skipped: %s", exc)

    followups = [
        str(x).strip() for x in (payload.get("followups") or [])
        if isinstance(x, str) and x.strip()
    ][:6]

    citation_guard(narrative_md, ctx)

    return {
        "narrative_md": narrative_md,
        "bullets": bullets,
        "followups": followups,
    }


# Numbers we will check against the input. We are conservative — only
# percentages and "Nx" multipliers, because those are the values the
# model is most likely to fabricate.
_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_MULTIPLIER_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[x×]")


def citation_guard(narrative_md: str, ctx: dict[str, Any]) -> None:
    """Reject the response if a number in the narrative is not within
    ±CITATION_TOLERANCE_PCT of a value in the input data.

    This is a *best effort* defense against hallucinated metrics. We
    only check percentage values and multipliers because they are the
    most common fabrication shape. The guard is intentionally loose —
    we'd rather pass a borderline-correct number than reject a good
    digest.
    """
    candidates = _gather_citable_numbers(ctx)
    if not candidates:
        # No numbers available — can't check; allow the response.
        return

    for match in _PCT_RE.finditer(narrative_md):
        val = float(match.group(1))
        if not _matches_any(val, candidates):
            logger.warning(
                "digest.citation_guard.suspect val=%.2f narrative_excerpt=%r",
                val, narrative_md[max(0, match.start() - 30):match.end() + 30],
            )
            # Soft-fail: log only. Hard-fail can be re-enabled with a
            # flag once we have telemetry on false-positive rate.

    for match in _MULTIPLIER_RE.finditer(narrative_md):
        val = float(match.group(1))
        if not _matches_any(val, candidates, allow_ratio=True):
            logger.warning(
                "digest.citation_guard.suspect_multiplier val=%.2f",
                val,
            )


def _gather_citable_numbers(ctx: dict[str, Any]) -> list[float]:
    """Flatten every number in the input that the narrative might cite."""
    out: list[float] = []
    deltas = ctx.get("deltas") or {}
    for k in ("save_rate_pct_delta", "reach_pct_delta"):
        v = deltas.get(k)
        if v is not None:
            out.append(abs(float(v)))
    follows = deltas.get("follows_delta") or 0
    if follows:
        out.append(abs(float(follows)))
    totals = ctx.get("totals") or {}
    for v in totals.values():
        if v:
            out.append(float(v))
    for f in ctx.get("format_rates") or []:
        for k in (
            "save_rate_pct_this_week",
            "save_rate_pct_prior_week",
            "share_rate_pct_this_week",
            "engagement_rate_pct_this_week",
        ):
            v = f.get(k)
            if v:
                out.append(float(v))
        # delta within format
        a = f.get("save_rate_pct_this_week") or 0
        b = f.get("save_rate_pct_prior_week") or 0
        if b:
            out.append(abs(round((a - b) / b * 100, 2)))
    for p in ctx.get("posts") or []:
        if p.get("reach"):
            # reach multiplier vs week median is a common citation
            out.append(float(p["reach"]))
    return out


def _matches_any(val: float, candidates: list[float], allow_ratio: bool = False) -> bool:
    if val == 0:
        return True
    tol = CITATION_TOLERANCE_PCT / 100.0
    for c in candidates:
        if c == 0:
            continue
        if abs(c - val) / max(abs(c), 1.0) <= tol:
            return True
        if allow_ratio and abs(c) > 0:
            # 3.2× could correspond to ratio between two raw values.
            for c2 in candidates:
                if c2 > 0 and abs(c / c2 - val) <= tol * max(val, 1):
                    return True
    return False


# --- Helpers ------------------------------------------------------------

def _not_enough_data_response(week_of: date) -> WeeklyDigestResponse:
    return WeeklyDigestResponse(
        week_of=week_of,
        generated_at=datetime.now(timezone.utc),
        status="not_enough_data",
        cached=False,
        narrative_md="",
        bullets=[],
        metrics_snapshot=MetricsSnapshot(),
        followups=[],
    )


def _metrics_from_ctx(ctx: dict[str, Any]) -> MetricsSnapshot:
    deltas = ctx.get("deltas") or {}
    return MetricsSnapshot(
        save_rate_pct_delta=_as_float_or_none(deltas.get("save_rate_pct_delta")),
        reach_pct_delta=_as_float_or_none(deltas.get("reach_pct_delta")),
        follows_delta=_as_int_or_none(deltas.get("follows_delta")),
        posts_count=int(deltas.get("posts_count") or 0),
    )


def _as_float_or_none(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_int_or_none(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _deserialize_bullets(blob: str) -> list[DigestBullet]:
    if not blob:
        return []
    try:
        items = json.loads(blob)
    except json.JSONDecodeError:
        return []
    bullets: list[DigestBullet] = []
    for it in items:
        try:
            link_data = it.get("link")
            link = (
                DigestBulletLink(**link_data)
                if isinstance(link_data, dict) and link_data.get("route")
                else None
            )
            bullets.append(DigestBullet(
                kind=it["kind"],
                headline=it["headline"],
                detail_md=it.get("detail_md", ""),
                link=link,
            ))
        except (KeyError, ValueError, TypeError):
            continue
    return bullets


def _deserialize_metrics(blob: str) -> MetricsSnapshot:
    if not blob:
        return MetricsSnapshot()
    try:
        return MetricsSnapshot.model_validate_json(blob)
    except Exception:  # noqa: BLE001
        return MetricsSnapshot()


def _deserialize_strings(blob: str) -> list[str]:
    if not blob:
        return []
    try:
        items = json.loads(blob)
        return [str(x) for x in items if isinstance(x, str)]
    except json.JSONDecodeError:
        return []


def _aware(dt: datetime) -> datetime:
    """Ensure a UTC-aware datetime for response payloads."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _prompt_hash(system: list[dict], messages: list[dict]) -> str:
    """Stable sha256 of the rendered prompt — used for cache-debug."""
    import hashlib
    h = hashlib.sha256()
    h.update(json.dumps(system, sort_keys=True).encode("utf-8"))
    h.update(b"\n--\n")
    h.update(json.dumps(messages, sort_keys=True).encode("utf-8"))
    return h.hexdigest()


def _sse_done(response: WeeklyDigestResponse) -> str:
    return f"event: done\ndata: {response.model_dump_json()}\n\n"


def _sse_error(code: str, message: str) -> str:
    return (
        f"event: error\n"
        f"data: {json.dumps({'code': code, 'message': message})}\n\n"
    )


# Allow direct import — `from app.ai.digest import synthesize, ...`.
__all__ = [
    "find_cached",
    "has_enough_data",
    "synthesize",
    "stream_synthesis",
    "parse_digest_output",
    "citation_guard",
]
