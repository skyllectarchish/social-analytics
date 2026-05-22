# Tier 4 — AI Layer · Backend Implementation Plan

Companion to `tier4-ai-layer-frontend-plan.md`. The frontend plan
defined contracts (§2 of that doc) — this document specifies the
FastAPI/ClickHouse/Anthropic-SDK implementation that satisfies them.

Scope mirrors the frontend: the four AI features from
`instagram-analytics-feature-research.md` §Tier 4 plus the cross-cutting
quota, feedback, and telemetry surfaces.

| # | Feature | Endpoint(s) | Surface owner |
| - | --- | --- | --- |
| 15 | Weekly AI Insights Digest | `/api/ai/digest/weekly`, `/regenerate`, `/stream` | Scheduled job + on-demand route |
| 16 | Content Idea Generator | `/api/ai/ideas` | On-demand route |
| 17 | Post Diagnostic | `/api/ai/diagnose-post` | On-demand route |
| 18 | Caption A/B Suggestions | `/api/ai/caption/suggest` | On-demand route |
| — | Quota | `/api/ai/quota` | Cross-cutting |
| — | Feedback | `/api/ai/feedback` | Cross-cutting |
| — | Telemetry | `/api/telemetry` | Cross-cutting |

---

## 1. Stack & ground rules

### 1.1 LLM provider

**Anthropic Claude via the official `anthropic` Python SDK.** The
package is already in `requirements.txt` (used by `sentiment_batch.py`).

Model selection per feature:

| Feature | Model | Why |
| --- | --- | --- |
| Weekly Digest | `claude-sonnet-4-6` | Synthesis quality matters more than latency. 64K output ceiling is plenty for a multi-bullet markdown narrative. Adaptive thinking improves the cross-metric reasoning the digest depends on. |
| Post Diagnostic | `claude-sonnet-4-6` | Same — multi-factor causal reasoning rewards adaptive thinking. |
| Content Ideas | `claude-haiku-4-5` | Pattern-matching against the user's top posts; cheap and fast. Falls back to Sonnet 4.6 when Haiku output quality fails an eval threshold (see §11). |
| Caption Studio | `claude-haiku-4-5` | Short outputs, low-stakes; cost-sensitive because it's the most clicked surface. |

All model IDs are the exact strings from the `claude-api` skill's
current model table — do not append date suffixes.

Reasoning configuration: every call uses `thinking={"type": "adaptive"}`
+ `output_config={"effort": "medium"}`. Diagnostic and digest may bump to
`"effort": "high"` once quality is dialed in.

### 1.2 Codebase conventions to follow

The project already has strong conventions from CLAUDE.md and the
existing `instagram/` module. The AI module follows the same pattern:

- Feature module under `app/ai/` with `router.py`, `schemas.py`, `service.py`, `prompts.py`, `client.py`.
- SQL strings live in `app/models/queries.py` (centralized).
- ClickHouse tables use `ReplacingMergeTree(updated_at)`; reads use `FINAL` or `ORDER BY updated_at DESC LIMIT 1`.
- Migrations live in `backend/migrations/0NN_*.sql` and are applied by `run_migrations.py`.
- Protected routes depend on `auth.dependencies.get_current_user`.
- Settings extend `app/config.py` with typed fields; `backend/.env.example` is the contract.
- Scheduled jobs follow the `app/jobs/*.py` pattern, registered in `app/scheduler.py`.

### 1.3 Threading model

FastAPI is async. The `anthropic` SDK exposes both sync and async
clients — use **`AsyncAnthropic`** in request handlers; sync
`Anthropic` in batch jobs where simplicity wins. The existing
`sentiment_batch.py` uses the sync client because it's a script — keep
that.

The `clickhouse-connect` client is sync — wrap any DB-heavy AI handler
work in `asyncio.to_thread()` if it blocks the event loop. The existing
codebase uses sync ClickHouse calls inside FastAPI routes directly,
which is acceptable for short queries; long-running synthesis steps
*must* be wrapped to avoid blocking other requests.

---

## 2. File layout

New module + supporting files:

```
backend/app/
  ai/                                # NEW
    __init__.py
    router.py                        # FastAPI routes
    schemas.py                       # Pydantic models (request/response)
    service.py                       # Orchestration: data fetch → prompt → LLM → persist
    client.py                        # Anthropic SDK wrapper (singleton, async)
    prompts.py                       # System + user prompt templates
    quota.py                         # Per-user monthly quota tracking
    feedback.py                      # Thumbs feedback writes
    telemetry.py                     # Event ingest
    digest.py                        # Weekly digest synthesis (used by route + job)
    ideas.py                         # Content ideas synthesis
    diagnostic.py                    # Post diagnostic synthesis
    caption.py                       # Caption studio synthesis
  jobs/
    weekly_digest.py                 # NEW — scheduled Monday job
  models/
    queries.py                       # +AI-specific SQL
  config.py                          # +ANTHROPIC_API_KEY, +AI_* fields
backend/migrations/
  020_create_ai_digests.sql          # NEW
  021_create_ai_feedback.sql         # NEW
  022_create_ai_quota.sql            # NEW
  023_create_ai_events.sql           # NEW (telemetry)
```

`main.py` includes the new router:

```python
from .ai.router import router as ai_router
app.include_router(ai_router)
```

---

## 3. ClickHouse schema

Four new tables. All use the project's standard
`ReplacingMergeTree(updated_at)` engine so writes are append-only and
reads use `FINAL` / `ORDER BY updated_at DESC LIMIT 1`.

### 3.1 `ai_digests` (migration 020)

Caches the synthesized weekly digest per user. Keyed by
`(user_id, week_of)` so each Monday refresh produces a new row that
deduplicates the prior one.

