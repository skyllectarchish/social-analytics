# ARCHITECTURE.md

> Code-level architecture audit of the **InfluenceIQ / Social Analytics** platform.
> Every claim is backed by a `file:line` reference. Generated from a full read of `backend/app/**` (~23k LOC Python) and `frontend/src/**` (~12k LOC TypeScript).

---

## 1. Project Overview

**Purpose.** A creator-analytics SaaS that pulls **Instagram** (Business/Creator) and **YouTube** account data via the official APIs, stores it in **ClickHouse** for retention beyond Meta's native 90-day window, and surfaces analytics, anomaly detection, competitor tracking, and an **AI Copilot** (caption/idea/diagnostic/digest generation). The product is branded "InfluenceIQ" on the frontend (`README.md`, `frontend/src/App.tsx`).

**Two connected platforms, one account model.** A single app user (`users` table) can connect one Instagram account (`instagram_profiles`) and/or one YouTube channel (`youtube_tokens`/`youtube_channels`). All data is tenant-scoped by `user_id` (a UUID) on every table.

**Core feature areas (by code module):**

| Area | Backend module | Frontend surface |
|---|---|---|
| Auth (register/login/session) | `app/auth/` | `LoginPage`, `RegisterPage`, `AuthContext` |
| Instagram OAuth + sync | `app/instagram/service.py` | `ConnectInstagramPage`, `CallbackPage` |
| IG analytics (dashboard, content lab, reels, audience, competitors) | `app/instagram/router.py` (59 routes) | `DashboardPage`, `ContentLabPage`, `ReelsStudioPage`, `AudienceDNAPage`, `CompetitorsPage` |
| Comment inbox + sentiment + topics | `app/instagram/router.py`, `app/jobs/sentiment_batch.py`, `app/jobs/topic_clustering.py` | `InboxPage` (⚠ unrouted) |
| DM automation funnels | `app/jobs/dm_funnel_runner.py` | `DMAutomationPage` |
| Branded hashtags | `app/instagram/branded_hashtags.py`, `app/jobs/branded_hashtag_sync.py` | `BrandedHashtags` component |
| Archive import (data export) | `app/instagram/archive.py` | `ImportPage` |
| Media kit export | `app/instagram/router.py` | `MediaKitPage` |
| AI Copilot | `app/ai/` (13 routes) | `CopilotPage` + `components/copilot/*` |
| YouTube analytics, retention, predictions, competitors, archive miner, cross-platform | `app/youtube/` (22 routes) | `Youtube*Page` |
| Background scheduling | `app/scheduler.py` + `app/jobs/*` | — |

---

## 2. Technology Stack

### Backend (`backend/`)
- **Framework:** FastAPI, app factory in `app/main.py:43`. Title `"Social Analytics API"`, version `1.0.0`.
- **Server:** uvicorn (dev: `uvicorn app.main:app --reload`).
- **Database:** ClickHouse Cloud via `clickhouse-connect` (HTTPS, `secure=True`), client singleton in `app/database.py:24`. **Thread-local** client (`threading.local()`, `database.py:21`) because FastAPI runs sync handlers in a threadpool and the HTTP client isn't shareable.
- **Config:** Pydantic Settings (`app/config.py:158`), `extra="forbid"`, `.env`-driven.
- **Auth:** JWT HS256 via `python-jose`; bcrypt (cost 12) via `passlib` (`app/auth/service.py:11`).
- **Token encryption at rest:** Fernet (AES-128-CBC + HMAC-SHA256), key = SHA-256 of `JWT_SECRET_KEY` (`app/crypto.py:12`).
- **Scheduler:** APScheduler `AsyncIOScheduler` (`app/scheduler.py:202`).
- **LLM:** **Ollama Cloud** (`https://ollama.com`) via the `ollama` Python SDK, model **`gpt-oss:120b`** (`app/ai/client.py:57`, `config.py:86`) for the Copilot; **Anthropic Claude Haiku** (`claude-haiku-4-5`) for batch sentiment/topic labeling (`app/jobs/sentiment_batch.py:32`, `topic_clustering.py:63`). ⚠ Many AI module docstrings still reference Anthropic/Claude for the Copilot — those comments are **stale**; the Copilot live path is Ollama.
- **ML:** scikit-learn (`LinearRegression` for YouTube view prediction `app/youtube/predictive_model.py:29`; TF-IDF + KMeans for topic clustering).
- **HTTP client:** `httpx` (async) for all external API calls.

