"""Prompt templates for Tier 4 AI Copilot.

Two responsibilities:

1. Provide the **static system blocks** used by each feature. These are
   frozen across all users — they sit at the front of the prefix so
   Anthropic's prompt cache reuses them across calls.

2. Render the **per-call user context** as deterministic
   (sorted-key, no-whitespace) JSON, so the byte sequence is stable
   across calls with the same input data → high cache reuse.

Anti-patterns that will silently invalidate the cache:
  - `datetime.now()` anywhere in the cached prefix
  - `json.dumps(...)` without `sort_keys=True`
  - String formatting that varies by Python random hash seed
  - PII redaction that drops characters non-deterministically

See `shared/prompt-caching.md` from the `claude-api` skill for the
audit checklist.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any

# --- PII redaction -------------------------------------------------------
#
# Best-effort regex pack applied to caption + comment text before
# prompting. Patterns must be deterministic — same input → same output
# every time, so the cached prefix doesn't drift between calls.

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+?\d[\d\-\(\)\s]{7,}\d")
_HANDLE_MENTION_RE = re.compile(r"(?<!\w)@[A-Za-z0-9._]{2,30}")


def redact_pii(text: str) -> str:
    """Apply the documented redaction pack. Idempotent."""
    if not text:
        return ""
    out = _EMAIL_RE.sub("[redacted]", text)
    out = _PHONE_RE.sub("[redacted]", out)
    out = _HANDLE_MENTION_RE.sub("[redacted]", out)
    return out


def truncate_caption(text: str, limit: int = 200) -> str:
    """Truncate a caption to `limit` chars with an ellipsis. Token spend."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


# --- Weekly digest -------------------------------------------------------

# Static — frozen across users + weeks. cache_control marker goes on the
# block that wraps this in client.py-side payloads.
DIGEST_SYSTEM = """\
You are an Instagram analytics advisor. You are reviewing one creator's
performance over a single calendar week.

Output a JSON object — and ONLY a JSON object, no prose — with exactly
this shape:

{
  "narrative_md": "<3-4 short paragraphs of plain markdown synthesis>",
  "bullets": [
    {
      "kind": "win" | "warning" | "trend" | "experiment",
      "headline": "<= 80 chars, no markdown",
      "detail_md": "<1-2 sentences of markdown>",
      "link": {"route": "/dashboard/<page>", "query": {}} | null
    }
  ],
  "followups": ["<short actionable suggestion>", "..."]
}

Rules:
- Tie every observation to a specific metric or post from the supplied
  data. Do not invent numbers. Do not reference posts that are not in
  the input.
- Save rate, share rate, reach, follower delta, and posting cadence
  are the relevant signals. Engagement rate alone is not enough.
- Use `route:/dashboard/...` paths in `link.route` only when the
  observation maps to one of: /dashboard/content, /dashboard/reels,
  /dashboard/audience, /dashboard/competitors. Otherwise set link to
  null.
- Provide exactly 4 bullets, in this order: one "win", one "warning"
  (or "trend" if no warning fits), one "trend", one "experiment".
- followups: 2-4 short, concrete next actions tied to this week's
  observations. Do not include generic creator advice.
- Tone: direct, specific, no hedging, no emoji, no exclamation marks.
- Numbers in the narrative MUST appear (within ±5%) in the supplied
  data — a downstream guard will reject the response otherwise.
- Do not include any commentary outside the JSON object.
"""


def render_digest_user_block(ctx: dict[str, Any]) -> str:
    """Render the per-user weekly context as deterministic JSON.

    `ctx` is the dict produced by `digest._load_context()` — see that
    function for the field contract. We re-encode with sorted keys and
    tight separators so the byte sequence is stable across calls.
    """
    return _stable_json(ctx)


# --- Content Ideas ------------------------------------------------------