```sql
CREATE TABLE IF NOT EXISTS ai_digests
(
    user_id          UUID,
    week_of          Date,                  -- Monday of the synthesized week
    status           LowCardinality(String), -- 'ready' | 'stale' | 'generating' | 'not_enough_data'
    cached           UInt8,                 -- 1 if served from cache
    narrative_md     String,
    bullets_json     String,                -- JSON-encoded bullet array
    followups_json   String,                -- JSON-encoded string array
    metrics_snapshot String,                -- JSON
    model            LowCardinality(String),
    prompt_hash      String,                -- sha256 of the rendered prompt
    input_tokens     UInt32,
    output_tokens    UInt32,
    cache_read_tokens UInt32,
    cache_write_tokens UInt32,
    latency_ms       UInt32,
    generated_at     DateTime,
    updated_at       DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, week_of);
```

### 3.2 `ai_feedback` (migration 021)

Thumbs feedback. Idempotent on `(user_id, feature, ref_id)` by virtue
of the `ReplacingMergeTree` engine — the latest row wins.

```sql
CREATE TABLE IF NOT EXISTS ai_feedback
(
    user_id    UUID,
    feature    LowCardinality(String),     -- 'digest' | 'ideas' | 'diagnostic' | 'caption'
    ref_id     String,                     -- week_of / idea.id / ig_media_id / caption-hash
    rating     LowCardinality(String),     -- 'up' | 'down'
    note       String,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, feature, ref_id);
```

### 3.3 `ai_quota_usage` (migration 022)

Monthly per-user AI call counter. One row per call; the quota endpoint
aggregates with `count()` over the current calendar month.

```sql
CREATE TABLE IF NOT EXISTS ai_quota_usage
(
    user_id     UUID,
    call_id     UUID,                       -- unique per invocation
    feature     LowCardinality(String),     -- which surface charged the call
    model       LowCardinality(String),
    input_tokens  UInt32,
    output_tokens UInt32,
    cost_usd_micros UInt64,                 -- computed at write time; integer micros
    called_at   DateTime DEFAULT now(),
    updated_at  DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, called_at, call_id);
```

`cost_usd_micros` lets us aggregate dollars without floating-point
drift. Computed from the pricing table in §10.4.

### 3.4 `ai_events` (migration 023)

Telemetry sink — receives the events catalogued in
`tier4-ai-layer-frontend-plan.md` §16.

```sql
CREATE TABLE IF NOT EXISTS ai_events
(
    event_id   UUID,
    user_id    UUID,
    ts         DateTime,
    feature    LowCardinality(String),
    action     LowCardinality(String),
    ref_id     String,
    meta_json  String,                      -- arbitrary small payload
    latency_ms UInt32,
    received_at DateTime DEFAULT now()
)
ENGINE = MergeTree                          -- append-only, never edited
ORDER BY (user_id, ts);
```

Different engine — `MergeTree` not `ReplacingMergeTree` because
telemetry events are immutable and we don't dedupe by ID. The
`received_at` separator from `ts` lets us spot pipeline lag.

### 3.5 Read patterns

All AI queries follow the existing centralization rule — add them to
`app/models/queries.py`. Example shapes:

```python
GET_AI_DIGEST = """
SELECT week_of, status, cached, narrative_md, bullets_json, followups_json,
       metrics_snapshot, generated_at
FROM ai_digests FINAL
WHERE user_id = {user_id:UUID}
  AND week_of = {week_of:Date}
LIMIT 1
"""

GET_AI_QUOTA_USAGE_THIS_MONTH = """
SELECT count() AS used
FROM ai_quota_usage
WHERE user_id = {user_id:UUID}
  AND called_at >= toStartOfMonth(now())
"""

INSERT_AI_FEEDBACK = """
INSERT INTO ai_feedback (user_id, feature, ref_id, rating, note)
VALUES ({user_id:UUID}, {feature:String}, {ref_id:String}, {rating:String}, {note:String})
"""
```

---

## 4. Routes (FastAPI)

All routes are mounted under `/api/ai/` (and `/api/telemetry` for the
event sink). Every route depends on `auth.dependencies.get_current_user`
unless explicitly noted.

### 4.1 `GET /api/ai/digest/weekly?week_of=YYYY-MM-DD`

Returns the cached digest for `(user_id, week_of)`. If absent or older
than the staleness threshold, returns `status: "stale"` and lets the
client trigger regeneration. Default `week_of` = the Monday of the
caller's local week (server uses UTC if no timezone is configured).

**Response** (matches frontend `WeeklyDigestResponse` §2.1):

```python
class DigestBulletLink(BaseModel):
    route: str
    query: dict[str, str] = {}

class DigestBullet(BaseModel):
    kind: Literal["win", "warning", "trend", "experiment"]
    headline: str
    detail_md: str
    link: DigestBulletLink | None = None

class WeeklyDigestResponse(BaseModel):
    week_of: date
    generated_at: datetime
    status: Literal["ready", "stale", "generating", "not_enough_data"]
    cached: bool
    narrative_md: str
    bullets: list[DigestBullet]
    metrics_snapshot: dict[str, float | int | None]
    followups: list[str]
```

Flow:

1. Pull the cached row from `ai_digests`.
2. If absent: check whether the user has ≥7 days of posting history
   (`SELECT count() FROM instagram_media WHERE user_id = … AND timestamp > now() - INTERVAL 7 DAY`).
   - Empty → return synthesized `status: "not_enough_data"` (no LLM
     call, no quota charge).
   - Has data → trigger synthesis inline (see §6.1).
3. If present but older than 7 days from `generated_at` and the
   requested `week_of` is the current week → mark `status: "stale"`.

### 4.2 `POST /api/ai/digest/regenerate`

Body: `{ "week_of": "YYYY-MM-DD" }`. Bypasses the cache, charges a
quota call, and synthesizes a fresh digest. Returns the new
`WeeklyDigestResponse`. Server enforces the quota — see §10.

### 4.3 `GET /api/ai/digest/stream?week_of=YYYY-MM-DD`

Server-Sent Events stream. Frontend opens this when a fresh synthesis
is in flight (either the cache hit returned `status: "generating"` or
the user clicked Regenerate). Wire format is the exact grammar in
`tier4-ai-layer-frontend-plan.md` §18.

Implementation uses FastAPI's `StreamingResponse` with
`media_type="text/event-stream"` and a generator that wraps the
Anthropic SDK's `messages.stream()`:

