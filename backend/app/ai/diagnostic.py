"""Post diagnostic synthesis — orchestration layer.

Same shape as digest.py / ideas.py: context loader → prompt → LLM call
→ parse → persist → quota record.

Three details that differ:

1. **Eligibility check.** Posts younger than 24h have insights that
   haven't settled — we raise `MediaNotEligibleError` (422) before any
   LLM spend.

2. **Server-authoritative `baseline` and `observed` blocks.** The LLM
   never invents metric values — we compute baseline + observed in
   ClickHouse and merge them into the response after the LLM returns.
   The LLM only decides the verdict, factors, recommendations, and
   the `underperformed` flag.

3. **Structured-output enforcement.** Passes `output_config.format`
   with a JSON schema so the API rejects malformed factor rows
   (wrong key, missing evidence field, etc.) before we ever see them.

Cache TTL is 5 minutes — short, because the diagnostic for a fresh
post can shift meaningfully as insights settle. Long enough that
a drawer-close-and-reopen doesn't re-spend on the LLM.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..exceptions import (
    AIProviderError,
    EntityNotFoundError,
    InstagramNotConnectedError,
    MediaNotEligibleError,
)
from ..models.queries import (
    GET_AI_DIAGNOSTIC_CACHE,
    GET_DIAGNOSTIC_BASELINE,
    GET_DIAGNOSTIC_FORMAT_BASELINE,
    GET_DIAGNOSTIC_HOUR_DISTRIBUTION,
    GET_DIAGNOSTIC_POST_HASHTAGS,
    GET_DIAGNOSTIC_SENTIMENT_SUMMARY,
    GET_DIAGNOSTIC_TARGET_POST,
)
from ..repositories import instagram_repo
from . import client as ai_client
from . import quota as quota_service
from .prompts import (
    DIAGNOSTIC_OUTPUT_SCHEMA,
    DIAGNOSTIC_SYSTEM,
    redact_pii,
    render_diagnostic_user_block,
    truncate_caption,
)
from .schemas import (
    BaselineMetrics,
    DiagnosticFactor,
    DiagnosticResponse,
    FactorEvidence,
)

logger = logging.getLogger(__name__)

# Synthesis tuning. Sonnet 4.6 + effort=high — multi-factor causal
# reasoning is the part of Tier 4 most rewarded by good thinking.
DIAGNOSTIC_EFFORT = "high"
DIAGNOSTIC_MAX_TOKENS = 4096

# Minimum baseline sample size before we even attempt synthesis.
MIN_BASELINE_POSTS = 5

# Cache TTL — see module docstring.
CACHE_TTL_MINUTES = 5

# A post must be at least this old before insights are considered
# settled. 24h matches the frontend copy ("This post is too recent").
MIN_AGE_HOURS = 24

_FACTOR_KEYS = {"format", "timing", "hashtags", "topic", "duration", "hook"}
_SEVERITY_VALUES = {"high", "medium", "low", "neutral"}


# --- Cache I/O -----------------------------------------------------------

def find_cached(
    client: Client,
    *,
    user_id: str,
    ig_media_id: str,
    ttl_minutes: int = CACHE_TTL_MINUTES,
) -> DiagnosticResponse | None:
    """Return the cached diagnostic if within `ttl_minutes`. Else None."""
    rows = client.query(
        GET_AI_DIAGNOSTIC_CACHE,
        parameters={"user_id": user_id, "ig_media_id": ig_media_id},
    ).result_rows
    if not rows:
        return None
    response_json, generated_at = rows[0]
    if not response_json:
        return None
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - generated_at > timedelta(minutes=ttl_minutes):
        return None
    try:
        return DiagnosticResponse.model_validate_json(response_json)
    except Exception:  # noqa: BLE001
        logger.warning("diagnostic.cache.decode_failed user=%s media=%s",
                       user_id, ig_media_id)
        return None


def persist(
    client: Client,
    *,
    user_id: str,
    response: DiagnosticResponse,
    model: str,
    prompt_hash: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    cache_write_tokens: int,
    latency_ms: int,
) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row: list[Any] = [
        user_id,
        response.ig_media_id,
        response.model_dump_json(),
        1 if response.underperformed else 0,
        len(response.factors),
        model,
        prompt_hash,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        latency_ms,
        now,
        now,
    ]
    client.insert(
        "ai_diagnostics",
        [row],
        column_names=[
            "user_id", "ig_media_id", "response_json",
            "underperformed", "factor_count", "model", "prompt_hash",
            "input_tokens", "output_tokens",
            "cache_read_tokens", "cache_write_tokens",
            "latency_ms", "generated_at", "updated_at",
        ],
    )


# --- Context loader -----------------------------------------------------

def _load_target_post(
    client: Client, *, user_id: str, ig_media_id: str,
) -> dict[str, Any]:
    rows = client.query(
        GET_DIAGNOSTIC_TARGET_POST,
        parameters={"user_id": user_id, "ig_media_id": ig_media_id},
    ).result_rows
    if not rows:
        raise EntityNotFoundError("Post")
    (
        post_id, media_type, permalink, thumbnail_url, caption, ts,
        reach, likes, saves, shares, comments, interactions, avg_watch_time,
    ) = rows[0]
    return {
        "ig_media_id": post_id,
        "media_type": media_type,
        "permalink": permalink,
        "thumbnail_url": thumbnail_url,
        "caption": caption or "",
        "timestamp": ts,
        "reach": int(reach or 0),
        "likes": int(likes or 0),
        "saves": int(saves or 0),
        "shares": int(shares or 0),
        "comments": int(comments or 0),
        "interactions": int(interactions or 0),
        "avg_watch_time": float(avg_watch_time or 0),
    }


def _enforce_eligibility(post: dict[str, Any]) -> None:
    """Raise MediaNotEligibleError when the post is too recent."""
    ts = post.get("timestamp")
    if ts is None:
        return
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0
    if age_hours < MIN_AGE_HOURS:
        raise MediaNotEligibleError(
            f"This post is {age_hours:.1f}h old; "
            f"diagnostics need ≥{MIN_AGE_HOURS}h of insights data."
        )


def _query_one(client: Client, query: str, params: dict) -> dict[str, Any]:
    res = client.query(query, parameters=params)
    if not res.result_rows:
        return {}
    return dict(zip(res.column_names, res.result_rows[0]))


def _load_context(
    client: Client,
    *,
    user_id: str,
    ig_user_id: str,
    post: dict[str, Any],
) -> dict[str, Any]:
    """Compose the per-post context block. Numbers are computed in SQL
    and only forwarded to the LLM — the LLM never invents them."""
    ig_media_id = post["ig_media_id"]

    baseline = _query_one(
        client, GET_DIAGNOSTIC_BASELINE,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "target_ig_media_id": ig_media_id},
    )
    format_baseline = _query_one(
        client, GET_DIAGNOSTIC_FORMAT_BASELINE,
        {"user_id": user_id, "ig_user_id": ig_user_id,
         "media_type": post["media_type"],
         "target_ig_media_id": ig_media_id},
    )

    hours = client.query(
        GET_DIAGNOSTIC_HOUR_DISTRIBUTION,
        parameters={
            "user_id": user_id, "ig_user_id": ig_user_id,
            "target_ig_media_id": ig_media_id,
        },
    ).result_rows
    hour_dist = [
        {
            "hour": int(h),
            "posts": int(p),
            "avg_er_pct": round(float(er or 0), 2),
            "avg_reach": round(float(ar or 0)),
        }
        for h, p, er, ar in hours
    ]
    hour_dist.sort(key=lambda d: -d["avg_er_pct"])
    peak_hours = hour_dist[:3]  # top-3 best hours

    post_tags = client.query(
        GET_DIAGNOSTIC_POST_HASHTAGS,
        parameters={"user_id": user_id, "ig_media_id": ig_media_id},
    ).result_rows
    hashtags = [
        {"tag": tag, "user_other_uses": int(uses)}
        for tag, uses in post_tags
    ]

    sentiment = _query_one(
        client, GET_DIAGNOSTIC_SENTIMENT_SUMMARY,
        {"user_id": user_id, "ig_media_id": ig_media_id},
    )
    sentiment_summary = None
    total = int(sentiment.get("total") or 0)
    if total > 0:
        sentiment_summary = {
            "positive": int(sentiment.get("positive") or 0),
            "neutral": int(sentiment.get("neutral") or 0),
            "negative": int(sentiment.get("negative") or 0),
            "questions": int(sentiment.get("questions") or 0),
            "total": total,
        }

    posted_hour = post["timestamp"].hour if post.get("timestamp") else None
    ts_iso = post["timestamp"].isoformat() if post.get("timestamp") else None

    return {
        "post": {
            "ig_media_id": post["ig_media_id"],
            "media_type": post["media_type"],
            "caption": truncate_caption(redact_pii(post.get("caption", "")), 500),
            "timestamp": ts_iso,
            "posted_hour": posted_hour,
            "observed": {
                "reach": post["reach"],
                "likes": post["likes"],
                "saves": post["saves"],
                "shares": post["shares"],
                "comments": post["comments"],
                "interactions": post["interactions"],
                "engagement_rate_pct": _safe_pct(post["interactions"], post["reach"]),
                "save_rate_pct": _safe_pct(post["saves"], post["reach"]),
                "share_rate_pct": _safe_pct(post["shares"], post["reach"]),
                "avg_watch_time_s": round(post["avg_watch_time"], 2),
            },
        },
        "baseline_60_posts": _baseline_dict(baseline),
        "format_baseline_60_posts": _baseline_dict(format_baseline),
        "peak_hours_top3": peak_hours,
        "hashtags": hashtags,
        "comment_sentiment": sentiment_summary,
    }


def _baseline_dict(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "median_reach": round(float(d.get("median_reach") or 0)),
        "median_engagement_rate_pct": round(float(d.get("median_er_pct") or 0), 2),
        "median_save_rate_pct": round(float(d.get("median_save_rate_pct") or 0), 2),
        "median_share_rate_pct": round(float(d.get("median_share_rate_pct") or 0), 2),
        "sample_size": int(d.get("sample_size") or 0),
    }


def _safe_pct(num: int, denom: int) -> float:
    if not denom:
        return 0.0
    return round(num / denom * 100, 2)


# --- Synthesis ----------------------------------------------------------

def build_diagnostic_prompt(ctx: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    user_block = render_diagnostic_user_block(ctx)
    system = [{"type": "text", "text": DIAGNOSTIC_SYSTEM}]
    messages = [
        {"role": "user", "content": (
            "Diagnose the supplied post. Use the structured output "
            "schema. Cite real numbers only.\n\nDATA:\n" + user_block
        )},
    ]
    return system, messages


async def synthesize(
    client: Client,
    *,
    user_id: str,
    ig_media_id: str,
) -> DiagnosticResponse:
    """Eligibility-check, load context, call LLM, merge in server-side
    baseline/observed, persist, charge quota."""
    profile = instagram_repo.find_profile(client, user_id)
    if profile is None:
        raise InstagramNotConnectedError()

    post = _load_target_post(client, user_id=user_id, ig_media_id=ig_media_id)
    _enforce_eligibility(post)

    ctx = _load_context(
        client, user_id=user_id, ig_user_id=profile.ig_user_id, post=post,
    )

    if (ctx["baseline_60_posts"]["sample_size"] or 0) < MIN_BASELINE_POSTS:
        # Not enough history for a meaningful comparison. Return a
        # synthesized "not_eligible"-style response without charging
        # quota — the frontend's not-eligible empty state will render.
        raise MediaNotEligibleError(
            "Not enough posting history to compare against this post."
        )

    system, messages = build_diagnostic_prompt(ctx)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_DIAGNOSTIC,
        system=system,
        messages=messages,
        effort=DIAGNOSTIC_EFFORT,
        max_tokens=DIAGNOSTIC_MAX_TOKENS,
        stream=False,
        output_format={"type": "json_schema", "schema": DIAGNOSTIC_OUTPUT_SCHEMA},
    )
    parsed = parse_diagnostic_output(result.text)

    # Soft citation guard — scan verdict + recommendations for numeric
    # claims that don't appear in the input context. Logs only for now
    # so we can tune the tolerance before hard-failing in production.
    _citation_guard_soft(parsed, ctx)

    # Server-authoritative baseline + observed. The LLM cannot fabricate
    # these — we set them from ClickHouse.
    baseline = BaselineMetrics(
        avg_reach=ctx["baseline_60_posts"]["median_reach"],
        avg_engagement_rate_pct=ctx["baseline_60_posts"]["median_engagement_rate_pct"],
        avg_save_rate_pct=ctx["baseline_60_posts"]["median_save_rate_pct"],
    )
    observed = BaselineMetrics(
        avg_reach=ctx["post"]["observed"]["reach"],
        avg_engagement_rate_pct=ctx["post"]["observed"]["engagement_rate_pct"],
        avg_save_rate_pct=ctx["post"]["observed"]["save_rate_pct"],
    )

    # Cross-check the LLM's underperformed flag against the math —
    # reduces the chance of an obviously-wrong "you crushed it" verdict
    # on a post that clearly tanked.
    underperformed = parsed["underperformed"]
    if not underperformed:
        # If reach OR ER is materially below baseline, override.
        if (
            baseline.avg_reach > 0
            and observed.avg_reach < baseline.avg_reach * 0.85
        ):
            underperformed = True
        elif (
            baseline.avg_engagement_rate_pct > 0
            and observed.avg_engagement_rate_pct
                 < baseline.avg_engagement_rate_pct * 0.85
        ):
            underperformed = True

    response = DiagnosticResponse(
        ig_media_id=ig_media_id,
        baseline=baseline,
        observed=observed,
        underperformed=underperformed,
        verdict_md=parsed["verdict_md"],
        factors=parsed["factors"],
        recommendations_md=parsed["recommendations_md"],
    )

    persist(
        client,
        user_id=user_id, response=response,
        model=result.model, prompt_hash=_prompt_hash(system, messages),
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        latency_ms=result.latency_ms,
    )
    quota_service.record_call(
        client, user_id=user_id, feature="diagnostic", result=result,
    )
    return response


# --- Parsing ------------------------------------------------------------

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def parse_diagnostic_output(text: str) -> dict[str, Any]:
    """Pull the structured diagnostic out of the model response.

    The Anthropic JSON-schema enforcement (`output_config.format`) should
    have already validated the shape — this parser handles the rare
    case where the model emits stray prose around its JSON anyway.
    """
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        # ASCII-escape for cp1252-safe stderr on Windows.
        logger.warning(
            "diagnostic.parse.no_json raw=%s",
            json.dumps({"text": text[:2000], "len": len(text)},
                       ensure_ascii=True, default=str),
        )
        raise AIProviderError(
            "Diagnostic: no JSON object in model output",
            code="upstream_error",
        )
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        logger.warning(
            "diagnostic.parse.json_decode raw=%s",
            json.dumps({"matched": match.group(0)[:2000], "err": str(exc)},
                       ensure_ascii=True, default=str),
        )
        raise AIProviderError(
            f"Diagnostic: JSON parse failed: {exc}",
            code="upstream_error",
        ) from exc

    verdict_md = str(payload.get("verdict_md") or "").strip()
    if not verdict_md:
        raise AIProviderError("Diagnostic: empty verdict", code="upstream_error")

    factors_raw = payload.get("factors") or []
    factors: list[DiagnosticFactor] = []
    for f in factors_raw:
        try:
            # Ollama Cloud's structured output sometimes drifts on field
            # names — accept `name` as a synonym for `key`.
            key = f.get("key") or f.get("name")
            severity = f.get("severity")
            if key not in _FACTOR_KEYS or severity not in _SEVERITY_VALUES:
                continue

            # `evidence` per schema is an object {metric, value, comparison},
            # but the model often emits a free-form string instead. Coerce
            # either shape into FactorEvidence.
            ev_raw = f.get("evidence")
            if isinstance(ev_raw, dict):
                ev_metric = str(ev_raw.get("metric") or "")[:120]
                try:
                    ev_value = float(ev_raw.get("value") or 0)
                except (TypeError, ValueError):
                    ev_value = 0.0
                ev_comparison = str(ev_raw.get("comparison") or "")[:200]
            else:
                ev_metric = ""
                ev_value = 0.0
                ev_comparison = str(ev_raw or "")[:200]

            # `headline` is required by the schema but often missing when
            # the model fuses it into `evidence`. Fall back to the first
            # sentence of the evidence/detail so the UI has something
            # readable per factor.
            headline = f.get("headline")
            if not headline:
                source = ev_comparison or str(f.get("detail_md") or "")
                headline = source.split(". ", 1)[0] if source else key.title()

            factors.append(DiagnosticFactor(
                key=key,
                severity=severity,
                headline=str(headline)[:200],
                detail_md=str(f.get("detail_md") or ""),
                evidence=FactorEvidence(
                    metric=ev_metric,
                    value=ev_value,
                    comparison=ev_comparison,
                ),
            ))
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("diagnostic.parse.factor_skipped: %s", exc)

    if not factors:
        # The verdict + recommendations are still valuable on their own —
        # don't 502. Log the raw output so we can see which factor keys
        # the model is emitting outside the enum. ASCII-escape the
        # payload because Windows stderr defaults to cp1252 and model
        # output often contains chars like U+202F that would crash the
        # log handler.
        logger.warning(
            "diagnostic.parse.no_usable_factors raw=%s",
            json.dumps({"factors_raw": factors_raw, "text": text[:1500]},
                       ensure_ascii=True, default=str),
        )

    # Order by severity high → low, model order otherwise.
    severity_order = {"high": 0, "medium": 1, "low": 2, "neutral": 3}
    factors.sort(key=lambda f: severity_order.get(f.severity, 4))

    return {
        "underperformed": bool(payload.get("underperformed", False)),
        "verdict_md": verdict_md,
        "factors": factors,
        "recommendations_md": str(payload.get("recommendations_md") or "").strip(),
    }


def _prompt_hash(system: list[dict], messages: list[dict]) -> str:
    import hashlib
    h = hashlib.sha256()
    h.update(json.dumps(system, sort_keys=True).encode("utf-8"))
    h.update(b"\n--\n")
    h.update(json.dumps(messages, sort_keys=True).encode("utf-8"))
    return h.hexdigest()


# --- Citation guard ---------------------------------------------------
#
# Mirror of digest.citation_guard: scan numeric claims in the LLM's
# verdict_md and recommendations_md and verify each is within ±5% of a
# value that appears in the input context. Soft-fail (log only) so we
# can tune the tolerance with production telemetry before hard-failing.

# Tolerance band — keep in sync with digest.CITATION_TOLERANCE_PCT.
CITATION_TOLERANCE_PCT = 5.0

_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_MULTIPLIER_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[x×]")


def _citation_guard_soft(parsed: dict[str, Any], ctx: dict[str, Any]) -> None:
    """Best-effort hallucination check. Logs only — never raises."""
    candidates = _gather_citable_numbers(ctx)
    if not candidates:
        return
    for source_field in ("verdict_md", "recommendations_md"):
        text = parsed.get(source_field) or ""
        if not text:
            continue
        for match in _PCT_RE.finditer(text):
            val = float(match.group(1))
            if not _matches_any(val, candidates):
                logger.warning(
                    "diagnostic.citation_guard.suspect_pct field=%s val=%.2f excerpt=%r",
                    source_field, val,
                    text[max(0, match.start() - 30):match.end() + 30],
                )
        for match in _MULTIPLIER_RE.finditer(text):
            val = float(match.group(1))
            if not _matches_any(val, candidates, allow_ratio=True):
                logger.warning(
                    "diagnostic.citation_guard.suspect_multiplier field=%s val=%.2f",
                    source_field, val,
                )


def _gather_citable_numbers(ctx: dict[str, Any]) -> list[float]:
    """Flatten every number in the input context the LLM might cite."""
    out: list[float] = []
    post = ctx.get("post") or {}
    observed = post.get("observed") or {}
    for k in ("reach", "likes", "saves", "shares", "interactions",
              "engagement_rate_pct", "save_rate_pct", "share_rate_pct"):
        v = observed.get(k)
        if v:
            out.append(abs(float(v)))
    baseline = ctx.get("baseline_60_posts") or {}
    for k in ("median_reach", "median_engagement_rate_pct",
              "median_save_rate_pct", "median_share_rate_pct"):
        v = baseline.get(k)
        if v:
            out.append(abs(float(v)))
    fmt_baseline = ctx.get("format_baseline_60_posts") or {}
    for v in fmt_baseline.values():
        if isinstance(v, (int, float)) and v:
            out.append(abs(float(v)))
    # Pre-compute observed-vs-baseline percent deltas — these are the
    # values the LLM most often cites ("reach 53% below median").
    for k in ("reach", "engagement_rate_pct", "save_rate_pct"):
        obs = observed.get(k) or 0
        base_key = "median_" + ("reach" if k == "reach" else k.replace("_pct", "") + "_pct")
        base = baseline.get(base_key) or 0
        if base:
            out.append(abs(round((obs - base) / base * 100, 2)))
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
            for c2 in candidates:
                if c2 > 0 and abs(c / c2 - val) <= tol * max(val, 1):
                    return True
    return False


__all__ = [
    "find_cached",
    "synthesize",
    "parse_diagnostic_output",
]