### Frontend (`frontend/`)
- **Framework:** React 19 + TypeScript, Vite 6, entry `src/main.tsx:6` (`createRoot` + `StrictMode`).
- **Routing:** React Router 7 (`src/App.tsx`), `BrowserRouter`.
- **State:** **Context API only** — no Redux/Zustand/React Query. Two contexts: `AuthContext`, `PeriodComparatorContext`.
- **HTTP:** axios instance with `baseURL: "/api"` (`src/api/client.ts:12`); Vite dev proxy forwards `/api` → `http://127.0.0.1:8000`.
- **Charts:** Recharts. **Animation:** Framer Motion. **Styling:** Tailwind v4 (CSS-first, `@theme inline` in `src/index.css`, no `tailwind.config.js`).
- **Icons:** lucide-react 0.469.0 (pinned — keeps deprecated brand glyphs).

### External services
| Service | Used for | Host / SDK |
|---|---|---|
| Instagram Graph API | profile, media, insights, comments, DMs | `https://graph.instagram.com` (unversioned, `app/constants.py`) |
| Instagram OAuth | token exchange | `https://api.instagram.com/oauth/access_token` |
| Meta Graph (Facebook) | competitor business-discovery (optional system token path) | `https://graph.facebook.com/v18.0` |
| Google OAuth 2.0 | YouTube connect | `accounts.google.com` / `oauth2.googleapis.com` |
| YouTube Data API v3 | channel/video metadata | `googleapis.com/youtube/v3` |
| YouTube Analytics API v2 | metrics + retention curves | `youtubeanalytics.googleapis.com/v2` |
| PubSubHubbub (WebSub) | new-video push notifications | `pubsubhubbub.appspot.com` |
| Ollama Cloud | Copilot LLM (`gpt-oss:120b`) | `https://ollama.com` |
| Anthropic | batch sentiment/topic labeling (Claude Haiku) | Anthropic SDK |
| Wikimedia Pageviews + Google autocomplete | YouTube archive-miner trend signals | `wikimedia.org`, `suggestqueries.google.com` (⚠ HTTP) |

---

## 3. Folder Structure

```
social-analytics/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI factory, router wiring, lifespan, CORS, health
│   │   ├── config.py             # Pydantic Settings (all env vars)
│   │   ├── constants.py          # Graph/OAuth URLs, scopes, field lists
│   │   ├── database.py           # thread-local ClickHouse client singleton
│   │   ├── crypto.py             # Fernet token encryption
│   │   ├── oauth_state.py        # signed OAuth state JWTs (CSRF)
│   │   ├── exceptions.py         # AppError hierarchy
│   │   ├── exception_handlers.py # AppError → HTTP status mapping
│   │   ├── logging_config.py     # credential-redaction log filter
│   │   ├── scheduler.py          # APScheduler job registration
│   │   ├── stats.py              # significance math (z-test, Welch's t)
│   │   ├── auth/                 # router/schemas/service/dependencies
│   │   ├── instagram/            # router(59 routes)/schemas/service + archive/competitors/hashtags/branded_hashtags/trending_live
│   │   ├── ai/                   # router(13 routes)/admin/client/quota/telemetry + feature modules
│   │   ├── youtube/              # router(22 routes)/service/webhook/predictive_model
│   │   ├── jobs/                 # 16 scheduled/event-driven background jobs
│   │   ├── models/              # queries.py (centralized SQL) + 6 dataclass row-mappers
│   │   └── repositories/         # ~17 function-style data-access modules
│   ├── migrations/               # 042 numbered .sql files (idempotent DDL)
│   ├── scripts/                  # seed/eval/refresh CLI scripts
│   └── run_migrations.py         # lexical-order migration runner
├── frontend/
│   └── src/
│       ├── main.tsx, App.tsx     # entry + route table
│       ├── api/                  # client.ts, types.ts, aiStream.ts, youtubeTypes.ts
│       ├── context/              # AuthContext, PeriodComparatorContext
│       ├── hooks/                # useAuth, useAuthedImage, useSync
│       ├── lib/                  # stats, labels, telemetry, motion
│       ├── pages/                # 26 page components
│       ├── components/           # dashboard/ copilot/ youtube/ charts/ ui/ + landing
│       └── data/                 # mock.ts, labMock.ts (palette/landing fixtures)
├── docs/                         # this technical doc set + superpowers/
├── documentation/                # user-facing YouTube guides
└── frontend-old/                 # legacy JS frontend (untracked, do not edit)
```