```python
@router.get("/digest/stream")
async def digest_stream(
    week_of: date,
    current_user: User = Depends(get_current_user),
):
    return StreamingResponse(
        _sse_digest(current_user["id"], week_of),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",   # nginx: do not buffer
        },
    )
```

The `_sse_digest` generator yields three frame types:
- `event: token\ndata: {"text": "...", "seq": N}\n\n`
- `event: meta\ndata: {"bullet_index": 0, "kind": "win"}\n\n`
- `event: done\ndata: <full WeeklyDigestResponse>\n\n` (or `error`).

We also yield a `keepalive` comment line every 15s
(`: keepalive\n\n`) to defeat upstream-proxy idle drops.

### 4.4 `GET /api/ai/ideas?days=90&limit=5`

Returns 5 (configurable up to 10) content ideas mined from the user's
top-performing posts in the trailing window. Two cache strategies:

- **Soft cache**: the same `(user_id, days, limit)` within 6 hours
  returns the prior result without a fresh LLM call (one quota charge
  per 6h window). The prior result lives in `ai_quota_usage`'s
  associated artifact — we add an `ai_ideas` table mirroring
  `ai_digests` for this (migration 020 supersets to include it, or
  add `024_create_ai_ideas.sql`).
- **Hard refresh**: `refresh=true` query param bypasses the cache.

**Response** matches frontend `ContentIdeasResponse` §2.2:

```python
class IdeasSourcePost(BaseModel):
    ig_media_id: str
    permalink: str | None
    thumbnail_url: str | None
    caption_preview: str | None
    algorithm_score_pct: int

class Idea(BaseModel):
    id: str
    title: str
    body_md: str
    suggested_format: Literal["REELS", "CAROUSEL", "IMAGE", "STORY"]
    rationale: str
    adjacent: bool

class ContentIdeasResponse(BaseModel):
    period_days: int
    generated_at: datetime
    source_posts: list[IdeasSourcePost]
    themes_detected: list[str]
    ideas: list[Idea]
```

### 4.5 `POST /api/ai/diagnose-post`

Body: `{ "ig_media_id": "..." }`. Loads:

- The target post's metrics from `instagram_media` and `media_insights`
- The user's 60-post baseline (rolling median for reach, ER, save rate)
- Hashtag mix + posting hour vs the user's heatmap

Hands all of that to Sonnet 4.6 with the diagnostic prompt (§7.3),
parses the model's structured JSON output, persists to an
`ai_diagnostics` table (optional — diagnostics are cheap to redo, so
caching is best-effort), and returns `DiagnosticResponse` matching the
frontend contract §2.3.

**Eligibility rule**: if the post is < 24h old, return HTTP 422 with
`{"detail": {"code": "media_not_eligible", "message": "..."}}` — the
frontend renders this as the friendly "too recent" empty state.

### 4.6 `POST /api/ai/caption/suggest`

Body: `{ "draft": string, "format": "REELS"|..., "topic_hint"?: string }`.

Loads the user's top 10 captions for the supplied `format` ordered by
algorithm score. Asks Haiku 4.5 to score the draft (hook / CTA / length
/ overall) and propose 3 variants. Output is **enforced as JSON** via
`output_config={"format": {"type": "json_schema", "schema": …}}` — see
§7.4 for the schema. Returns `CaptionSuggestResponse` §2.4.

No caching: caption studio submissions are ephemeral, not stored. We
still charge quota and record one row in `ai_quota_usage`.

### 4.7 `GET /api/ai/quota`

Returns the user's current monthly usage:

```python
class QuotaResponse(BaseModel):
    used: int
    limit: int
    resets_at: datetime
```

`limit` is per-user, sourced from `users` (add a column) or a fixed
default from `Settings.ai_monthly_call_limit`. `resets_at` is the first
of next month UTC.

### 4.8 `POST /api/ai/feedback`

Body: `{ "feature": str, "ref_id": str, "rating": "up"|"down", "note"?: str }`.

Inserts into `ai_feedback`. Returns 204. Idempotent — repeated POSTs
with the same `(user_id, feature, ref_id)` just upsert (ReplacingMergeTree
collapses to the latest row at merge time, and the
`SELECT … FINAL` read path always returns the current rating).

### 4.9 `POST /api/telemetry`

Body: `{ "events": [TelemetryEvent, ...] }`. Bulk-inserts into
`ai_events`. Auth is the same JWT used everywhere else — telemetry from
unauthenticated traffic is dropped at the auth dependency. Returns 204.

**Rate guard**: cap at 200 events per request, 60 requests per minute
per user. Exceeding either returns 429.

---

## 5. Anthropic client wrapper (`app/ai/client.py`)

Singleton async client + prompt-caching helpers. The Anthropic Python
SDK is already in `requirements.txt`. Key requirements per the
`claude-api` skill:

- Use `claude-opus-4-7` only when explicitly required; default to
  Sonnet 4.6 and Haiku 4.5 per §1.1.
- Use `thinking: {type: "adaptive"}` (never `budget_tokens`).
- Use `output_config: {effort: "medium"}` for routine work; `"high"`
  for digest and diagnostic. `effort: "max"` is Opus-only and we don't
  use Opus here.
- Use prompt caching on the system prompt and any large stable
  context — the user's metric history changes once per day, which is a
  natural cache boundary.
- Stream by default for `max_tokens > ~16000`.

```python
# app/ai/client.py
from anthropic import AsyncAnthropic
from ..config import settings

_client: AsyncAnthropic | None = None

def get_ai_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not configured")
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def synthesize(
    *,
    model: str,
    system: list[dict],          # text blocks; last block carries cache_control
    messages: list[dict],
    effort: str = "medium",
    max_tokens: int = 16000,
    stream: bool = False,
) -> dict:
    """Single-shot synthesis. Returns the parsed response payload + usage."""
    client = get_ai_client()
    params = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
        thinking={"type": "adaptive"},
        output_config={"effort": effort},
    )
    if stream:
        async with client.messages.stream(**params) as s:
            text_chunks: list[str] = []
            async for delta in s.text_stream:
                text_chunks.append(delta)
            final = await s.get_final_message()
            return {
                "text": "".join(text_chunks),
                "usage": final.usage,
                "stop_reason": final.stop_reason,
            }
    msg = await client.messages.create(**params)
    text = "".join(b.text for b in msg.content if b.type == "text")
    return {"text": text, "usage": msg.usage, "stop_reason": msg.stop_reason}
```