IDEAS_SYSTEM = """\
You are a content strategist for an Instagram creator. You have a list
of the creator's recent top-performing posts and a list of the themes
they have historically posted about.

Output a JSON object — and ONLY a JSON object, no prose — with exactly
this shape:

{
  "themes_detected": ["<short kebab-case theme>", "..."],
  "ideas": [
    {
      "title": "<= 80 chars, no markdown",
      "body_md": "<1-3 short paragraphs of plain markdown — what to make>",
      "suggested_format": "REELS" | "CAROUSEL" | "IMAGE" | "STORY",
      "rationale": "<1 sentence referencing the specific posts or signals that motivate this idea>",
      "adjacent": true | false
    }
  ]
}

Rules:
- Mine themes from the supplied top posts only — do not invent themes
  the creator hasn't engaged with.
- `themes_detected` is a flat list of 3-6 short kebab-case strings
  (e.g. "morning-routines", "carousel-tips"). No leading "#".
- Each idea must be specific and actionable — not a category
  ("post more about cooking") but a concrete piece of content
  ("3-part Reel series on prepping breakfast the night before").
- Use `suggested_format` to pick the format most likely to perform for
  this idea based on the source posts.
- `adjacent: true` means the idea explores a theme the creator hasn't
  posted about but that is proximate to their existing themes. Mark
  no more than 2 ideas as adjacent.
- `rationale` must cite a specific source post or signal (e.g.
  "Your top 2 posts in the period are morning-routine Reels with
  reach > 3x your median").
- Generate exactly the number of ideas requested in the input
  (`limit`). If the data is too thin for that many distinct ideas,
  produce fewer rather than padding with low-quality suggestions.
- Tone: direct, specific, no hedging, no emoji.
- Do not include any commentary outside the JSON object.
"""


def render_ideas_user_block(ctx: dict[str, Any]) -> str:
    """Render the per-user context for the ideas prompt as deterministic JSON."""
    return _stable_json(ctx)


# --- Post Diagnostic ----------------------------------------------------

DIAGNOSTIC_SYSTEM = """\
You are an Instagram analytics advisor diagnosing why ONE specific post
performed the way it did. You are given:
- The target post's observed metrics
- The creator's 60-post rolling baseline (median, not mean)
- The same baseline filtered to the same media_type
- The creator's hour-of-day engagement distribution
- The hashtags used on the post + how many other posts of theirs use each tag
- (Optional) comment sentiment summary

Your task: produce a structured diagnosis. The factors you may consider
are limited to: "format", "timing", "hashtags", "topic", "duration",
"hook". Do not invent factor keys.

Rules:
- Each factor's `evidence` must cite a real number from the supplied
  data. Do not invent metric values.
- Severity reflects how much the factor explains the under/over-
  performance: "high" = primary driver, "medium" = contributing,
  "low" = minor, "neutral" = the factor was fine (use only when noting
  that something didn't go wrong).
- Order factors by severity descending. Provide 2-5 factors total —
  fewer if the post is clearly explained by one or two signals.
- `underperformed`: true when the observed reach OR engagement rate is
  meaningfully below the baseline (>15% below median). false when the
  post matched or beat the baseline.
- `verdict_md`: one short paragraph (≤ 60 words) of plain markdown
  identifying the dominant factor.
- `recommendations_md`: 2-4 specific, actionable bullet points in
  plain markdown. Tie each recommendation to a factor's finding.
- "topic" should only be cited when comment sentiment data is in the
  input and supports it — never speculate on topic without evidence.
- Tone: direct, specific, no hedging, no emoji.
"""