---

## 4. Architectural Overview

### 4.1 Backend request lifecycle

```
HTTP request
  → CORS middleware (allow_origins=[settings.frontend_url], credentials=True)   main.py:49
  → Router (auth | instagram | youtube | youtube_webhook | ai | [admin])        main.py:59-68
  → Depends(get_current_user)  → decode JWT → user_repo.find_by_id              auth/dependencies.py:20
  → Handler → repository function(client, ...) → ClickHouse                      repositories/*
  → Pydantic response model
  → (on AppError) exception_handlers maps to HTTP status                         exception_handlers.py:53
```

- **Router composition** (`main.py:59-68`): `auth_router`, `instagram_router`, `youtube_router`, `youtube_webhook_router`, `ai_router` always mounted. `ai_admin_router` mounted **only when `settings.admin_api_key` is set** (`main.py:67`) — a deliberate footgun guard.
- **Lifespan** (`main.py:25-40`): startup runs `setup_logging`, pings ClickHouse (logs but does **not** abort on failure, `:31-34`), and `start_scheduler()`. Shutdown stops the scheduler and closes the client.
- **Health:** `GET /api/health` (unauthenticated) returns `{"status": "ok"|"degraded", "database": <bool>}` (`main.py:72`).

### 4.2 Layered backend design

1. **Routers** (`*/router.py`) — HTTP surface, request validation (Pydantic schemas), auth dependency, response shaping.
2. **Services** (`instagram/service.py`, `youtube/service.py`, `ai/*`) — external-API orchestration (Graph/Google/Ollama), OAuth flows.
3. **Repositories** (`repositories/*.py`) — data access. **Function-style** (no ORM/classes): each function takes the ClickHouse `client` as its first argument; the caller obtains it from `database.get_client()`. SQL lives centralized in `models/queries.py` as parameterized `{name:Type}` strings.
4. **Models** (`models/*.py`) — 6 plain `@dataclass` row-mappers (`User`, `InstagramProfile`, `InstagramMedia`, `AccountInsight`, `DemographicInsight`, `MediaInsight`). Most of the ~43 tables have **no** Python model class — rows are mapped to dicts.
5. **Jobs** (`jobs/*.py`) — background work registered with APScheduler or triggered by webhook/manual events.

**Resilience layer (`repositories/safe_query.py`).** `safe_call(fn, fallback, label)` runs a query and, **only** on schema-missing errors (matched by ClickHouse error-code substrings like `code: 60`/`47`/`36`, `safe_query.py:29-37`), returns a fallback so a not-yet-migrated table yields an empty state instead of a 500. Everything else re-raises.

### 4.3 ClickHouse storage model

- **Engine:** Most tables are `ReplacingMergeTree(<version_col>)`. Inserts are **append-only**; dedup happens during background merges. Reads use `FINAL` and/or `ORDER BY <version> DESC LIMIT 1` to get the latest row version (e.g. `GET_INSTAGRAM_PROFILE`, `GET_INSTAGRAM_TOKEN`). "Updates" = new inserts with a fresher version; soft-deletes = inserts flipping an `active`/`is_deleted` flag.
- **Append-only `MergeTree`** (no dedup) for genuine event logs: `ai_events`, `youtube_title_history`, `youtube_alerts`.
- **No FKs / no partitions.** All joins are logical via `user_id`, `ig_user_id`, `ig_media_id`, `yt_channel_id`, `video_id`, etc. (see `DATABASE.md`).
- **Inconsistency:** the YouTube repo and a few IG repo paths use real `ALTER TABLE ... DELETE/UPDATE` mutations (`mutations_sync=2`) instead of the append-only convention (`youtube_repo.py:58`, `instagram_repo.py:401`).

### 4.4 Frontend architecture

```
main.tsx (createRoot + StrictMode)
  └─ App.tsx
       ErrorBoundary
        └─ BrowserRouter
             └─ AuthProvider                  (user, loading; token in localStorage)
                  └─ PeriodComparatorProvider (compareMode → compare_to param)
                       └─ AppRoutes           (ProtectedRoute / GuestRoute / HomeRoute)
```

