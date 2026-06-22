# InfluenceIQ — Feature Status

_Last updated: 2026-06-19 · Verified against the codebase, not just the roadmap._

Companion to [`ROADMAP.md`](ROADMAP.md) — that file owns **sequencing & rationale**; this one owns **current build state**. This is the at-a-glance ledger of **what's built**, **what's built but not reachable**, and **what's still remaining**. Legend: ✅ shipped & live · 🟡 built but not shipped (gap) · ⬜ not started.

---

## ✅ Added (shipped & live)

### Platform / foundation
| Feature | Where |
|---|---|
| ✅ Auth — JWT bearer (HS256), bcrypt passwords | `backend/app/auth/` |
| ✅ Instagram OAuth (IG Login API, direct — no FB Page) | `backend/app/instagram/service.py` |
| ✅ YouTube OAuth | `backend/app/youtube/` |
| ✅ ClickHouse warehouse (~43 tables, history beyond Meta's 90-day window) | `backend/migrations/*.sql` |
| ✅ Background scheduler — APScheduler, ~12 jobs (10 recurring + 2 per-event) | `backend/app/scheduler.py` |

### Instagram analytics
| Feature | Route |
|---|---|
| ✅ Overview dashboard | `/dashboard` |
| ✅ Posts | `/dashboard/posts` |
| ✅ Content Lab | `/dashboard/content` |
| ✅ Reels Studio | `/dashboard/reels` |
| ✅ Audience DNA | `/dashboard/audience` |
| ✅ Competitors | `/dashboard/competitors` |
| ✅ Media Kit (routed, not in sidebar NAV) | `/dashboard/media-kit` |
| ✅ Period comparison | within Overview |

### Engagement
| Feature | Where |
|---|---|
| ✅ Comment sentiment + topic clustering (Claude Haiku) | `jobs/sentiment_batch.py`, `jobs/topic_clustering.py` |
| ✅ Branded-hashtag tracking | `jobs/branded_hashtag_sync.py` |
| ✅ DM automation funnels (with guardrails: per-run cap 25, 7-day window, dedup, word-boundary, no-retro) | `jobs/dm_funnel_runner.py`, `/dashboard/automation` |
| ✅ Archive (data-export) import | `instagram/archive.py`, `/dashboard/import` |
| ✅ **Comment Inbox** (sentiment filters, superfans, AI replies) — routed 2026-06-18 | `/dashboard/inbox` |

### AI Copilot (Ollama `gpt-oss:120b`)
| Feature | Route |
|---|---|
| ✅ Captions / ideas / hooks / repurpose / post diagnostics / weekly digest (streaming) | `/dashboard/copilot` |

### YouTube suite
| Feature | Route |
|---|---|
| ✅ Dashboard | `/youtube` |
| ✅ Retention Studio (AI annotations) | `/youtube/retention` |
| ✅ Competitor Outlier Radar | `/youtube/competitors` |
| ✅ Predictive Studio (30-day views/revenue) | `/youtube/predict` |
| ✅ Archive Miner | `/youtube/archive` |
| ✅ Cross-Platform ROI / funnel | `/youtube/funnel` |
| ✅ Smart Alerts (Golden Hour, title preflight) | scheduler / per-event jobs |

---

## 🟡 Built but not shipped (gaps to close)

| Feature | State | Action |
|---|---|---|
| 🟡 **Story analytics** | Backend complete — tables `instagram_stories` (migration 033) + `story_snapshot_jobs` (041), snapshot job runs every 4h. **No frontend** — `StoriesPage.tsx` was dropped in a refactor. | Rebuild the page **or** formally retire the backend before it bit-rots. (Roadmap 1.1b) |
| 🟡 **Tiering / billing scaffolding** | Constants exist (`competitor_limit_standard=5`, `_premium=25`, `ai_monthly_call_limit=100`, `default_rpm_usd=3.0`) but **not gated or billed**. | Enforce per-plan + add Stripe. (Roadmap 2.1) |
| 🟡 **AI cost telemetry** | `ai_quota_usage` table + `/api/admin/ai-cost` endpoint exist, but the pricing table isn't populated, so `cost_usd_micros` is empty. | Populate pricing → make spend real. (Roadmap 0.5) |

---

## ⬜ Remaining (not started)

### Phase 0 — Production hardening 🛡 (launch-blockers)
| # | Feature | Verified gap |
|---|---|---|
| ⬜ 0.1 | WebSub HMAC verification on `/youtube/webhook/receive` | Confirmed: no `hub.secret` sent, no `X-Hub-Signature` check — forgeable public endpoint |
| ⬜ 0.2 | Split the shared secret (JWT / OAuth-state / token-encryption) | Confirmed: one `jwt_secret_key` serves all three (`oauth_state.py`, `crypto.py` derive from it) |
| ⬜ 0.3 | Global, atomic AI quota | Confirmed: in-memory per-process `_user_locks` — exceeded under N workers |
| ⬜ 0.4 | Single-leader scheduler | Multi-worker duplicates every job |
| ⬜ 0.5 | Activate cost telemetry (see 🟡 above) | Pricing table unpopulated |
| ⬜ 0.6 | DM guardrails — **finish**: global daily cap + per-funnel confirmation + send-audit UI | Per-run cap exists; daily/global cap + confirmation + audit do not |
| ⬜ 0.7 | Quick fixes — archive miner→HTTPS; stagger 02:00 collision; remove dead code | — |

### Phase 1 — Close gaps & make it actionable 🚀
| # | Feature | Status |
|---|---|---|
| ✅ 1.1 | Ship Comment Inbox | Done 2026-06-18 |
| 🟡 1.1b | Resolve Story analytics (rebuild or retire) | Backend exists, no UI |
| ⬜ 1.2 | **Post Scheduling & Publishing** (compose/schedule/auto-publish IG via Content Publishing API + calendar) | Not started. Prereq: add `instagram_business_content_publish` scope (not currently requested → forces re-auth) + public media hosting infra |
| ⬜ 1.3 | In-app notification center (+ Web Push, NOT email) | No notification UI exists |
| ⬜ 1.4 | Batch the sentiment pipeline | Currently 1 LLM call/comment — #1 cost driver |
| ⬜ 1.5 | Frontend query cache (React Query/SWR) | Confirmed: not installed; manual axios + `safeGet` only |
| ⬜ 1.6 | Validate the prediction model (held-out R², honest bands) | Confidence is in-sample/optimistic |

### Phase 2 — Monetization & multi-account 💰
| # | Feature |
|---|---|
| ⬜ 2.1 | Subscription billing & plan tiers (Stripe) — enforce existing limits |
| ⬜ 2.2 | Workspaces & multiple accounts per user |
| ⬜ 2.3 | Team seats & roles (first real authorization layer) |
| ⬜ 2.4 | Media-Kit sharing & export (public link + PDF) |
| ⬜ 2.5 | AI usage-based add-on (buy extra Copilot calls) |

### Phase 3 — Platform expansion & deeper intelligence 🚀🧠
| # | Feature |
|---|---|
| ⬜ 3.1 | TikTok integration (3rd platform) |
| ⬜ 3.2 | Unified cross-platform dashboard (IG + YT + TikTok) |
| ⬜ 3.3 | Prescriptive "what to post next" |
| ⬜ 3.4 | Competitor content intelligence |
| ⬜ 3.5 | Mobile PWA (installable, push) |

### Backlog (unscheduled)
⬜ Public API & user-facing webhooks · ⬜ Self-hosted embedding model · ⬜ A/B thumbnail & title testing · ⬜ Brand/sponsorship marketplace · ⬜ Story & live analytics depth · ⬜ Token revocation / refresh rotation + audit log · ⬜ Bluesky / Threads monitoring

---

## Explicitly NOT doing
- ❌ Email digests (invest in in-app/push instead)
- ❌ Private-API trending-audio scraping (ban risk — curated editorial list stays)
- ❌ Personal (non-Business/Creator) Instagram support (API doesn't expose insights)

---

## Snapshot
| Bucket | Count |
|---|---|
| ✅ Shipped & live | ~30 features across 5 areas |
| 🟡 Built but not shipped | 3 (Story analytics, tiering scaffolding, cost telemetry) |
| ⬜ Remaining | Phase 0: 7 · Phase 1: 5 · Phase 2: 5 · Phase 3: 5 · Backlog: 7 |

**Highest ROI now:** resolve Story analytics (rebuild or retire), then begin Phase 0 hardening before any growth push.