### 5.1 Prompt caching

`shared/prompt-caching.md` from the skill is law: any byte change in
the cached prefix invalidates everything after it. We exploit this by
keeping the **system prompt** and the **per-user metric history block**
deterministic — same JSON serialization (keys sorted, no timestamps in
the system prompt), same model, same tool set across calls.

Cache layout per call:

```
[system block 1: static feature instructions]
[system block 2: per-user account summary]  ← cache_control: ephemeral
[messages: the specific question for this call]
```

The static feature instructions never change across users → high cache
hit rate across all weekly digest calls. The per-user account summary
changes once per day at most → cache hit rate ~100% for digest
re-renders within the same day, and ~100% for the same user across all
4 AI features within a day.

Verification: after every LLM call, log
`usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`
to `ai_quota_usage`. If reads are zero across consecutive calls with
the same prefix, a silent invalidator is at work — likely a
`datetime.now()` in the system prompt or non-deterministic JSON.

---

## 6. Per-feature service layer

Each feature has its own module (`digest.py`, `ideas.py`,
`diagnostic.py`, `caption.py`). The pattern is identical:

```python
async def synthesize_X(
    user_id: UUID, **inputs
) -> tuple[XResponse, UsageRecord]:
    # 1. Load deterministic context from ClickHouse
    ctx = await _load_context(user_id, **inputs)

    # 2. Render the prompt (deterministic — see §7)
    system, messages = build_X_prompt(ctx)

    # 3. Call the LLM
    result = await client.synthesize(
        model=MODEL_FOR_X,
        system=system,
        messages=messages,
        effort=EFFORT_FOR_X,
    )

    # 4. Parse the model output (JSON schema-enforced where possible)
    response = parse_X_output(result["text"])

    # 5. Persist + record quota usage
    await _persist(user_id, response, result["usage"])
    return response, _usage_record(result["usage"])
```

### 6.1 Digest synthesis flow

Inputs the digest needs (built by `app/ai/digest.py::_load_context`):

| Input | Source | Notes |
| --- | --- | --- |
| Posts this week | `instagram_media` filtered to `[week_of, week_of + 7d]` | Caption truncated to 200 chars to control token spend |
| Period-over-period metrics | `GET_DASHBOARD_SUMMARY` for this week vs prior week | Existing query |
| Top post + bottom post | sort by `views` / `interactions` | Provides anchor points the LLM references |
| Format breakdown | `GET_FORMAT_BREAKDOWN` | Powers "carousel save rate dropped 18%" type observations |
| Best-time delta | best posting hours this week vs trailing 60d | Powers "posting cadence shifted later" trend bullets |
| Follower delta | `account_insights` follower count diff | Headline metric |
| Audience growth drivers (if present) | existing `growth_drivers` view | Optional — adds attribution detail |

Token budget: prompt ~6K tokens (system) + ~3K tokens (per-user data) =
~9K input. Output ~1.5K tokens. Latency target: 4-8s wall clock with
`effort="high"`.

**Streaming flow** (for `GET /api/ai/digest/stream`):

```python
async def _sse_digest(user_id: UUID, week_of: date):
    yield ": connected\n\n"  # comment frame for proxies
    seq = 0
    try:
        ctx = await _load_context(user_id, week_of)
        system, messages = build_digest_prompt(ctx)
        async with get_ai_client().messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=16000,
            system=system,
            messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
        ) as s:
            async for chunk in s.text_stream:
                seq += 1
                yield f"event: token\ndata: {json.dumps({'text': chunk, 'seq': seq})}\n\n"
            final = await s.get_final_message()
        parsed = parse_digest_output(_text(final))
        await _persist_digest(user_id, week_of, parsed, final.usage)
        yield f"event: done\ndata: {parsed.model_dump_json()}\n\n"
    except anthropic.RateLimitError:
        yield "event: error\ndata: {\"code\":\"rate_limited\"}\n\n"
    except anthropic.APIStatusError as e:
        code = "upstream_timeout" if e.status_code == 504 else "upstream_error"
        yield f"event: error\ndata: {json.dumps({'code': code})}\n\n"
```

### 6.2 Ideas synthesis flow

Inputs: top 10 posts (last 90 days) ordered by algorithm score; their
caption previews and engagement metrics. Themes are extracted by the
LLM in the same call (rather than running embeddings client-side
first) — this is a deliberate simplification for v1. Phase G can swap
in embedding-based clustering if quality plateaus.

### 6.3 Diagnostic synthesis flow

Inputs:

- Target post (`instagram_media` + `media_insights`)
- 60-post baseline (median reach, ER, save rate, by `media_type`)
- Best-time heatmap (which hour buckets historically outperform)
- Hashtag-size mix (small / mid / large bucket distribution for the user)
- Comments sentiment if available (`comment_sentiment` table)

Output schema is enforced via `output_config.format` JSON schema so we
get parseable factor rows without prompt hacks. The model returns:

```json
{
  "underperformed": bool,
  "verdict_md": str,
  "factors": [
    {"key": str, "severity": str, "headline": str, "detail_md": str,
     "evidence": {"metric": str, "value": number, "comparison": str}}
  ],
  "recommendations_md": str
}
```

Server adds `baseline` and `observed` blocks deterministically (from
ClickHouse) so the LLM never invents metric values.

### 6.4 Caption synthesis flow

Inputs:

- The user's top 10 captions for the supplied format
- The submitted draft
- Optional topic hint

Output schema (JSON):

```json
{
  "scores": {
    "hook_strength": number,
    "cta_presence": number,
    "length_fit": number,
    "overall": number
  },
  "variants": [
    {"id": str, "label": str, "caption": str, "rationale": str}
  ],
  "notes_md": str
}
```

