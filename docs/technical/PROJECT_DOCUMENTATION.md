# PROJECT_DOCUMENTATION.md — Master Reference

> **InfluenceIQ / Social Analytics** — Instagram + YouTube creator-analytics platform.
> This is the master index. Deep dives live in the companion files in `docs/technical/`:
> [ARCHITECTURE](ARCHITECTURE.md) · [API_REFERENCE](API_REFERENCE.md) · [DATA_FLOW](DATA_FLOW.md) · [DATABASE](DATABASE.md) · [AUTH_FLOW](AUTH_FLOW.md) · [COMPONENT_GUIDE](COMPONENT_GUIDE.md) · [PERFORMANCE_AUDIT](PERFORMANCE_AUDIT.md) · [SECURITY_AUDIT](SECURITY_AUDIT.md)

---

## 1. Executive Summary

A creator-analytics SaaS that connects a user's **Instagram Business/Creator** account and/or **YouTube channel** via official OAuth, pulls profile/media/insights data, and persists it in **ClickHouse** to retain history beyond Meta's 90-day window. On top of the warehouse it builds: an analytics dashboard (overview, content lab, reels studio, audience DNA, competitors), a comment **sentiment/topic** pipeline, **DM automation** funnels, **branded-hashtag** tracking, IG **data-export import**, a shareable **media kit**, an **AI Copilot** (captions, ideas, hooks, repurpose, post diagnostics, weekly digest — Ollama `gpt-oss:120b`), and a full **YouTube** suite (retention studio with AI annotations, competitor outlier radar, 30-day view/revenue prediction, archive miner, cross-platform ROI, smart alerts).

- **Backend:** FastAPI + ClickHouse (~23k LOC), layered router → service → repository, parameterized SQL centralized in `models/queries.py`, APScheduler for ~16 background jobs.
- **Frontend:** React 19 + TS + Vite (~12k LOC), Context-only state, axios + `safeGet`, Recharts + Framer Motion + Tailwind v4.
- **Scale of surface:** ~100 endpoints (auth 4 · instagram 59 · ai 13 · youtube 22+2 · admin 1 · health 1); ~43 ClickHouse tables; 26 frontend pages; ~45 components.

**Top risks** (see audits): unauthenticated YouTube webhook (no HMAC), single secret reused for JWT+OAuth+token-encryption, autonomous DM sending, per-process LLM quota/scheduler (multi-worker unsafe), in-sample prediction R², zeroed cost telemetry.

---

## 2. Architecture Diagram

```
React 19 SPA ──(axios /api, Bearer JWT)──► FastAPI ──► ClickHouse Cloud (~43 tables)
  AuthContext (localStorage token)            │  └─ Repositories (parameterized SQL)
  PeriodComparatorContext (compare_to)        ├─► Instagram Graph / Meta Graph
  Pages: api.get | safeGet | aiStream(SSE)    ├─► Google OAuth + YouTube Data/Analytics
                                              ├─► PubSubHubbub (WebSub push)
                                              ├─► Ollama Cloud (gpt-oss:120b) — Copilot
                                              ├─► Anthropic (Claude Haiku) — sentiment/topics
                                              └─► APScheduler ─► jobs/* (sync, dm, yt_*)
```
Full version + layering: [ARCHITECTURE.md §4–5](ARCHITECTURE.md).

---

## 3. API Flow Diagram

```
Component/Page ──► hook/helper (api.get | safeGet | streamSSE) ──► axios(/api)
   ──► FastAPI router (Depends get_current_user) ──► service (external API) / repository (SQL)
   ──► Pydantic response ──► page useState ──► render (charts/cards/drawers)
```
Representative path (Dashboard): `DashboardPage` → `GET /instagram/insights/dashboard` → `GET_DASHBOARD_SUMMARY` (FINAL + `PIVOTED_MEDIA_METRICS`) over `account_insights`/`media_insights` → `DashboardSummary` + `ComparisonValue` → KPI cards + `ComparisonPill`. Full endpoint↔component matrix: [API_REFERENCE.md §5](API_REFERENCE.md).

---

## 4. Data Flow Diagram

```
External API/DB ─► service fetch ─► transform (pivot/stats) ─► bulk_insert ─► ClickHouse (RMT)
        ▲                                                                          │
        └────────────── scheduled job (account_sync / sentiment_batch / yt_*) ◄────┘
ClickHouse ─► repository (FINAL/argMax) ─► Pydantic ─► axios ─► page state ─► component render
```
Canonical objects traced end-to-end (session, IG connect, dashboard, authed images, sync job, comment→sentiment→topic, AI streaming, competitors, YouTube): [DATA_FLOW.md](DATA_FLOW.md).