# JSON schema enforced via output_config.format. The Anthropic API
# validates the response against this — out-of-spec keys / missing
# required fields cause a regenerate. See claude-api skill §Structured
# Outputs.
DIAGNOSTIC_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "underperformed", "verdict_md", "factors", "recommendations_md",
    ],
    "properties": {
        "underperformed": {"type": "boolean"},
        "verdict_md": {"type": "string"},
        "recommendations_md": {"type": "string"},
        "factors": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["key", "severity", "headline", "detail_md", "evidence"],
                "properties": {
                    "key": {
                        "type": "string",
                        "enum": ["format", "timing", "hashtags",
                                 "topic", "duration", "hook"],
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "neutral"],
                    },
                    "headline": {"type": "string"},
                    "detail_md": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["metric", "value", "comparison"],
                        "properties": {
                            "metric": {"type": "string"},
                            "value": {"type": "number"},
                            "comparison": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


def render_diagnostic_user_block(ctx: dict[str, Any]) -> str:
    """Render the per-post diagnostic context as deterministic JSON."""
    return _stable_json(ctx)


# --- Caption Studio -----------------------------------------------------

CAPTION_SYSTEM = """\
You are an Instagram caption editor for one creator. You receive:
- The creator's draft caption
- An optional topic hint
- The 10 highest-performing captions they've written for this format
  (ranked by algorithm score), with their reach + save/share numbers

Your task: score the draft and propose 3 distinct rewrites.

Rules:
- Output is a strict JSON object matching the supplied schema. No prose
  outside the JSON.
- `scores.hook_strength` (0-100): how compelling the first line is.
  90+ requires a specific stake, a vulnerability, or a concrete number.
- `scores.cta_presence` (0-100): how clearly the caption asks the
  reader to do something (comment, save, follow, click bio). A pure
  story with no ask scores below 30.
- `scores.overall` (0-100): your gestalt judgment. Approximately the
  average of hook + cta + your sense of how this would land with this
  specific creator's audience based on their top captions.
- DO NOT score `length_fit` — leave it as 0. The server computes it
  from the draft length vs the creator's median top-caption length.
- `variants` MUST contain exactly 3 entries, each with a distinct
  `label` chosen from:
    "Punchier hook" | "Stronger CTA" | "Shorter" | "Question hook" |
    "Listicle" | "Story arc" | "Direct ask"
- Variant `caption` text MUST stay under 2,200 characters (Instagram's
  hard limit). Stay under 1,500 unless the original draft is longer.
- Variant `id` MUST be the placeholder string "PENDING" — the server
  assigns stable IDs.
- `rationale`: one short sentence per variant, tying the rewrite to a
  specific signal from the top-caption corpus.
- `notes_md`: one paragraph (≤ 80 words) of plain markdown — what the
  draft does well and what the rewrites are trying to fix. Reference
  the creator's top captions, not generic advice.
- Tone: direct, specific, no emoji, no hedging.
"""

# JSON schema enforced via output_config.format. The Anthropic API
# validates the response shape — out-of-spec keys, wrong types, missing
# required fields cause a regenerate. Per claude-api skill §Structured
# Outputs: `additionalProperties: false` required on every object.
CAPTION_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["scores", "variants", "notes_md"],
    "properties": {
        "scores": {
            "type": "object",
            "additionalProperties": False,
            "required": ["hook_strength", "cta_presence",
                         "length_fit", "overall"],
            "properties": {
                "hook_strength": {"type": "integer", "minimum": 0, "maximum": 100},
                "cta_presence": {"type": "integer", "minimum": 0, "maximum": 100},
                "length_fit": {"type": "integer", "minimum": 0, "maximum": 100},
                "overall": {"type": "integer", "minimum": 0, "maximum": 100},
            },
        },
        "variants": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["id", "label", "caption", "rationale"],
                "properties": {
                    "id": {"type": "string"},
                    "label": {
                        "type": "string",
                        "enum": [
                            "Punchier hook", "Stronger CTA", "Shorter",
                            "Question hook", "Listicle", "Story arc",
                            "Direct ask",
                        ],
                    },
                    "caption": {"type": "string"},
                    "rationale": {"type": "string"},
                },
            },
        },
        "notes_md": {"type": "string"},
    },
}


def render_caption_user_block(ctx: dict[str, Any]) -> str:
    """Render the caption-studio context as deterministic JSON."""
    return _stable_json(ctx)


# --- Reel script writer ----------------------------------------------------

REEL_SCRIPT_SYSTEM = """\
You write Instagram Reel scripts for one creator. You receive:
- A content idea (title + summary)
- Captions of the creator's top-performing reels, with engagement numbers

Your task: turn the idea into a ready-to-shoot reel script.

Rules:
- Output is a strict JSON object matching the supplied schema. No prose
  outside the JSON. Use exactly these keys: hook, beats (array of
  {seconds, action, voiceover, on_screen_text}), cta, duration_s,
  rationale.
- `hook`: the first spoken/visual line (≤ 12 words). Must create an open
  loop or stake — study what the creator's top captions do.
- `beats`: 3-6 entries covering the whole reel. `seconds` is the beat's
  start offset. `action` is what's on camera; `voiceover` what is said
  (may be ""); `on_screen_text` the overlay text (may be "").
- `cta`: one closing ask (comment/save/follow), phrased the way this
  creator phrases asks in their top captions.
- `duration_s`: total target length, 15-60. Shorter is better unless the
  idea demands more.
- `rationale`: ≤ 40 words tying script choices to the creator's data.
- Match the creator's voice from the caption corpus: vocabulary, emoji
  habits, formality. Never invent facts about the creator's life.
"""