`length_fit` is computed deterministically in Python (not the LLM) and
spliced in after the response — score = how close the draft is to the
median length of the user's top 10 captions for the format. The LLM
provides only `hook_strength`, `cta_presence`, and an `overall`
estimate; server overwrites `length_fit` to keep the meter precise.

---

## 7. Prompt design

All prompts live in `app/ai/prompts.py` as multi-line string constants.

### 7.1 Stable system prompt (digest example)

```python
DIGEST_SYSTEM = """\
You are an Instagram analytics advisor. You are reviewing one creator's
performance over a single calendar week.

Output a JSON object with exactly this shape:
{
  "narrative_md": "<3-4 paragraph markdown synthesis>",
  "bullets": [
    {"kind": "win"|"warning"|"trend"|"experiment",
     "headline": "<= 80 chars",
     "detail_md": "<1-2 sentences>",
     "link": {"route": "/dashboard/<page>", "query": {}} | null}
  ],
  "followups": ["<short actionable suggestion>"]
}

Rules:
- Tie every observation to a specific metric or post from the supplied
  data. Do not invent numbers.
- Save-rate, share-rate, reach, follower delta, and posting cadence
  are the relevant signals. Engagement rate alone is not enough.
- Use `route:/dashboard/...` paths in `link.route` only when the
  observation maps to one of: /dashboard/content, /dashboard/reels,
  /dashboard/audience, /dashboard/competitors.
- Bullets must be ranked by importance to the creator. 4 bullets total:
  one win, one warning (or trend if no warning), one trend, one
  experiment.
- Tone: direct, specific, no hedging. No emoji. No exclamation marks.
"""
```

`cache_control: {"type": "ephemeral"}` goes on this block. It's frozen
across all users and all weeks → high cache reuse.

### 7.2 Per-user data block

Rendered deterministically as **sorted JSON** so the prefix bytes are
stable across calls with the same data:

```python
def render_user_context(ctx: DigestContext) -> str:
    payload = {
        "week_of": ctx.week_of.isoformat(),
        "posts": sorted([
            {
                "id": p.ig_media_id,
                "type": p.media_type,
                "ts": p.timestamp.isoformat(),
                "caption_preview": p.caption[:200] if p.caption else "",
                "reach": p.reach,
                "saves": p.saves,
                "shares": p.shares,
                "interactions": p.interactions,
            }
            for p in ctx.posts
        ], key=lambda x: x["ts"]),
        "deltas": {
            "save_rate_pct": ctx.save_rate_delta,
            "reach_pct": ctx.reach_delta,
            "follows": ctx.follows_delta,
            "posts_count": len(ctx.posts),
        },
        "best_hour_shift": ctx.best_hour_shift,
        "format_breakdown_delta": ctx.format_breakdown_delta,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))
```

`sort_keys=True` + `separators=(",", ":")` makes the output a
byte-stable hash given the same input.

### 7.3 Diagnostic prompt

Structured-output is enforced. The system block contains the rubric
("here is what each severity level means"); the user block contains
the post-specific data. The model returns only the JSON object; server
merges in the `baseline`/`observed` blocks before returning to the
frontend.

### 7.4 Caption schema enforcement

Use the `messages.parse()` Pydantic helper from the Anthropic SDK so
we get a typed return:

```python
class CaptionVariant(BaseModel):
    id: str
    label: str
    caption: str
    rationale: str

class CaptionScores(BaseModel):
    hook_strength: int = Field(ge=0, le=100)
    cta_presence: int = Field(ge=0, le=100)
    length_fit: int = Field(ge=0, le=100)
    overall: int = Field(ge=0, le=100)

class CaptionLLMOutput(BaseModel):
    scores: CaptionScores
    variants: list[CaptionVariant]
    notes_md: str

response = await client.messages.parse(
    model="claude-haiku-4-5",
    max_tokens=4096,
    system=[...],
    messages=[...],
    output_format=CaptionLLMOutput,
)
parsed: CaptionLLMOutput = response.parsed_output
```

### 7.5 PII handling

Captions and comments may contain user names, phone numbers, email
addresses. Before prompting:

1. **Truncate** captions to 200 chars (digest, ideas) or 500 chars
   (caption studio shows only the draft, not historical caption text).
2. **Redact** patterns matching `EMAIL_RE`, `PHONE_RE`, and `@handle`
   mentions in comment samples. Replace with `[redacted]`. The redaction
   regex pack lives in `app/ai/prompts.py::_REDACT_PATTERNS`.
3. **Drop** comments shorter than 3 chars (likely spam, low signal,
   tend to contain the most PII per token).

We document this in the first-visit disclosure copy already shown in
the frontend.

---

## 8. Scheduled jobs

### 8.1 Weekly digest job (`app/jobs/weekly_digest.py`)

Runs every Monday at 08:00 UTC via APScheduler. For each user with
≥7 days of posting history:

1. Synthesize the digest for the prior week (`week_of` = last Monday).
2. Persist to `ai_digests`.
3. Charge `ai_quota_usage` (counts against the user's monthly quota).
4. If the user has `email_digest_enabled`, hand off to the (future)
   email sender.

The scheduler entry mirrors the existing `competitor_sync` / `sentiment_batch`
pattern in `app/scheduler.py`:

```python
scheduler.add_job(
    run_weekly_digest_job,
    "cron",
    day_of_week="mon",
    hour=8,
    minute=0,
    id="weekly_digest",
)
```

The job uses the **sync** `Anthropic` client to keep parity with the
other batch jobs. Errors per user are caught and logged; one user's
LLM failure does not abort the run.

**Quota note**: scheduled-job digests are pre-charged but a separate
counter so a user's monthly limit isn't burned by automated work. Add
`auto_charged_calls` (counted) vs `user_initiated_calls` (counted
toward the quota) — implement as a `feature='digest_auto'` vs
`feature='digest'` distinction in `ai_quota_usage`.

### 8.2 Sentiment batch reuse

`sentiment_batch.py` already exists for Tier 2 comment sentiment. The
diagnostic flow optionally consumes the `comment_sentiment` table —
no changes needed there.

---

## 9. Errors, retries, and timeouts

The frontend's error taxonomy (§26 of the frontend plan) is the
authoritative copy deck. Server-side mapping:

| Exception | HTTP | `code` in detail | Frontend renders |
| --- | --- | --- | --- |
| `anthropic.AuthenticationError` (our key bad) | 500 | `unknown` | Generic error |
| `anthropic.PermissionDeniedError` | 500 | `unknown` | Generic error |
| `anthropic.RateLimitError` | 429 | `upstream_rate_limited` | "Try again in a moment" |
| `anthropic.APITimeoutError` | 504 | `upstream_timeout` | "Took too long…" + retry button |
| `anthropic.APIStatusError(5xx)` | 502 | `upstream_error` | "AI provider hiccuped" |
| User quota exhausted | 429 | `quota_exhausted` | "You've used your AI calls" |
| Post < 24h old (diagnostic) | 422 | `media_not_eligible` | "Too recent" warning |
| Insufficient data (digest) | 200 with `status: "not_enough_data"` | — | Empty banner |
| Auth invalid/expired | 401 | — | Frontend logout-redirect |

### 9.1 SDK-level retries

The Anthropic SDK auto-retries 429 and 5xx with exponential backoff
(default `max_retries=2`). We bump to `max_retries=3` for digest and
diagnostic where latency is less critical than success, leave the
default for caption studio.

### 9.2 Timeouts

- Default request timeout: 60s (digest / diagnostic). The SDK
  default is 10 minutes — we tighten it because users are watching.
- Caption studio: 20s.
- Streaming: no overall timeout, but the `keepalive` comment frame
  every 15s keeps the connection alive.

```python
client = AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    timeout=httpx.Timeout(60.0, connect=5.0),
    max_retries=3,
)
```

### 9.3 Circuit breaker (Phase F)

If five consecutive Anthropic calls fail with 5xx within 60 seconds,
flip a process-level flag that short-circuits new AI requests with
`code: "upstream_error"` for 5 minutes. Implementation: a small
`app/ai/circuit_breaker.py` module with a class-level state. This
prevents thundering-herd retries from making outages worse.

---

## 10. Quota & cost guardrails

### 10.1 Per-user monthly limit

Default `AI_MONTHLY_CALL_LIMIT = 100` in `Settings`. Per-user override
column `users.ai_monthly_call_limit` (nullable) — when null, the
default applies. The `/api/ai/quota` endpoint returns the effective
limit.

### 10.2 Pre-call check

Every cost-incurring route does:

```python
async def _enforce_quota(user_id: UUID) -> None:
    used = quota.used_this_month(user_id)
    limit = quota.effective_limit(user_id)
    if used >= limit:
        raise HTTPException(
            status_code=429,
            detail={"code": "quota_exhausted",
                    "message": "Monthly AI call limit reached."},
        )
```

Routes that don't charge quota (`/api/ai/digest/weekly` cache hit,
`/api/ai/quota`, `/api/ai/feedback`) skip the check.

### 10.3 Post-call recording

Inside `synthesize()` (§5), every successful LLM call writes to
`ai_quota_usage`:

```python
INSERT INTO ai_quota_usage
  (user_id, call_id, feature, model, input_tokens, output_tokens, cost_usd_micros)
VALUES (...)
```

`cost_usd_micros` is computed at write time from the pricing table:

| Model | Input $/1M | Output $/1M | Cache read | Cache write 5m | Cache write 1h |
| --- | --- | --- | --- | --- | --- |
| Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $3.75 | $6.00 |
| Haiku 4.5 | $1.00 | $5.00 | $0.10 | $1.25 | $2.00 |

These come from the `claude-api` skill's current model table. Update
this when models reprice. We don't recalculate retroactively.

### 10.4 Cost dashboard

A future `/api/admin/ai-cost` endpoint aggregates by user/feature/model
for finance. Out of scope for v1 but the schema supports it without
migration.

### 10.5 Provider-level guardrails

Set a soft monthly spend cap in the Anthropic dashboard; alerting goes
to the on-call channel. If usage trends suggest we'll exceed, the
circuit breaker in §9.3 buys us time to investigate.

---

## 11. Quality controls

### 11.1 Output validation

Every parser is paranoid:

- **Digest**: the LLM emits markdown + JSON. Server parses the JSON
  block, validates with `WeeklyDigestResponse(**parsed)`. If validation
  fails, the call returns a generic upstream error to the frontend
  (no partial display).
- **Diagnostic**: `output_config.format` enforces the JSON schema at
  the API. Server still validates with Pydantic as a belt-and-braces.
- **Caption**: `messages.parse()` returns a typed object directly.
- **Ideas**: similar enforced JSON schema; idea IDs are server-generated
  (UUIDs) to keep the frontend `ref_id` stable across re-renders.

### 11.2 Citation guard

For digest and diagnostic, every metric value the LLM cites should
appear in the input context. Phase F includes a post-parse check that
scans `narrative_md` for `\d+%` / `\d+×` and verifies each number is
within ±5% of a value in the input metrics. Hallucinated numbers fail
the check and the call returns `upstream_error`.

### 11.3 Eval suite

Lives in `backend/scripts/eval_ai.py`. Fixed inputs (10 sample users
across creator archetypes) → run synthesis → diff output against a
golden file. Run before any prompt change. Failures break CI.

### 11.4 Cache hit verification

Logged per call:

```python
log.info(
    "ai.call",
    feature=feature,
    model=model,
    input_tokens=usage.input_tokens,
    cache_read=usage.cache_read_input_tokens,
    cache_write=usage.cache_creation_input_tokens,
    output_tokens=usage.output_tokens,
    latency_ms=elapsed,
)
```

If `cache_read_input_tokens` is zero across consecutive same-user
calls, alert. The most common cause is `datetime.now()` accidentally
landing in the cached prefix.

---

## 12. Config + env

New `Settings` fields (`app/config.py`):