---

## 5. Component Tree

```
App → ErrorBoundary → BrowserRouter → AuthProvider → PeriodComparatorProvider → Routes
 ├─ Landing (Nav,Hero,Features,Pricing,…)            [guests]
 ├─ DashboardLayout  ┐  Instagram pages
 │   ├─ DashboardPage (AlertsCard, PostInsightsDrawer, Sparkline, ComparisonPill)
 │   ├─ ContentLabPage (DrillDown, BrandedHashtags)
 │   ├─ ReelsStudioPage · AudienceDNAPage · CompetitorsPage · PostsPage · ImportPage · MediaKitPage · DMAutomationPage
 │   └─ CopilotPage (WeeklyDigestCard, ViralHooksPanel, ContentIdeasPanel, CaptionStudioDialog,
 │                    RepurposeCard, AudienceDemandCard, FormatFatigueCard, PostDiagnosticDrawer, AIFeedback/AIMarkdown)
 └─ YoutubeDashboardLayout  ┐  YouTube pages
     ├─ YoutubeDashboardPage · YoutubeRetentionPage (SmartRetentionChart, VideoCard)
     └─ YoutubeCompetitorsPage · YoutubePredictivePage · YoutubeArchivePage · YoutubeFunnelPage
 (InboxPage — built but UNROUTED)
```
Full tree + props/APIs per component: [COMPONENT_GUIDE.md](COMPONENT_GUIDE.md).

---

## 6. Database Relationships

~43 ClickHouse tables, all tenant-scoped by `user_id`. `users` → `instagram_profiles`(ig_user_id) → `instagram_media`(ig_media_id) → {media_insights, instagram_comments→comment_sentiment, post_hashtags, ai_diagnostics, dm_funnel_sends}; account/demographic insights hang off `ig_user_id`. `users` → `youtube_tokens`/`youtube_channels`(yt_channel_id) → `youtube_videos`(video_id) → {retention_curves, retention_annotations, title_history, predictions, alerts, archive_suggestions, competitor_velocity}; `youtube_competitors`(competitor_channel_id) → `youtube_competitor_videos`. `trending_audio` is the only global (non-tenant) table. Full ERD, column types, engines, indexes: [DATABASE.md](DATABASE.md).

Engine model: mostly `ReplacingMergeTree(<version>)` (append-only + dedup on merge; read with `FINAL`/`argMax`); 3 append-only `MergeTree` event logs (`ai_events`, `youtube_title_history`, `youtube_alerts`). Only explicit skip index: `users.idx_email` (bloom_filter).

---

## 7. Authentication Flow

JWT bearer (HS256, 24h) issued on register/login (bcrypt cost 12); session restored via `GET /auth/me`; token in `localStorage["access_token"]`, injected by axios, cleared + redirect on 401. Protected routes via `ProtectedRoute`; protected APIs via `get_current_user`. IG OAuth (Instagram Login API, single-response token+user-id, long-lived upgrade, encrypted at rest) and YouTube OAuth (Google, refresh-token-only storage) both use signed, user-bound, 10-min state JWTs for CSRF. No roles — authorization is tenant isolation by `user_id`; the only privileged surface is the key-gated admin router. Sequence diagrams + every step: [AUTH_FLOW.md](AUTH_FLOW.md).

---

## 8. State Management Overview

- **Global (React Context only):** `AuthContext` (`user`, `loading`; `login`/`register`/`logout`) and `PeriodComparatorContext` (`compareMode` → derived `compareTo`). No Redux/Zustand/React Query.
- **Out-of-React:** auth token in `localStorage`; telemetry buffer in `lib/telemetry`.
- **Local:** each page fetches and holds its own data with `useState`/`useEffect` via `api.get`/`safeGet`. No shared client cache (see [PERFORMANCE_AUDIT P8](PERFORMANCE_AUDIT.md)).

---

## 9. Business Logic Overview

