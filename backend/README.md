# Social Analytics Backend

FastAPI backend for the Social Analytics application. It handles user authentication, Instagram Graph API integration, and ClickHouse database interactions.

## Architecture

The backend follows a layered architecture to separate concerns:

- **Routers** (`app/auth/router.py`, `app/instagram/router.py`): Handle HTTP requests, input validation (via Pydantic schemas), and HTTP responses.
- **Services** (`app/auth/service.py`, `app/instagram/service.py`): Contain business logic and external API calls (e.g., Meta/Instagram API). **No database operations occur here.**
- **Repositories** (`app/repositories/`): Encapsulate all database operations. Services and routers call these instead of executing raw SQL directly.
- **Domain Models** (`app/models/`): Pure Python dataclasses representing database rows. They provide `from_row()` methods to safely construct objects from ClickHouse query results.

## Setup Instructions

### 1. Prerequisites

- Python 3.10+
- A ClickHouse Cloud instance (or local ClickHouse server)
- A Meta (Facebook) Developer App with Instagram Basic Display and Graph API enabled.

### 2. Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### 3. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and configure the following required variables:

   **ClickHouse Credentials:**
   - `CLICKHOUSE_HOST`: Your ClickHouse host (e.g., `xxxx.clickhouse.cloud`)
   - `CLICKHOUSE_PORT`: `8443` — the **HTTPS port** used by the FastAPI app (`clickhouse-connect`)
   - `CLICKHOUSE_NATIVE_PORT`: `9440` — the **secure native TCP port** used by `run_migrations.py` (`clickhouse-migrations`). These are two different protocols; both ports must be open on your ClickHouse Cloud instance (they are by default).
   - `CLICKHOUSE_USER`: Your ClickHouse user (e.g., `default` or an API key ID)
   - `CLICKHOUSE_PASSWORD`: Your ClickHouse password or API key secret
   - `CLICKHOUSE_DATABASE`: The database name (default: `social_analytics`)

   **Security:**
   - `JWT_SECRET_KEY`: A highly secure random string used to sign JWTs and encrypt access tokens. **Do not use the placeholder.**
     - *Generate one via terminal:* `python -c "import secrets; print(secrets.token_urlsafe(48))"`

   **Meta / Instagram OAuth:**
   - `META_APP_ID`: Your Meta Developer App ID.
   - `META_APP_SECRET`: Your Meta Developer App Secret.
   - `META_REDIRECT_URI`: The URL the user is redirected to after OAuth consent (must match what is configured in your Meta App dashboard, e.g., `http://localhost:5173/callback`).

### 4. Database Migrations

Before running the app, you must create the database schema in ClickHouse.

```bash
python run_migrations.py
```

This script will apply all SQL files located in the `migrations/` directory and track applied migrations using the `clickhouse-migrations` library.

### 5. Running the Development Server

Start the FastAPI development server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.
You can view the interactive API documentation at `http://localhost:8000/docs`.

---

## Managing Database Migrations