```python
class Settings(BaseSettings):
    # ... existing fields ...

    # AI / Claude
    anthropic_api_key: str | None = None
    ai_monthly_call_limit: int = 100
    ai_digest_streaming_enabled: bool = True
    ai_circuit_breaker_threshold: int = 5
    ai_circuit_breaker_window_s: int = 60
    ai_circuit_breaker_cooldown_s: int = 300
    ai_request_timeout_s: int = 60
```

`backend/.env.example` gains:

```
ANTHROPIC_API_KEY=
AI_MONTHLY_CALL_LIMIT=100
AI_DIGEST_STREAMING_ENABLED=true
```

The startup check fails closed: if `ANTHROPIC_API_KEY` is unset, the
AI router declines all routes with HTTP 503
`{"detail": "AI features not configured"}` — the rest of the app keeps
running. This matches how `sentiment_batch.py` lazy-loads the client
today.

---

## 13. Phased delivery

Mirrors the frontend phases so fullstack work lands together.

### Phase A — Foundations (1 week)

1. Add `app/ai/` skeleton (router + schemas + client wrapper) wired
   into `main.py`. Routes return 501 stubs until later phases.
2. Migrations 020–023 (digests, feedback, quota, events tables).
3. `app/ai/quota.py` + `GET /api/ai/quota` + `POST /api/ai/feedback`
   + `POST /api/telemetry`. These are the simplest endpoints and
   unblock the frontend's Phase A wiring.
4. Anthropic client singleton + smoke test against a trivial prompt.
5. Add `app/ai/client.py::synthesize()` with prompt caching helpers.
6. Eval script skeleton (`backend/scripts/eval_ai.py`) — empty cases,
   wired into the structure so adding fixtures is mechanical later.

**Done when**: frontend can call `/quota`, `/feedback`, `/telemetry`
and get real responses; the rest still return 501.

### Phase B — Weekly Digest (1 week)

1. `app/ai/digest.py::_load_context` — pull posts, deltas, format
   breakdown, best-time shift.
2. Prompt template + golden fixture.
3. `GET /api/ai/digest/weekly` (cache-only, returns 404-ish for
   missing).
4. `POST /api/ai/digest/regenerate` + quota check + persist to
   `ai_digests`.
5. `GET /api/ai/digest/stream` SSE wire-up; verify the keepalive
   comment frame defeats local proxy idle drops.
6. Citation guard (§11.2) on `narrative_md`.

**Done when**: frontend Phase B's Weekly Digest card renders against
live backend; cold load < 1.5s for a cached digest; streaming first
token < 1s.

### Phase C — Content Ideas (4–5 days)

1. `app/ai/ideas.py::_load_context` — top posts by algorithm score +
   theme extraction prompt.
2. `GET /api/ai/ideas?days=&limit=&refresh=` — uses Haiku 4.5 with
   `effort="medium"`.
3. Soft cache (6h) on `(user_id, days, limit)`; bypass with `refresh=true`.
4. Adjacent-theme flag is on the LLM output; verify against a
   set-difference between detected themes and the user's historical
   theme distribution.

**Done when**: Frontend Phase C ideas grid renders real ideas with
adjacent flags accurate.

### Phase D — Post Diagnostic (4–5 days)

1. `app/ai/diagnostic.py::_load_context` — baseline metrics, hashtag
   mix, posting-hour bucket vs heatmap.
2. Eligibility check (≥24h old) returns 422 with
   `code: "media_not_eligible"`.
3. JSON-schema-enforced output; server fills in `baseline`/`observed`
   blocks deterministically.
4. Persist to optional `ai_diagnostics` cache table (5-minute TTL —
   the same post + same baseline rarely changes within 5 minutes; saves
   re-running on accidental drawer close-reopen).

**Done when**: Frontend Phase D drawer renders verdict + factors +
recommendations from real data; `underperformed: false` rate matches
historical expectation.

### Phase E — Caption Studio (5–7 days)

1. `app/ai/caption.py::_load_context` — pull top 10 captions for the
   submitted format from `instagram_media` ordered by algorithm score.
2. `POST /api/ai/caption/suggest` using `messages.parse()` with
   `CaptionLLMOutput` Pydantic model.