- **Route guards** (`App.tsx:48-73`): `ProtectedRoute` (redirects to `/login?next=…` if no user), `GuestRoute` (redirects authed users to `/dashboard`), `HomeRoute` (landing for guests). All guards show a `Splash` spinner while `AuthContext.loading`.
- **Two dashboard shells:** Instagram pages render inside `DashboardLayout`; YouTube pages inside `YoutubeDashboardLayout`. Each has its own sidebar `NAV` array and connect/disconnect/quota logic.
- **Data fetching:** every page owns its data via `useState` + `useEffect`, fetching through the axios instance — `api.get/post/...` for required data (errors bubble) or `safeGet<T>()` (resolves `null` on any error → renders `CardEmpty`). There is **no client-side cache layer**.
- **Auth token flow:** stored in `localStorage["access_token"]` (`client.ts:4`), injected by an axios request interceptor; a response interceptor normalizes FastAPI errors and redirects to `/login` on 401.
- **AI streaming:** `api/aiStream.ts` uses the `fetch` streaming API (not `EventSource`, because it must set an `Authorization` header) to consume SSE from `GET /ai/digest/stream`.

### 4.5 Background processing

APScheduler (`AsyncIOScheduler`, UTC, `max_instances:1`) registers recurring jobs at startup (gated by `ENABLE_SCHEDULER`, default true). Event-driven jobs (Golden Hour, velocity checks) are scheduled dynamically via `DateTrigger` one-shots. See `DATA_FLOW.md` §Background jobs for the full schedule table.

> ⚠ **Single-worker assumption:** there is no distributed lock. Running multiple uvicorn workers with the scheduler enabled would duplicate every job (including DM sends and LLM calls). Comments in `scheduler.py` note only one worker should schedule.

---

## 5. Architecture Diagram (text)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser (React 19 SPA — InfluenceIQ)                                   │
│  AuthContext(localStorage token) · PeriodComparatorContext             │
│  Pages → axios(/api) ─┬─ api.get/post (required)                       │
│                       ├─ safeGet (null-on-error → CardEmpty)           │
│                       └─ aiStream (fetch SSE, Bearer header)           │
└───────────────┬────────────────────────────────────────────────────────┘
                │  Vite dev proxy  /api → :8000   (Bearer JWT)
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ FastAPI (app/main.py)                                                  │
│  CORS · get_current_user (JWT) · exception_handlers                    │
│  Routers: auth · instagram(59) · youtube(22) · ai(13) · webhook · admin│
│  Services: instagram/service · youtube/service · ai/client(Ollama)     │
│  Repositories(function-style) ── parameterized SQL (models/queries.py) │
│  APScheduler ── jobs/* (account_sync, sentiment_batch, dm_funnel, yt_*) │
└───────┬───────────────────────┬───────────────────────┬───────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ ClickHouse    │   │ Instagram Graph API   │   │ Google / YouTube APIs │
│ Cloud (~43    │   │ Meta Graph (FB)       │   │ PubSubHubbub (WebSub) │
│ tables)       │   │                       │   │ Ollama · Anthropic    │
└───────────────┘   └──────────────────────┘   │ Wikimedia · autocomplete│
                                                └──────────────────────┘
```

---

## 6. Cross-cutting conventions

- **SQL is centralized** in `models/queries.py` (parameterized `{name:Type}`); repos import constants. (A few `ALTER` mutations are inlined in repos — a documented deviation.)
- **Protected endpoints** depend on `auth.dependencies.get_current_user` and scope by `current_user["id"]` / `.id`.
- **New env vars** go in both `config.py` (typed field) and `.env.example`.
- **Secrets:** `JWT_SECRET_KEY` is reused as the JWT signing key, the OAuth-state signing key, and the source of the Fernet token-encryption key (see `SECURITY_AUDIT.md`).
- **No test suite, linter, or formatter** is wired up (CLAUDE.md); `npm run build` runs `tsc -b` first, so TypeScript errors fail the build.

### Known doc drift (verified against code)
- CLAUDE.md says `get_current_user` returns a dict — it actually returns a `User` dataclass (`dependencies.py:54`); the dict comes from `User.to_response_dict()` at call sites.
- CLAUDE.md routing list omits `/dashboard/posts`, `/dashboard/import`, `/dashboard/media-kit`, `/dashboard/automation` and the entire YouTube route tree — all present in `App.tsx`.
- AI Copilot is Ollama (`gpt-oss:120b`), not Anthropic, despite stale comments throughout `app/ai/*`.
