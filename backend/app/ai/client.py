"""Ollama Cloud client for Tier 4 AI Copilot.

Owns the singleton AsyncClient, the `synthesize()` helper every
per-feature service routes through, the model + pricing tables, and a
small circuit breaker that protects the app when Ollama is having a
bad day.

The public interface of `synthesize(model=, system=, messages=, ...)`
is preserved from the prior Anthropic implementation so the per-feature
service modules (digest.py, ideas.py, diagnostic.py, caption.py) need
no changes. Anthropic-specific kwargs that have no Ollama equivalent
are accepted and ignored.

Translation summary:
    Anthropic                            → Ollama
    ----------------------------------------------------------------
    AsyncAnthropic()                     → AsyncClient(host, headers)
    messages.create(...)                 → chat(model, messages, ...)
    system=[{"type":"text","text":...}]  → system="…" string
    thinking={"type": "adaptive"}        → IGNORED (Anthropic-only)
    output_config={"effort": "medium"}   → IGNORED
    output_config={"format": {"type":    → format=<schema_dict>
        "json_schema", "schema": {...}}}    (Ollama JSON-schema-enforced output)
    max_tokens=N                         → options={"num_predict": N}
    cache_control: {"type": "ephemeral"} → IGNORED (no Ollama equiv)
    response.usage.input_tokens          → response.prompt_eval_count
    response.usage.output_tokens         → response.eval_count
    stream → messages.stream(...)        → chat(..., stream=True) iterator
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from ..config import settings
from ..exceptions import (
    AICircuitOpenError,
    AINotConfiguredError,
    AIProviderError,
)

logger = logging.getLogger(__name__)


# --- Model registry ------------------------------------------------------
#
# All four features use the same model by default — `OLLAMA_MODEL` from
# settings (default `gpt-oss:120b`). Per-feature overrides are deliberately
# absent for now; reintroduce them by adding more settings fields if you
# want to split model tiers later.

def _model_for_feature() -> str:
    return settings.ollama_model or "gpt-oss:120b"


# Backwards-compat aliases — the per-feature services import these names.
# All four resolve to the same value via the property-style lookup, so a
# change to OLLAMA_MODEL takes effect immediately on the next call.
MODEL_FOR_DIGEST: str = ""      # set on first use
MODEL_FOR_DIAGNOSTIC: str = ""
MODEL_FOR_IDEAS: str = ""
MODEL_FOR_CAPTION: str = ""
MODEL_FOR_COMMENT_REPLY: str = ""
MODEL_FOR_CONTENT_FACTORY: str = ""


def _refresh_model_aliases() -> None:
    global MODEL_FOR_DIGEST, MODEL_FOR_DIAGNOSTIC, MODEL_FOR_IDEAS, \
        MODEL_FOR_CAPTION, MODEL_FOR_COMMENT_REPLY, MODEL_FOR_CONTENT_FACTORY
    m = _model_for_feature()
    MODEL_FOR_DIGEST = m
    MODEL_FOR_DIAGNOSTIC = m
    MODEL_FOR_IDEAS = m
    MODEL_FOR_CAPTION = m
    MODEL_FOR_COMMENT_REPLY = m
    MODEL_FOR_CONTENT_FACTORY = m


_refresh_model_aliases()


# --- Pricing (USD per 1M tokens) -----------------------------------------
#
# Ollama Cloud is in preview at the time of writing and published pricing
# is sparse / changing. We persist token counts accurately (input + output)
# but compute cost_usd_micros = 0 until rates are confirmed. Update the
# table below when you have authoritative numbers and historic rows will
# remain at 0 (we do not backfill).

_PRICING: dict[str, dict[str, float]] = {
    # "gpt-oss:120b": {"input": 0.00, "output": 0.00},  # TODO: published rates
    # "gpt-oss:20b":  {"input": 0.00, "output": 0.00},
}


def cost_usd_micros(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,    # kept for signature stability — always 0
    cache_write_tokens: int = 0,
) -> int:
    """Cost of one call in integer micro-dollars. Returns 0 until the
    pricing table is populated. Token counts are still recorded
    accurately in the ai_quota_usage row."""
    p = _PRICING.get(model)
    if not p:
        return 0
    usd = (
        (input_tokens / 1_000_000) * p["input"]
        + (output_tokens / 1_000_000) * p["output"]
    )
    return int(round(usd * 1_000_000))


# --- Singleton -----------------------------------------------------------

_client: Any = None  # AsyncClient when available


def get_ai_client() -> Any:
    """Return the lazily-initialised Ollama AsyncClient.

    Raises:
        AINotConfiguredError: when OLLAMA_API_KEY is unset or the
        `ollama` package isn't installed.
    """
    global _client
    if _client is not None:
        return _client
    if not settings.ollama_api_key:
        raise AINotConfiguredError()
    try:
        from ollama import AsyncClient  # type: ignore
    except ImportError as exc:
        raise AINotConfiguredError() from exc
    _client = AsyncClient(
        host=settings.ollama_host or "https://ollama.com",
        headers={"Authorization": f"Bearer {settings.ollama_api_key}"},
        timeout=settings.ai_request_timeout_s,
    )
    # Cache the model alias snapshot too in case settings were reloaded.
    _refresh_model_aliases()
    return _client


def reset_ai_client() -> None:
    """Drop the cached client (for tests / config reloads)."""
    global _client
    _client = None
    _refresh_model_aliases()


# --- Circuit breaker -----------------------------------------------------
#
# Unchanged from the Anthropic implementation — feature-agnostic.

@dataclass
class _BreakerState:
    failures: list[float]
    opened_at: float | None = None


_breaker = _BreakerState(failures=[])
_breaker_lock = asyncio.Lock()


async def _record_failure() -> None:
    async with _breaker_lock:
        now = time.time()
        window = settings.ai_circuit_breaker_window_s
        _breaker.failures = [f for f in _breaker.failures if now - f <= window]
        _breaker.failures.append(now)
        if len(_breaker.failures) >= settings.ai_circuit_breaker_threshold:
            _breaker.opened_at = now
            logger.warning(
                "ai_circuit_breaker.tripped failures=%d window_s=%d cooldown_s=%d",
                len(_breaker.failures), window,
                settings.ai_circuit_breaker_cooldown_s,
            )


async def _check_breaker() -> None:
    async with _breaker_lock:
        if _breaker.opened_at is None:
            return
        if time.time() - _breaker.opened_at >= settings.ai_circuit_breaker_cooldown_s:
            _breaker.opened_at = None
            _breaker.failures.clear()
            logger.info("ai_circuit_breaker.reset")
            return
        raise AICircuitOpenError()


async def _record_success() -> None:
    async with _breaker_lock:
        if _breaker.opened_at is None and _breaker.failures:
            _breaker.failures.clear()


# --- synthesize() --------------------------------------------------------

@dataclass
class SynthResult:
    text: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int   # Always 0 on Ollama; kept for schema parity.
    cache_write_tokens: int  # Always 0.
    latency_ms: int
    stop_reason: str | None
    model: str


def _flatten_system(system: Any) -> str:
    """Anthropic accepts `system` as a list of `{"type":"text","text":...}`
    blocks. Ollama wants a single string. Concatenate text blocks; ignore
    any cache_control metadata (Anthropic-only)."""
    if system is None:
        return ""
    if isinstance(system, str):
        return system
    if isinstance(system, list):
        parts: list[str] = []
        for block in system:
            if isinstance(block, dict):
                if block.get("type") == "text" and "text" in block:
                    parts.append(block["text"])
                elif "text" in block:
                    parts.append(block["text"])
            elif isinstance(block, str):
                parts.append(block)
        return "\n\n".join(parts)
    return str(system)


def _to_ollama_format(output_format: dict | None) -> Any:
    """Translate Anthropic-style `output_config.format` into Ollama's
    `format` parameter.

    Ollama (since v0.5) accepts either the literal string `"json"` for
    free-form JSON, or a dict that IS the JSON schema for strict
    structured output. We always pass the schema dict when we have one
    so the model is constrained to the exact shape we want.

    Returns the empty string `""` (Ollama's default — no format constraint)
    when no schema is supplied; the SDK rejects `None`."""
    if not output_format:
        return ""
    if output_format.get("type") == "json_schema":
        return output_format.get("schema") or ""
    return output_format


async def synthesize(
    *,
    model: str,
    system: list[dict] | str | None,
    messages: list[dict],
    effort: str = "medium",       # Anthropic-only; ignored.
    max_tokens: int = 8192,
    stream: bool = False,
    output_format: dict | None = None,
) -> SynthResult:
    """Single-shot synthesis against Ollama Cloud.

    Returns text + token usage + latency. Per-feature services build the
    prompt and call this; the result is the source of truth for
    `quota.charge()`. Ollama-side prompt caching does not exist, so
    cache_read_tokens / cache_write_tokens are always 0.
    """
    client = get_ai_client()
    await _check_breaker()

    system_text = _flatten_system(system)
    ollama_messages: list[dict] = []
    if system_text:
        ollama_messages.append({"role": "system", "content": system_text})
    for m in messages:
        # Ollama wants `content` as a string. Our callers all pass it
        # that way; defensively coerce if a list of blocks ever slips in.
        content = m.get("content")
        if isinstance(content, list):
            content = "\n".join(
                b.get("text", "") if isinstance(b, dict) else str(b)
                for b in content
            )
        ollama_messages.append({
            "role": m.get("role", "user"),
            "content": content or "",
        })

    ollama_format = _to_ollama_format(output_format)
    options = {"num_predict": max_tokens}

    t0 = time.perf_counter()
    text_chunks: list[str] = []
    final: dict[str, Any] | None = None

    try:
        if stream:
            async for chunk in await client.chat(
                model=model,
                messages=ollama_messages,
                format=ollama_format,
                options=options,
                stream=True,
            ):
                # Each chunk is a dict-like with `message.content` deltas
                # until `done=True` carries the final usage payload.
                msg = _get(chunk, "message")
                if msg is not None:
                    delta = _get(msg, "content") or ""
                    if delta:
                        text_chunks.append(delta)
                if _get(chunk, "done"):
                    final = chunk
        else:
            final = await client.chat(
                model=model,
                messages=ollama_messages,
                format=ollama_format,
                options=options,
                stream=False,
            )
            msg = _get(final, "message")
            text_chunks.append(_get(msg, "content") or "" if msg is not None else "")
    except Exception as exc:  # noqa: BLE001
        code, status = _classify_exception(exc)
        if status >= 500 or status in (408, 504, 0):
            await _record_failure()
        logger.warning(
            "ai.synthesize.error model=%s code=%s exc=%r", model, code, exc
        )
        raise AIProviderError(
            message=str(exc) or "AI provider request failed", code=code,
        ) from exc

    latency_ms = int((time.perf_counter() - t0) * 1000)
    await _record_success()

    input_tokens = int(_get(final, "prompt_eval_count") or 0) if final else 0
    output_tokens = int(_get(final, "eval_count") or 0) if final else 0
    stop_reason = (_get(final, "done_reason") or None) if final else None

    return SynthResult(
        text="".join(text_chunks),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=0,
        cache_write_tokens=0,
        latency_ms=latency_ms,
        stop_reason=stop_reason,
        model=model,
    )


def _get(obj: Any, key: str) -> Any:
    """The Ollama SDK returns Pydantic-style objects for non-stream calls
    and dict-like records for streams. Read either."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _classify_exception(exc: BaseException) -> tuple[str, int]:
    """Map an Ollama / network exception to (code, http_status).

    The Ollama SDK exposes `ollama.ResponseError` with a `.status_code`
    attribute. Other exceptions (timeouts, network) bubble up from the
    underlying httpx client.
    """
    try:
        import ollama  # type: ignore
    except ImportError:
        return ("network", 0)

    if isinstance(exc, ollama.ResponseError):
        status = getattr(exc, "status_code", 0) or 0
        if status == 401 or status == 403:
            return ("forbidden", status)
        if status == 429:
            return ("upstream_rate_limited", 429)
        if status >= 500:
            return ("upstream_error", status)
        return ("upstream_error", status or 502)

    # httpx-style network / timeout
    name = type(exc).__name__
    if "Timeout" in name:
        return ("upstream_timeout", 504)
    if "Connect" in name or "Network" in name:
        return ("network", 0)
    return ("unknown", 0)


__all__ = [
    "MODEL_FOR_DIGEST",
    "MODEL_FOR_DIAGNOSTIC",
    "MODEL_FOR_IDEAS",
    "MODEL_FOR_CAPTION",
    "SynthResult",
    "synthesize",
    "cost_usd_micros",
    "get_ai_client",
    "reset_ai_client",
]
