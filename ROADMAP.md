# InfluenceIQ — Product Roadmap

_Last updated: 2026-06-16_

This roadmap is grounded in the actual state of the codebase (see [`docs/technical/`](docs/technical/) for the full audit). It sequences **production hardening**, **closing built-but-unshipped gaps**, **new features**, and **platform expansion**. Each item notes the rationale and, where relevant, the code it builds on.

> Conventions: 🛡 hardening · 🚀 new feature · 🐞 fix · 💰 monetization · 🧠 AI. Effort is T-shirt sized (S/M/L/XL).

---

## Vision

> **One workspace where a creator connects every platform, understands what's working, and acts on it — without leaving the app.**

The product already turns raw Instagram + YouTube data into decisions (analytics, diagnostics, competitor radar, predictions, an AI Copilot). The next chapters are: make it **trustworthy at scale**, let creators **act** (publish/schedule/reply) not just analyze, **expand platforms**, and **monetize** the tiering the codebase already hints at (`competitor_limit_standard=5` / `_premium=25`, `default_rpm_usd`).

---

## Where we are today (June 2026)

**Shipped & live**
- Auth (JWT), Instagram + YouTube OAuth, ClickHouse warehouse (~43 tables, history beyond Meta's 90-day window).
- **Instagram analytics:** Overview dashboard, Content Lab, Reels Studio, Audience DNA, Competitors, Posts, Media Kit, period comparison.
- **Engagement:** comment sentiment + topic clustering (Claude Haiku), branded-hashtag tracking, DM automation funnels, archive (data-export) import.
- **AI Copilot:** captions, ideas, hooks, repurpose, post diagnostics, weekly digest (streaming) — on Ollama `gpt-oss:120b`.
- **YouTube suite:** Retention Studio (AI annotations), Competitor Outlier Radar, Predictive Studio (30-day views/revenue), Archive Miner, Cross-Platform ROI, Smart Alerts (Golden Hour, title preflight).
- Background scheduler (~16 jobs: sync, sentiment, DM, YouTube velocity/outlier/archive).

**Built but not shipped (quick wins)**
- 🐞 **Comment Inbox** (`InboxPage`) — fully implemented incl. AI reply suggestions, but **not routed** in `App.tsx`. Unreachable today.

**Known constraints / decisions (do not revisit without cause)**
- Trending audio stays a **curated editorial list** — no private-API scraping (ban risk).
- **Email digests are intentionally skipped** — notification investments go to in-app / push instead.

---

## Guiding principles

1. **Trust before scale.** Don't onboard more users onto an unauthenticated webhook or a per-process quota. Hardening (Phase 0) gates growth marketing.
2. **Ship what's built.** The inbox, tiering scaffolding, and cost fields already exist — finish them before starting net-new.
3. **From insight → action.** Every analytic should have a "now do something" path (schedule a post, send a reply, apply a title).
4. **Cost-aware AI.** LLM spend must be observable and bounded per tier before we expand AI surfaces.

---

## Phase 0 — Production Hardening (Now → ~4 weeks) 🛡

**Goal:** make the platform safe to run multi-worker and safe to expose publicly. These are launch-blockers pulled directly from the [Security](docs/technical/SECURITY_AUDIT.md) and [Performance](docs/technical/PERFORMANCE_AUDIT.md) audits.

| # | Item | Why | Effort |
|---|---|---|---|
| 0.1 | 🛡 **WebSub HMAC verification** on `/youtube/webhook/receive` (send `hub.secret`, verify `X-Hub-Signature`, cap body size) | Currently a forgeable public endpoint that triggers DB writes + LLM jobs (S1) | M |
| 0.2 | 🛡 **Split the shared secret** into `JWT_SECRET_KEY`, `OAUTH_STATE_SECRET`, `TOKEN_ENCRYPTION_KEY` (KMS-managed); document rotation | One key compromise breaks auth + CSRF + stored OAuth tokens (S2/S3) | M |
| 0.3 | 🛡 **Global, atomic AI quota** (ClickHouse insert-then-count or Redis `INCR`); evict `_user_locks` | Per-process cap is exceeded under N workers → uncapped LLM spend (P3) | M |
| 0.4 | 🛡 **Single-leader scheduler** (leader election / dedicated scheduler process) | Multi-worker duplicates every job incl. DM sends + LLM calls (P2) | M |
| 0.5 | 💰 **Activate cost telemetry** — populate the pricing table so `ai_quota_usage.cost_usd_micros` and `/api/admin/ai-cost` are real | Can't monitor the spend Phase 0.3 is meant to bound (P10) | S |
| 0.6 | 🛡 **DM automation guardrails** — per-funnel enable confirmation, global daily cap, visible send audit | Autonomous follower DMs every 15 min is a ToS/reputation risk (S4) | M |
| 0.7 | 🐞 Quick fixes — archive miner → HTTPS (S7); stagger the 02:00 job collision (P4); remove dead `branded_hashtag_mentions` + broken `yt_velocity_tracker.main()` | Hygiene | S |

**Exit criteria:** can run ≥2 workers without duplicate jobs or quota leakage; webhook rejects forged payloads; LLM spend is visible per user/feature.

---

## Phase 1 — Close the Gaps & Make It Actionable (Q3 2026) 🚀

**Goal:** finish half-built features and add the most-requested "act, don't just analyze" capability.

| # | Item | Why | Effort |
|---|---|---|---|
| 1.1 | 🐞 **Ship the Comment Inbox** — route `InboxPage`, add to `DashboardLayout` NAV | A complete feature (sentiment filters, superfans, AI replies) is one route away | S |
| 1.2 | 🚀 **Post Scheduling & Publishing** (the planned next feature) — compose, schedule, and auto-publish IG posts/Reels via the Content Publishing API; calendar view; reuse Copilot caption/hook output as the draft source | Turns the Copilot from advisory into a publishing tool; top creator ask | XL |
| 1.3 | 🚀 **In-app notification center** (NOT email) — unify YouTube alerts, follower spikes, anomaly alerts, golden-hour into one feed + optional Web Push | Email was deliberately skipped; alerts exist but are scattered per-page | M |
| 1.4 | 🧠 **Batch the sentiment pipeline** — multiple comments per LLM call or local classifier; cache by text hash | `sentiment_batch` is 1 call/comment (≤5000/hr) — the #1 cost driver (P1) | M |
| 1.5 | 🚀 **Frontend query cache** (React Query/SWR) — dedupe shared reads (profile, quota), background refetch | No client cache today; redundant fetches across pages (P8) | M |
| 1.6 | 🧠 **Validate the prediction model** — held-out / cross-validation R², honest confidence bands | Confidence shown is in-sample/optimistic (P6) | S |

**Theme:** a creator can now go _idea → caption (Copilot) → schedule → publish → see results → reply in inbox_ without leaving the app.

---

## Phase 2 — Monetization & Multi-Account (Q4 2026) 💰

**Goal:** turn the tiering scaffolding already in config into a real business, and serve agencies/managers.

| # | Item | Why | Effort |
|---|---|---|---|
| 2.1 | 💰 **Subscription billing & plan tiers** (Stripe) — Free / Pro / Agency; enforce existing limits (`competitor_limit_*`, `ai_monthly_call_limit`) per plan; in-app upgrade | Limits and RPM constants already exist but aren't gated or billed | L |
| 2.2 | 🚀 **Workspaces & multiple accounts per user** — connect N Instagram / YouTube accounts, switch context | Today the model is one IG + one YT per user; agencies need many | L |
| 2.3 | 🚀 **Team seats & roles** — invite collaborators, read-only vs editor; the first time the app needs real authorization (currently tenant-isolation only) | Agency/brand use case; unlocks higher tier | L |
| 2.4 | 🚀 **Media-Kit sharing & export** — public shareable link + PDF export of `MediaKitPage` | Already a page; brands ask creators for a kit link/PDF | M |
| 2.5 | 🧠 **AI usage-based add-on** — buy extra Copilot calls; surfaced via the now-real cost telemetry (0.5) | Monetize the most expensive feature directly | M |

---

## Phase 3 — Platform Expansion & Deeper Intelligence (H1 2027) 🚀🧠

**Goal:** become genuinely multi-platform and push the analytics from descriptive to prescriptive.

| # | Item | Why | Effort |
|---|---|---|---|
| 3.1 | 🚀 **TikTok integration** — third platform (profile, video, insights) via the TikTok Display/Research API; extend Cross-Platform ROI to 3-way | Natural expansion; the warehouse + comparison engine already generalize | XL |
| 3.2 | 🚀 **Unified cross-platform dashboard** — one overview spanning IG + YouTube (+ TikTok): total reach, follower net, best-performing format across platforms | Cross-Platform ROI exists but is YouTube↔IG only and siloed | L |
| 3.3 | 🧠 **Prescriptive "what to post next"** — combine best-time, format-fatigue, audience-demand (question mining), and trending signals into a ranked content plan | All inputs exist as separate cards; synthesize into one recommendation | L |
| 3.4 | 🧠 **Competitor content intelligence** — cluster competitor topics/formats, detect their winning patterns, suggest gaps for you | Builds on competitor snapshots + outlier detection | L |
| 3.5 | 🚀 **Mobile PWA** — installable, push-enabled, optimized for the inbox + notification center | Creators live on mobile; alerts/replies are mobile-first actions | L |

---

## Later / Exploratory (backlog, unscheduled)

- 🚀 **Public API & user-facing webhooks** — let power users pull their warehoused data out.
- 🧠 **Self-hosted embedding model** for sentiment/topics to cut Anthropic dependency and cost.
- 🚀 **A/B thumbnail & title testing** for YouTube (builds on title-history + preflight).
- 🚀 **Brand/sponsorship marketplace** — match creators (with verified Media Kits) to brands.
- 🚀 **Story & live analytics depth** (story snapshots already captured; surface funnels/drop-off).
- 🛡 **Token revocation / refresh-token rotation** and an audit log (S5/S6).
- 🚀 **Bluesky / Threads** monitoring as low-cost early-mover platforms.

---

## Effort × Impact snapshot

| Initiative | Impact | Effort | Phase |
|---|---|---|---|
| WebSub HMAC + secret split + global quota | Critical (trust) | M each | 0 |
| Ship Comment Inbox | High | **S** | 1 |
| Post Scheduling & Publishing | Very High | XL | 1 |
| Notification center | High | M | 1 |
| Billing & plan tiers | Very High (revenue) | L | 2 |
| Workspaces / multi-account | High | L | 2 |
| TikTok integration | Very High (reach) | XL | 3 |
| Prescriptive content plan | High | L | 3 |

**Highest ROI right now:** _Ship the Comment Inbox_ — a finished, valuable feature gated only by a missing route.

---

## Success metrics (suggested)

- **Trust:** 0 forged-webhook incidents; LLM spend per active user tracked and within plan budget.
- **Activation:** % of connected users who schedule ≥1 post (Phase 1); % who reply via Inbox.
- **Retention:** WAU/MAU; weekly-digest open/engagement (in-app).
- **Revenue:** free→paid conversion; Agency-tier seat count; AI add-on attach rate.
- **Breadth:** % of users connecting ≥2 platforms.

---

## What we are deliberately _not_ doing

- ❌ Email digests (per product decision — invest in in-app/push instead).
- ❌ Private-API trending-audio scraping (ban risk — curated editorial list stays).
- ❌ Personal (non-Business/Creator) Instagram support (API doesn't expose insights).