REEL_SCRIPT_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["hook", "beats", "cta", "duration_s", "rationale"],
    "properties": {
        "hook": {"type": "string"},
        "beats": {
            "type": "array",
            "minItems": 3,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["seconds", "action", "voiceover", "on_screen_text"],
                "properties": {
                    "seconds": {"type": "integer", "minimum": 0, "maximum": 90},
                    "action": {"type": "string"},
                    "voiceover": {"type": "string"},
                    "on_screen_text": {"type": "string"},
                },
            },
        },
        "cta": {"type": "string"},
        "duration_s": {"type": "integer", "minimum": 10, "maximum": 90},
        "rationale": {"type": "string"},
    },
}


def render_reel_script_user_block(ctx: dict[str, Any]) -> str:
    """Render the reel-script context as deterministic JSON."""
    return _stable_json(ctx)


# --- Viral hook writer ------------------------------------------------------

HOOKS_SYSTEM = """\
You write scroll-stopping opening hooks for one creator's Instagram Reels.
You receive:
- A topic (title + optional summary)
- Captions of the creator's top-performing reels, with engagement numbers

Your task: produce a set of distinct hook options for the topic — the first
spoken or on-screen line that stops the scroll.

Rules:
- Output is a strict JSON object matching the supplied schema. No prose
  outside the JSON. Use exactly these keys: hooks (array of
  {text, angle, rationale}).
- Produce 6 hooks, each taking a DIFFERENT angle. Use these angle labels,
  each at most once: "curiosity gap", "bold claim", "question",
  "contrarian", "relatable pain", "result tease".
- `text`: the hook line itself, ≤ 12 words. It must open a loop, stake, or
  tension — no throat-clearing ("In this video…"). Match the creator's
  voice, vocabulary, and emoji habits from their top captions.
- `angle`: one of the labels above.
- `rationale`: ≤ 20 words on why this hook works for this creator/topic.
- Never invent facts about the creator's life, numbers, or testimonials.
"""

HOOKS_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["hooks"],
    "properties": {
        "hooks": {
            "type": "array",
            "minItems": 3,
            "maxItems": 8,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "angle", "rationale"],
                "properties": {
                    "text": {"type": "string"},
                    "angle": {"type": "string"},
                    "rationale": {"type": "string"},
                },
            },
        },
    },
}


def render_hooks_user_block(ctx: dict[str, Any]) -> str:
    """Render the hooks context as deterministic JSON."""
    return _stable_json(ctx)


# --- Content repurposer -----------------------------------------------------

REPURPOSE_SYSTEM = """\
You repurpose one piece of content into four formats for an Instagram
creator. You receive the source content (a caption, script, or rough notes)
and a few of the creator's top captions as voice reference.

Produce all four assets:
1. `reel_script_md` — a compact reel script: hook line, 3-5 numbered beats
   with on-screen text in **bold**, closing CTA.
2. `carousel_md` — a slide-by-slide outline: "Slide 1: …" through
   "Slide N: …" (5-8 slides), first slide is the hook, last is the CTA.
3. `story_sequence_md` — 3-5 story frames: each a line "Frame N: …"
   describing the visual + sticker/poll/question to use.
4. `tweet_thread_md` — 4-7 numbered tweets, each ≤ 270 chars, first tweet
   is the hook, last invites follows.

Rules:
- Output is a strict JSON object matching the supplied schema — exactly the
  four *_md string keys. Markdown inside the strings, no prose outside.
- Preserve the substance of the source; adapt structure per format. Never
  pad with invented facts, stats, or testimonials.
- Match the creator's voice from the reference captions.
"""

REPURPOSE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reel_script_md", "carousel_md", "story_sequence_md", "tweet_thread_md"],
    "properties": {
        "reel_script_md": {"type": "string"},
        "carousel_md": {"type": "string"},
        "story_sequence_md": {"type": "string"},
        "tweet_thread_md": {"type": "string"},
    },
}


def render_repurpose_user_block(ctx: dict[str, Any]) -> str:
    """Render the repurposer context as deterministic JSON."""
    return _stable_json(ctx)


# --- Audience-question mining ------------------------------------------------