We use the [`clickhouse-migrations`](https://github.com/VVVi/clickhouse-migrations) library to manage all schema changes. It automatically tracks which migrations have been applied in a `_migrations` table inside your database, so **you never need to manually track or apply anything**.

### How it works

- All migration files live in the `migrations/` directory and are named with a sequential numeric prefix (e.g., `001_create_users.sql`, `002_create_profiles.sql`).
- When you run `python run_migrations.py`, the library checks which files have already been applied and **only runs the new ones**.
- Re-running the script is always safe — already-applied migrations are skipped automatically.

### Running Migrations

```bash
python run_migrations.py
```

Run this command whenever you add new migration files, or after first cloning the project to create the initial schema.

---

### How to Add a New Column

1. Create a new file in `migrations/` with the next sequential number, e.g., `004_add_user_avatar.sql`:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url String DEFAULT '';
   ```
2. Update the corresponding Python domain model (`app/models/user.py`) to add the new field.
3. Update the SQL queries in `app/models/queries.py` to `SELECT` or `INSERT` the new column. Make sure the column order matches what the model's `from_row()` method expects.
4. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

### How to Delete a Column

1. Create a new file, e.g., `005_drop_user_avatar.sql`:
   ```sql
   ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
   ```
2. Remove the field from the Python domain model and queries.
3. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

### How to Rename a Column

1. Create a new file, e.g., `006_rename_avatar.sql`:
   ```sql
   ALTER TABLE users RENAME COLUMN IF EXISTS avatar_url TO profile_picture_url;
   ```
2. Update the field name in the Python domain model and queries.
3. Run migrations:
   ```bash
   python run_migrations.py
   ```

---

> **Important:** Never edit or delete an existing migration file that has already been applied. The library tracks migrations by filename — changing a file's contents after it has been applied will cause it to be re-run on the next migration, which can corrupt your schema. Always create a **new** migration file for every change.

> **Note on ClickHouse type changes:** Changing a column's data type (`MODIFY COLUMN`) can be slow on large tables since ClickHouse may need to rewrite data on disk. For analytics databases it is often better to add a new column, backfill it, and drop the old one across separate migrations.

---

## Tier 4 — AI Copilot

The four AI-layer features (Weekly Digest, Content Ideas, Post Diagnostic, Caption Studio) live in `app/ai/`. Endpoints are JWT-protected and return the contracts documented in `tier4-ai-layer-frontend-plan.md` §2. Implementation details: `tier4-ai-layer-backend-plan.md`.

### Module layout

```
app/ai/
  router.py        # 9 endpoints under /api/ai/* + /api/telemetry
  admin.py         # /api/admin/ai-cost (header-keyed, Phase F)
  schemas.py       # Pydantic models for every request/response
  client.py        # AsyncAnthropic singleton, synthesize() helper,
                   #   pricing table, circuit breaker
  prompts.py       # Frozen system blocks + deterministic JSON renderers
  digest.py        # Weekly digest synthesis + SSE streaming
  ideas.py         # Content-idea generation
  diagnostic.py    # Per-post diagnosis (server-authoritative metrics)
  caption.py       # Caption scoring + variants (server-side length_fit)
  quota.py         # Per-user monthly call cap enforcement + recording
  feedback.py      # Thumbs feedback upsert
  telemetry.py     # Append-only event ingest
```

### LLM provider — Ollama Cloud

Tier 4 calls **Ollama Cloud** (`https://ollama.com`) via the official `ollama` Python SDK. The Tier 2 sentiment + topic-clustering batch jobs still use the Anthropic SDK directly (Claude Haiku) — the two providers coexist and are independent.

The model is picked via env var (`OLLAMA_MODEL`, default `gpt-oss:120b`). All four AI features (digest, diagnostic, ideas, caption) currently use the same model — split per-feature later by adding more settings fields if you want cheaper/faster routing for the lighter surfaces.

| Feature           | Model (default)  | Stream | Structured output |
| ----------------- | ---------------- | ------ | ----------------- |
| Weekly Digest     | `gpt-oss:120b`   | yes    | parser-side (model returns markdown + JSON) |
| Post Diagnostic   | `gpt-oss:120b`   | no     | `format=<json-schema>` (server-side enforcement) |
| Content Ideas     | `gpt-oss:120b`   | no     | parser-side |
| Caption Studio    | `gpt-oss:120b`   | no     | `format=<json-schema>` |

What we **don't** use that the Anthropic build did:

- **Prompt caching** — Ollama Cloud has no equivalent. `cache_read_tokens` / `cache_write_tokens` are stored as 0 in `ai_quota_usage` so the schema stays stable for future providers that do support caching.
- **Adaptive thinking / effort levels** — Anthropic-specific. The Ollama models reason in-prompt; tune via the system text if you need more or less detail.
- **`budget_tokens`** — Anthropic-only.

What stays unchanged across the swap:

- All Pydantic schemas, parsers, citation guards, server-authoritative metric merges (diagnostic baseline/observed), the length_fit math, the variant-ID assignment, the idempotent feedback table, the telemetry sink, and the monthly quota counter.
- The SSE wire format for the digest streaming endpoint (`event: token` / `event: done` / `event: error`) — frontend code unchanged.

### Env vars

```
# Tier 4 — Ollama Cloud (required for AI Copilot)
OLLAMA_API_KEY=                       # leave blank → /api/ai/* LLM routes 503
OLLAMA_HOST=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b

# Tier 2 — Claude (only used by sentiment / topic-clustering batch jobs)
ANTHROPIC_API_KEY=
```

Other AI knobs (defaults shown in `backend/.env.example`):

```
AI_MONTHLY_CALL_LIMIT=100             # per-user monthly cap
AI_REQUEST_TIMEOUT_S=120               # gpt-oss:120b can take >60s
AI_CIRCUIT_BREAKER_THRESHOLD=5        # consecutive 5xx before trip
AI_CIRCUIT_BREAKER_WINDOW_S=60        # rolling window
AI_CIRCUIT_BREAKER_COOLDOWN_S=300     # how long to short-circuit
AI_TELEMETRY_MAX_EVENTS_PER_REQUEST=200
SCHEDULER_WEEKLY_DIGEST_DAY=0         # 0 = Monday
SCHEDULER_WEEKLY_DIGEST_HOUR=8        # UTC
ADMIN_API_KEY=                        # blank disables /api/admin/*
```

### Pricing — TODO

The `_PRICING` table in `app/ai/client.py` is empty. While the table is empty, `cost_usd_micros` is computed as 0 (token counts are still recorded). When Ollama Cloud publishes per-model rates, populate `_PRICING` with `{"input": <usd_per_1m>, "output": <usd_per_1m>}` — historic rows in `ai_quota_usage` will keep their 0 cost (we never backfill).

### Migrations

Tier 4 ships migrations `020`–`025`:

| File                              | Table             | Engine                       |
| --------------------------------- | ----------------- | ---------------------------- |
| `020_create_ai_digests.sql`       | `ai_digests`      | `ReplacingMergeTree(updated_at)` keyed on `(user_id, week_of)` |
| `021_create_ai_feedback.sql`      | `ai_feedback`     | `ReplacingMergeTree(updated_at)` keyed on `(user_id, feature, ref_id)` |
| `022_create_ai_quota_usage.sql`   | `ai_quota_usage`  | `ReplacingMergeTree(updated_at)` keyed on `(user_id, called_at, call_id)` |
| `023_create_ai_events.sql`        | `ai_events`       | `MergeTree` (append-only telemetry) |
| `024_create_ai_ideas.sql`         | `ai_ideas`        | `ReplacingMergeTree(updated_at)` keyed on `(user_id, period_days, limit_n)` — 6h soft cache |
| `025_create_ai_diagnostics.sql`   | `ai_diagnostics`  | `ReplacingMergeTree(updated_at)` keyed on `(user_id, ig_media_id)` — 5min soft cache |

No cache table for caption studio — those submissions are ephemeral.

### Scheduled job: weekly digest

`app/jobs/weekly_digest.py` runs every Monday at 08:00 UTC (configurable via `SCHEDULER_WEEKLY_DIGEST_*`). For each user who posted in the trailing 30 days:

1. Skip if a cached digest for last week already exists.
2. Skip if `digest.has_enough_data()` fails.
3. Synthesize and record under `feature='digest_auto'` — does **not** count against the user's monthly user-initiated quota.

Run manually:

```bash
python -m app.jobs.weekly_digest                       # all eligible users
python -m app.jobs.weekly_digest --user-id <uuid>      # one user
python -m app.jobs.weekly_digest --week-of 2026-05-12  # specific week
```

Disable in the scheduler with `ENABLE_SCHEDULER=false` (also disables the Tier 2 jobs).

### Admin: cost dashboard

`GET /api/admin/ai-cost?since=YYYY-MM-DD&until=YYYY-MM-DD` returns daily/feature/model spend from `ai_quota_usage`. Defaults to the trailing 30 days. Auth is a static `X-Admin-Key` header — not a JWT, because admin tooling typically runs from CI. Mount conditional on `ADMIN_API_KEY` being set in `.env`.

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
     "http://localhost:8000/api/admin/ai-cost?since=2026-05-01"
```

### Eval suite

`scripts/eval_ai.py` runs per-feature evals against the live Anthropic API. Each case is a JSON file under `scripts/ai_evals/<feature>/`:

```bash
cd backend
python -m scripts.eval_ai --feature digest      # one feature
python -m scripts.eval_ai --feature all         # everything
```

The harness exits 0 without spending API credits when `ANTHROPIC_API_KEY` is unset — keeps CI green for non-AI changes. Markdown text is intentionally **not** diffed (inherently non-deterministic); cases assert against structured fields only (bullet kinds, factor counts, variant labels, score ranges).

Add cases by dropping new `.json` files in `scripts/ai_evals/<feature>/`. See the README in that directory.

### Circuit breaker

`app/ai/client.py` keeps a process-local breaker. After `AI_CIRCUIT_BREAKER_THRESHOLD` consecutive 5xx / timeout failures within `AI_CIRCUIT_BREAKER_WINDOW_S` seconds, all AI routes short-circuit with `AICircuitOpenError` (HTTP 502) for `AI_CIRCUIT_BREAKER_COOLDOWN_S` seconds. Prevents thundering-herd retries during an Anthropic outage.