3. Server-side `length_fit` calculation (don't trust the LLM for math).
4. Variant ID assignment: server-generated UUIDs (LLM is told to put a
   placeholder; server replaces).

**Done when**: Frontend Phase E dialog scores drafts and renders 3
variants reliably; `length_fit` matches a hand-calculation against the
user's top-caption median length.

### Phase F — Polish, scheduling, ops (3–4 days)

1. Weekly digest scheduled job (`app/jobs/weekly_digest.py` +
   APScheduler entry).
2. Circuit breaker (§9.3).
3. PII redaction sweep across all prompt builders (§7.5).
4. Eval suite populated with 10 golden cases.
5. Citation guard for the diagnostic output.
6. Admin cost-aggregation endpoint (`GET /api/admin/ai-cost`).
7. Update `backend/README.md` with: model selection table, prompt
   cache invariants, eval-suite run instructions.

**Total**: ~6 weeks — same envelope as the frontend, runnable in
parallel.

---

## 14. Testing

The repo has no test framework wired up (per CLAUDE.md). The AI
backend introduces three places where automated checks are mandatory:

### 14.1 Eval suite (`scripts/eval_ai.py`)

- 10 fixed user contexts per feature (digest, ideas, diagnostic,
  caption). Inputs are JSON files under `backend/scripts/ai_evals/`.
- Each case runs the prompt against the live Anthropic API and diffs
  the structured output against a golden JSON. Markdown bodies are
  *not* diffed (they're inherently non-deterministic) — we diff
  `bullets[].kind`, `factors[].severity`, `scores.*`, etc.
- Required before any prompt change merges.

### 14.2 Schema validation

Pydantic validates every LLM output. If validation fails, the route
returns `upstream_error` and logs a structured warning with the raw
text — DO NOT log the full prompt (PII risk).

### 14.3 Manual smoke list

The frontend plan §20 already enumerates manual smoke items per
surface. Backend additions:

- [ ] `GET /api/ai/quota` returns `{used: 0, limit: 100, resets_at}` for
      a fresh test user.
- [ ] `POST /api/ai/feedback` returns 204; second POST with same
      `(feature, ref_id)` overwrites cleanly (verify by reading
      `ai_feedback FINAL`).
- [ ] `POST /api/telemetry` with a batch of 16 events → rows visible
      in `ai_events`.
- [ ] `POST /api/ai/digest/regenerate` writes to `ai_digests` AND
      `ai_quota_usage`; quota counter increments.
- [ ] `POST /api/ai/digest/regenerate` 11× in a row for a user with
      `limit: 10` → the 11th returns 429 with
      `code: "quota_exhausted"`.
- [ ] `GET /api/ai/digest/stream` connection → SSE frames arrive,
      `event: done` carries a valid `WeeklyDigestResponse`.
- [ ] Killing the Anthropic key mid-stream → frontend receives
      `event: error` with `code: "upstream_error"`.
- [ ] `POST /api/ai/diagnose-post` with a media_id < 24h old →
      422 with `code: "media_not_eligible"`.
- [ ] Cache hit verification: two consecutive digest regenerates for
      the same user → second request's
      `usage.cache_read_input_tokens` > 0 in logs.

---

## 15. Observability

### 15.1 Structured logs

Every AI call logs (via `logging_config.py`):

```
feature=digest
model=claude-sonnet-4-6
input_tokens=8412
output_tokens=1240
cache_read_input_tokens=6800
cache_creation_input_tokens=0
latency_ms=4280
user_id_hash=<sha256 first 8>
```

`user_id_hash` rather than raw UUID so logs are pseudonymized — joins
to user data require operator intervention.

### 15.2 Metrics (Phase G)

If we add Prometheus later, the minimum metric set:

- `ai_calls_total{feature,model,outcome}` counter
- `ai_call_latency_seconds{feature,model}` histogram
- `ai_quota_used{user_id}` gauge (sampled hourly)
- `ai_cache_hit_ratio{feature}` derived from logs

### 15.3 Cost monitoring

The `ai_quota_usage` table is the cost ground truth. A daily aggregate
view:

```sql
CREATE VIEW v_ai_daily_cost AS
SELECT
    toDate(called_at) AS day,
    feature,
    model,
    count() AS calls,
    sum(cost_usd_micros) / 1e6 AS usd
FROM ai_quota_usage
GROUP BY day, feature, model;
```

Alert if any single day's `sum(cost_usd)` exceeds a threshold —
implement as a scheduled job that posts to Slack via
`SLACK_WEBHOOK_URL` (new setting). Threshold default: $50/day.

---

## 16. Open backend questions

These need decisions before Phase A starts.

1. **Streaming infrastructure.** Plain FastAPI `StreamingResponse`
   works locally but may need tuning behind nginx (off-the-shelf
   nginx buffers SSE). We set `X-Accel-Buffering: no` on the response,
   but if the prod proxy is something else (Cloudflare?), need to
   verify SSE passes through unbuffered.
2. **Embedding-based theme extraction.** v1 lets the LLM extract themes
   in-line. v2 may swap in a real embedding clustering step. This
   is a bigger change — defer until quality complaints emerge.
3. **Email digest delivery.** The roadmap (`instagram-analytics-roadmap.md`
   §N.18) lists email/Slack channels. This plan only covers in-app
   delivery; email needs a transactional sender + template. Out of
   scope for the Tier 4 milestone, but the `ai_digests` row is
   ready to feed it.
4. **Per-feature quota.** The plan assumes a single monthly counter.
   Product may want per-feature limits (10 captions + 5 diagnostics +
   4 digests). The `ai_quota_usage.feature` column already supports
   this; just need a config knob.
5. **Demo data fixtures.** The frontend uses local JSON fixtures for
   Phase A development. Backend equivalent: a `scripts/seed_ai_demo.py`
   that inserts a fake digest + idea set + diagnostic into the new
   tables so a developer can test the frontend without spending API
   credits. Worth building before Phase B.
6. **Multi-account support.** Tier 4 v1 is single-account per user
   (the existing model). The roadmap N.16 considers agency / multi-
   account. None of the schemas above assume single-account in
   indices, but the prompt builders all use one `instagram_profiles`
   row — would need a `(user_id, ig_user_id)` scoping pass later.

---

## 17. Definition of done

A Tier 4 backend feature is "done" when:

- The route returns the documented Pydantic response shape (matches
  the frontend contract exactly — no field drift).
- All error paths return the documented HTTP code + `detail.code`
  from §9.
- Cache hit rate ≥ 70% on the second-and-subsequent calls in a session
  (verified in logs).
- Per-call cost p95 < $0.05 (Sonnet 4.6 digest) / < $0.01 (Haiku
  caption + ideas).
- Quota counter increments correctly and rejects at limit.
- Telemetry events from the frontend land in `ai_events`.
- Eval suite has at least 5 cases for the feature and passes them all.
- Backend README documents the model selection, prompt cache invariants,
  and how to run the eval suite.

---

## 18. Glossary

- **Effort** (`output_config.effort`) — controls how much the model
  thinks and acts per call. We use `medium` by default, `high` for
  digest/diagnostic.
- **Adaptive thinking** — replacement for the deprecated
  `budget_tokens` field. Claude decides when and how much to reason.
  Required mode on Sonnet 4.6 and Haiku 4.5 going forward.
- **Cache write / read tokens** — the input-token portion served from
  Anthropic's prompt cache. Cache reads are billed at ~10% of the
  normal input rate (cost win), cache writes at ~125% (one-time
  premium that pays back after the second hit).
- **Prompt cache invariant** — any byte change anywhere in the cached
  prefix invalidates everything after it. The system prompt and
  per-user data block must be byte-stable across calls for caching to
  pay off. See `shared/prompt-caching.md` from the `claude-api` skill.
- **`media_not_eligible`** — a post is too new (< 24h) for the
  diagnostic baseline calculation to be meaningful.
- **Ref ID** — stable identifier per AI artifact for feedback and
  telemetry. `week_of` for digest, `idea.id` (server UUID) for ideas,
  `ig_media_id` for diagnostic, hash of `(draft, format)` for caption
  variants.