QUESTION_MINING_SYSTEM = """\
You mine audience questions for content demand. You receive the distinct
questions a creator's audience asked in comments, each with a `count` of how
many times it (or a near-identical phrasing) was asked.

Your task: cluster the questions into demand topics and pitch content.

Rules:
- Output is a strict JSON object matching the supplied schema: a top-level
  "topics" array whose items have "topic", "question_count",
  "sample_questions", "content_pitch", "suggested_format".
- 3-6 topics, ordered by demand (question_count desc). Merge questions
  about the same underlying ask into one topic.
- `topic`: 2-5 word label ("Camera gear", "Editing workflow").
- `question_count`: the SUM of the `count` values of the questions you
  assigned to this topic. Plain integer digits (e.g. 14), never words.
- `sample_questions`: 1-3 verbatim examples from the input.
- `content_pitch`: one sentence pitching the post that answers the demand.
- `suggested_format`: exactly one of "REELS", "CAROUSEL", "IMAGE", "STORY".
- Only cluster what's in the input — never invent questions or counts.
- Answer directly with the JSON. Do not deliberate at length.
"""

QUESTION_MINING_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["topics"],
    "properties": {
        "topics": {
            "type": "array",
            "minItems": 1,
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["topic", "question_count", "sample_questions",
                             "content_pitch", "suggested_format"],
                "properties": {
                    "topic": {"type": "string"},
                    "question_count": {"type": "integer", "minimum": 1},
                    "sample_questions": {
                        "type": "array", "minItems": 1, "maxItems": 3,
                        "items": {"type": "string"},
                    },
                    "content_pitch": {"type": "string"},
                    "suggested_format": {
                        "type": "string",
                        "enum": ["REELS", "CAROUSEL", "IMAGE", "STORY"],
                    },
                },
            },
        },
    },
}


def render_question_mining_user_block(ctx: dict[str, Any]) -> str:
    """Render the question-mining context as deterministic JSON."""
    return _stable_json(ctx)


# --- Comment reply suggester ---------------------------------------------

COMMENT_REPLY_SYSTEM = """\
You write Instagram comment replies in one creator's voice. You receive:
- The incoming comment (text, sentiment label, whether it's a question)
- The caption of the post the comment was left on
- Up to 5 of the creator's own recent replies (voice samples; may be empty)

Your task: propose 3 ready-to-post replies with distinct tones.

Rules:
- Output is a strict JSON object matching the supplied schema. No prose
  outside the JSON.
- Each reply is 1-2 short sentences, specific to the comment — never a
  generic "Thanks so much!" unless the comment itself is a bare emoji.
- Mirror the voice samples when present: their emoji habits, formality,
  punctuation. With no samples, default to warm and casual.
- Never invent facts, prices, discounts, links, or commitments. If the
  comment asks something the caption doesn't answer, acknowledge and
  promise a follow-up instead of fabricating an answer.
- For negative comments: de-escalate, stay gracious, never argue.
- No hashtags. At most one emoji per reply unless the voice samples use more.
- The three `tone` values MUST be exactly: "friendly", "playful",
  "professional" — one reply each.
- Each reply MUST stay under 500 characters.
- The output object MUST use exactly these keys — a top-level
  "suggestions" array whose items have "tone" and "reply":
  {"suggestions":[{"tone":"friendly","reply":"..."},
  {"tone":"playful","reply":"..."},{"tone":"professional","reply":"..."}]}
"""

COMMENT_REPLY_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["suggestions"],
    "properties": {
        "suggestions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tone", "reply"],
                "properties": {
                    "tone": {
                        "type": "string",
                        "enum": ["friendly", "playful", "professional"],
                    },
                    "reply": {"type": "string"},
                },
            },
        },
    },
}


def render_comment_reply_user_block(ctx: dict[str, Any]) -> str:
    """Render the comment-reply context as deterministic JSON."""
    return _stable_json(ctx)


# --- Helpers -------------------------------------------------------------

def _stable_json(obj: Any) -> str:
    """JSON-encode with sorted keys, no whitespace, ISO dates."""
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        default=_default,
    )


def _default(value: Any) -> Any:
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"Unsupported type for prompt JSON: {type(value).__name__}")


__all__ = [
    "DIGEST_SYSTEM",
    "IDEAS_SYSTEM",
    "DIAGNOSTIC_SYSTEM",
    "DIAGNOSTIC_OUTPUT_SCHEMA",
    "CAPTION_SYSTEM",
    "CAPTION_OUTPUT_SCHEMA",
    "redact_pii",
    "truncate_caption",
    "render_digest_user_block",
    "render_ideas_user_block",
    "render_diagnostic_user_block",
    "render_caption_user_block",
]