- **Comparison math** (`app/stats.py`): `pct_delta`, two-proportion z-test (`two_prop_z`, n≥30), Welch's t (`welchs_t`, n≥3), `is_significant` (|stat|≥1.96). Drives `compare_to` `ComparisonValue.significant` flags. Frontend mirror: `lib/stats.pctDelta`.
- **Insights pivot** (`PIVOTED_MEDIA_METRICS` in `queries.py`): long `media_insights` rows → wide metric columns for dashboards.
- **Sentiment/topics:** Claude Haiku per-comment classification → KMeans clustering (k=min(12,max(4,n//60))) → Haiku cluster labels.
- **Anomaly alerts:** baseline vs window engagement comparison (`GET_POST_ENGAGEMENT_BASELINE`/`_WINDOW`).
- **YouTube prediction:** sklearn `LinearRegression` on (4h views, 4h avg watch, CTR) → 30-day views; fallback `4h_views × 180`; revenue via `DEFAULT_RPM_USD`.
- **Outlier detection:** competitor video ≥ 3× channel average → LLM "reverse-engineering" blurb.
- **Hashtag extraction** (`instagram/hashtags.py`): multilingual regex → `post_hashtags` for combo/trend analytics.
- **Archive parsing** (`instagram/archive.py`): IG data-export ZIP/JSON, `fix_mojibake` reverses Meta's latin-1-escaped UTF-8.

---

## 10. Known Issues

| # | Issue | Where | Sev |
|---|---|---|---|
| 1 | YouTube webhook lacks HMAC verification (forgeable public endpoint) | `youtube/webhook.py:59` | High |
| 2 | `JWT_SECRET_KEY` reused for JWT + OAuth state + token encryption | `crypto.py`, `oauth_state.py`, `auth/service.py` | High |
| 3 | LLM quota + scheduler are per-process (multi-worker unsafe → over-limit, duplicate DM/LLM) | `ai/quota.py`, `scheduler.py` | High |
| 4 | `sentiment_batch` = 1 LLM call/comment (≤5000/hr) | `jobs/sentiment_batch.py` | High (cost) |
| 5 | Autonomous DM sending to followers every 15 min | `jobs/dm_funnel_runner.py` | Med |
| 6 | Prediction R² is in-sample (optimistic confidence) | `youtube/predictive_model.py:31` | Med |
| 7 | YouTube repo uses heavy `ALTER` mutations vs append-only convention | `youtube_repo.py` | Med |
| 8 | AI cost telemetry always $0 (empty pricing table) | `ai/client.py:94` | Med |
| 9 | `InboxPage` fully built but unrouted (dead feature) | `App.tsx` | Low |
| 10 | Insecure `http://` for archive-miner autocomplete | `jobs/yt_archive_miner.py:56` | Low |
| 11 | No client-side request cache → duplicate fetches (quota/profile) | frontend pages | Low |
| 12 | Doc drift: Copilot is Ollama not Anthropic; `get_current_user` returns dataclass not dict; CLAUDE.md route list incomplete | various | Info |

---

## 11. Recommended Improvements

1. **Security:** add WebSub HMAC (S1); split the three secret roles and manage the token-encryption key separately (S2/S3); add DM-automation guardrails + visible audit (S4); switch archive-miner to HTTPS (S7); consider token revocation (S6).
2. **Scale/cost:** make the scheduler single-leader and the quota global (Redis/CH atomic) before running >1 worker (P2/P3); batch `sentiment_batch` LLM calls or move to a local classifier (P1); populate the cost pricing table so spend is observable (P10).
3. **Correctness:** validate the prediction model out-of-sample and widen confidence bands (P6); stagger the 02:00 job collision (P4).
4. **Consistency:** migrate YouTube tables to the append-only RMT pattern (P5); centralize the inlined `ALTER` SQL into `queries.py` per the project convention.
5. **Cleanup:** route or remove `InboxPage`; drop dead `branded_hashtag_mentions` and the broken `yt_velocity_tracker.main()` stub; add a frontend query cache and lift shared reads (profile, quota) into context.
6. **Docs:** reconcile CLAUDE.md (Copilot provider = Ollama; `get_current_user` returns a `User` dataclass; add the missing `/dashboard/*` and YouTube routes).

---

## 12. Quick-start orientation for a new developer

1. Read [ARCHITECTURE.md](ARCHITECTURE.md) §3–4 for the layout and request lifecycle.
2. To add a backend endpoint: add SQL to `models/queries.py`, write a repository function (takes `client` first arg), add a route in the relevant `router.py` with `Depends(get_current_user)`, scope by `current_user.id`, and a Pydantic schema. See [API_REFERENCE.md](API_REFERENCE.md) for conventions.
3. To add a frontend page: create under `pages/`, render inside `DashboardLayout`/`YoutubeDashboardLayout`, add the route in `App.tsx` and a `NAV`/`YT_NAV` entry, fetch with `safeGet` (null → `CardEmpty`). See [COMPONENT_GUIDE.md](COMPONENT_GUIDE.md).
4. Database changes: add a numbered `migrations/NNN_*.sql` (idempotent `IF NOT EXISTS`), run `python run_migrations.py`. See [DATABASE.md](DATABASE.md).
5. Before deploying: review [SECURITY_AUDIT.md](SECURITY_AUDIT.md) and [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) — especially the single-worker scheduler/quota constraint.
