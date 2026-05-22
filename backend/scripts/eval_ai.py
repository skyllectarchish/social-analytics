"""Tier 4 — AI Copilot eval harness.

Per-feature evaluators take a fixed context dict (the case `inputs`),
build the same prompt the production code uses, call the live
Anthropic API, parse the response, and diff *structured* fields
against the case's `golden`. Markdown bodies are NOT diffed — they
are inherently non-deterministic.

Cases live in `scripts/ai_evals/<feature>/*.json`:

    {
      "name": "morning-routine-creator",
      "inputs": { ... per-feature context dict ... },
      "golden": { ... structured assertions ... }
    }

Run from `backend/`:

    python -m scripts.eval_ai --feature digest
    python -m scripts.eval_ai --feature all

If ANTHROPIC_API_KEY is unset the harness skips with status 0 — keeps
CI green without spending API credits on every run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from typing import Awaitable, Callable

logger = logging.getLogger("eval_ai")
logging.basicConfig(level=logging.INFO, format="%(message)s")

_REPO_ROOT = Path(__file__).resolve().parent.parent
_CASES_DIR = _REPO_ROOT / "scripts" / "ai_evals"

_FEATURES = ("digest", "ideas", "diagnostic", "caption")


def _load_cases(feature: str) -> list[dict]:
    folder = _CASES_DIR / feature
    if not folder.exists():
        return []
    return [
        json.loads(f.read_text(encoding="utf-8"))
        for f in sorted(folder.glob("*.json"))
    ]


# --- Generic diff helpers -----------------------------------------------

def _expect_eq(label: str, actual, expected) -> list[str]:
    return [] if actual == expected else [f"{label}: expected {expected!r}, got {actual!r}"]


def _expect_in_set(label: str, actual, allowed: set) -> list[str]:
    return [] if actual in allowed else [f"{label}: {actual!r} not in {sorted(allowed)!r}"]


def _expect_subset(label: str, actual_iter, expected_set: set) -> list[str]:
    extra = set(actual_iter) - expected_set
    return [] if not extra else [f"{label}: unexpected values {sorted(extra)!r}"]


# --- Per-feature evaluators ---------------------------------------------
#
# Each builds the prompt directly from the case inputs, calls the LLM,
# parses the response, and returns a list of failure strings. Empty list
# means pass.

async def _eval_digest(inputs: dict, golden: dict) -> list[str]:
    from app.ai import client as ai_client
    from app.ai.digest import build_digest_prompt, parse_digest_output

    system, messages = build_digest_prompt(inputs)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_DIGEST,
        system=system,
        messages=messages,
        effort="medium",  # cheaper than the production "high" — eval-only
        max_tokens=4096,
        stream=False,
    )
    parsed = parse_digest_output(result.text, inputs)

    issues: list[str] = []
    if "bullets_count" in golden:
        issues += _expect_eq("bullets_count", len(parsed["bullets"]), golden["bullets_count"])
    if "kinds_subset_of" in golden:
        issues += _expect_subset("bullet kinds",
                                  [b.kind for b in parsed["bullets"]],
                                  set(golden["kinds_subset_of"]))
    if "min_followups" in golden:
        if len(parsed["followups"]) < golden["min_followups"]:
            issues.append(f"followups: expected >= {golden['min_followups']}, "
                          f"got {len(parsed['followups'])}")
    if "narrative_min_chars" in golden:
        if len(parsed["narrative_md"]) < golden["narrative_min_chars"]:
            issues.append(f"narrative too short: "
                          f"{len(parsed['narrative_md'])} < {golden['narrative_min_chars']}")
    return issues


async def _eval_ideas(inputs: dict, golden: dict) -> list[str]:
    from app.ai import client as ai_client
    from app.ai.ideas import build_ideas_prompt, parse_ideas_output

    system, messages = build_ideas_prompt(inputs)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_IDEAS,
        system=system,
        messages=messages,
        effort="medium",
        max_tokens=2048,
        stream=False,
    )
    parsed = parse_ideas_output(result.text)

    issues: list[str] = []
    if "min_ideas" in golden:
        if len(parsed["ideas"]) < golden["min_ideas"]:
            issues.append(f"ideas: expected >= {golden['min_ideas']}, "
                          f"got {len(parsed['ideas'])}")
    if "max_ideas" in golden:
        if len(parsed["ideas"]) > golden["max_ideas"]:
            issues.append(f"ideas: expected <= {golden['max_ideas']}, "
                          f"got {len(parsed['ideas'])}")
    if "format_subset_of" in golden:
        issues += _expect_subset(
            "suggested_format",
            [i.suggested_format for i in parsed["ideas"]],
            set(golden["format_subset_of"]),
        )
    if "min_themes" in golden:
        if len(parsed["themes_detected"]) < golden["min_themes"]:
            issues.append(
                f"themes_detected: expected >= {golden['min_themes']}, "
                f"got {len(parsed['themes_detected'])}",
            )
    return issues


async def _eval_diagnostic(inputs: dict, golden: dict) -> list[str]:
    from app.ai import client as ai_client
    from app.ai.diagnostic import build_diagnostic_prompt, parse_diagnostic_output
    from app.ai.prompts import DIAGNOSTIC_OUTPUT_SCHEMA

    system, messages = build_diagnostic_prompt(inputs)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_DIAGNOSTIC,
        system=system,
        messages=messages,
        effort="medium",
        max_tokens=2048,
        stream=False,
        output_format={"type": "json_schema", "schema": DIAGNOSTIC_OUTPUT_SCHEMA},
    )
    parsed = parse_diagnostic_output(result.text)

    issues: list[str] = []
    if "min_factors" in golden:
        if len(parsed["factors"]) < golden["min_factors"]:
            issues.append(
                f"factors: expected >= {golden['min_factors']}, "
                f"got {len(parsed['factors'])}",
            )
    if "max_factors" in golden:
        if len(parsed["factors"]) > golden["max_factors"]:
            issues.append(
                f"factors: expected <= {golden['max_factors']}, "
                f"got {len(parsed['factors'])}",
            )
    if "underperformed" in golden:
        issues += _expect_eq("underperformed", parsed["underperformed"],
                              golden["underperformed"])
    if "expected_factor_keys" in golden:
        actual_keys = {f.key for f in parsed["factors"]}
        missing = set(golden["expected_factor_keys"]) - actual_keys
        if missing:
            issues.append(f"factor keys missing: {sorted(missing)!r}")
    return issues


async def _eval_caption(inputs: dict, golden: dict) -> list[str]:
    """Case inputs shape:
       { "draft": str, "format": str, "topic_hint": str|None,
         "top_captions": [...], "draft_length_chars": int }
    """
    from app.ai import client as ai_client
    from app.ai.caption import (
        build_caption_prompt,
        compute_length_fit,
        parse_caption_output,
    )
    from app.ai.prompts import CAPTION_OUTPUT_SCHEMA

    ctx = {
        "format": inputs["format"],
        "draft": inputs["draft"],
        "draft_length_chars": len(inputs["draft"]),
        "topic_hint": inputs.get("topic_hint") or "",
        "instagram_caption_limit_chars": 2200,
        "top_captions": inputs.get("top_captions") or [],
    }
    system, messages = build_caption_prompt(ctx)
    result = await ai_client.synthesize(
        model=ai_client.MODEL_FOR_CAPTION,
        system=system,
        messages=messages,
        effort="medium",
        max_tokens=2048,
        stream=False,
        output_format={"type": "json_schema", "schema": CAPTION_OUTPUT_SCHEMA},
    )
    parsed = parse_caption_output(result.text)

    issues: list[str] = []
    if "variant_count" in golden:
        issues += _expect_eq("variant_count", len(parsed["variants"]),
                              golden["variant_count"])
    if "label_subset_of" in golden:
        issues += _expect_subset(
            "variant labels",
            [v["label"] for v in parsed["variants"]],
            set(golden["label_subset_of"]),
        )
    if "max_caption_chars" in golden:
        too_long = [v for v in parsed["variants"]
                    if len(v["caption"]) > golden["max_caption_chars"]]
        if too_long:
            issues.append(
                f"variants over {golden['max_caption_chars']} chars: {len(too_long)}",
            )
    # Spot-check the server-side length_fit math against the case's
    # historical lengths.
    if "expect_length_fit_at_least" in golden:
        top_lengths = [t.get("length_chars") or len(t.get("caption", ""))
                       for t in ctx["top_captions"]]
        fit = compute_length_fit(len(inputs["draft"]), top_lengths)
        if fit < golden["expect_length_fit_at_least"]:
            issues.append(f"length_fit too low: {fit} < {golden['expect_length_fit_at_least']}")
    return issues


_EVALUATORS: dict[str, Callable[[dict, dict], Awaitable[list[str]]]] = {
    "digest": _eval_digest,
    "ideas": _eval_ideas,
    "diagnostic": _eval_diagnostic,
    "caption": _eval_caption,
}


async def _run_feature(feature: str) -> int:
    cases = _load_cases(feature)
    if not cases:
        logger.info("[%s] no cases registered - skipping", feature)
        return 0
    fn = _EVALUATORS[feature]
    failures = 0
    for case in cases:
        name = case.get("name") or "<unnamed>"
        try:
            issues = await fn(case.get("inputs", {}), case.get("golden", {}))
        except NotImplementedError as exc:
            logger.warning("[%s] %s - SKIP (%s)", feature, name, exc)
            continue
        except Exception as exc:  # noqa: BLE001
            logger.error("[%s] %s - EVALUATOR ERROR: %r", feature, name, exc)
            failures += 1
            continue
        if not issues:
            logger.info("[%s] %s - pass", feature, name)
        else:
            failures += 1
            logger.error("[%s] %s - FAIL", feature, name)
            for issue in issues:
                logger.error("    %s", issue)
    return failures


async def _amain(feature_filter: str) -> int:
    features = _FEATURES if feature_filter == "all" else (feature_filter,)
    total = 0
    for feat in features:
        total += await _run_feature(feat)
    return total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run AI feature evals")
    parser.add_argument(
        "--feature",
        choices=("all", *_FEATURES),
        default="all",
    )
    args = parser.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.info("ANTHROPIC_API_KEY not set - eval harness exiting 0 "
                    "(set the key to actually run evals against the live API)")
        return 0

    total_failures = asyncio.run(_amain(args.feature))
    if total_failures:
        logger.error("Eval suite: %d failure(s)", total_failures)
        return 1
    logger.info("Eval suite: all pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
