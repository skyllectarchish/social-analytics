# InfluenceIQ — Known Issues

_Last updated: 2026-06-19 · Verified against the codebase._

Standalone issue tracker — separate from [`ROADMAP.md`](ROADMAP.md) (sequencing) and [`FEATURE_STATUS.md`](FEATURE_STATUS.md) (build state). This file lists what is **broken, non-functional, or will error during integration/runtime**. Each item is confirmed in code with a file:line reference and maps to its roadmap fix where one exists.

Legend: 🔴 Blocker · 🟠 Bug · 🟡 Integration gap · ⚪ Hardening / tech-debt.

---

## 🔴 Blockers — fail at runtime or on integration

### 1. YouTube webhook has no signature verification
- **Where:** `backend/app/youtube/webhook.py:59–101`
- **Problem:** `/youtube/webhook/receive` accepts any POST. No `hub.secret` is sent on subscribe and no `X-Hub-Signature` is verified.
- **Impact:** Forgeable public endpoint that triggers DB writes + LLM jobs.
- **Fix:** Roadmap **0.1** — send `hub.secret`, verify HMAC, cap body size.

### 2. `yt_velocity_tracker.main()` is unusable
- **Where:** `backend/app/jobs/yt_velocity_tracker.py:78`
- **Problem:** Entrypoint calls `record_velocity("", "", "", 0)` with empty IDs → bails immediately at the token lookup.
- **Impact:** Dead CLI / test entrypoint; never does work.
- **Fix:** Roadmap **0.7** (remove or repair).

### 3. Multi-worker breaks the scheduler
- **Where:** `backend/app/scheduler.py:189–339` (started in `main.py` lifespan)
- **Problem:** No leader election — N uvicorn workers each start a full `AsyncIOScheduler`, so every job runs N times.
- **Impact:** N× DM sends, N× LLM charges, N² ClickHouse writes. Only safe at **1 worker** today.
- **Fix:** Roadmap **0.4** — single-leader scheduler / dedicated process.

---

## 🟠 Bugs — wrong behavior (esp. multi-worker)

### 4. AI quota is per-process, not global
- **Where:** `backend/app/ai/quota.py:40` (`_user_locks`)
- **Problem:** In-memory `asyncio.Lock` dict + read-then-write `used < limit` check. Across N workers each has its own lock.
- **Impact:** Users can exceed the monthly cap by up to N×; uncapped LLM spend.
- **Fix:** Roadmap **0.3** — global atomic quota (ClickHouse insert-then-count or Redis `INCR`).

### 5. 02:00 UTC job collision
- **Where:** `backend/app/config.py:101` (`scheduler_account_sync_hour=2`) vs `backend/app/scheduler.py:320` (`yt_outlier_detection` hardcoded `hour=2`)
- **Problem:** Two heavy jobs fire simultaneously on the process-wide ClickHouse singleton.
- **Impact:** Resource contention; `account_sync` (token refresh + bulk media/insights load) gets starved.
- **Fix:** Roadmap **0.7** — stagger the collision.

### 6. Archive miner uses plain HTTP
- **Where:** `backend/app/jobs/yt_archive_miner.py:56`
- **Problem:** `http://suggestqueries.google.com/complete/search` — Google dropped plain HTTP. The request fails and the exception is swallowed (`return []`).
- **Impact:** Archive miner **silently returns zero suggestions** — feature looks like it works but produces nothing.
- **Fix:** Roadmap **0.7** — switch to `https://`. (One-line fix.)

---

## 🟡 Integration gaps — block the next feature

### 7. Instagram publish scope is missing
- **Where:** `backend/app/constants.py:12–17` (`REQUIRED_INSTAGRAM_SCOPES`)
- **Problem:** `instagram_business_content_publish` is absent.
- **Impact:** Any Post Scheduling (Roadmap 1.2) publish call will **400 / permission-denied**; adding it later forces re-auth of all connected users.
- **Fix:** Add the scope as the first step of Roadmap **1.2**.

### 8. Deep Story analytics has no page
- **Where:** backend `router.py:1836` (`GET /instagram/stories`) + `instagram_stories` table exist; consumed only as a live strip in `frontend/src/pages/DashboardPage.tsx:133`. No dedicated `StoriesPage.tsx`.
- **Problem:** The snapshot job retains story data past Meta's 24h expiry, but **only currently-live stories are surfaced** (the Overview strip). Historical/retained story data is written and never shown.
- **Impact:** Accumulating data with no deep UI; partial feature.
- **Fix:** Roadmap **1.1b** — build a deep Story analytics page **or** retire the retention job.

---

## ⚪ Hardening / tech-debt — not a runtime error

### 9. One secret serves three purposes
- **Where:** `backend/app/config.py`, `backend/app/oauth_state.py:21`, `backend/app/crypto.py:14`
- **Problem:** `jwt_secret_key` is reused for JWT signing, OAuth-state HMAC, and token-encryption key derivation.
- **Impact:** One key compromise breaks auth + CSRF + stored OAuth tokens.
- **Fix:** Roadmap **0.2** — split into distinct keys, document rotation.

### 10. Dead `branded_hashtag_mentions` table
- **Where:** `backend/migrations/017_*` (orphaned) — superseded by `branded_hashtag_comment_mentions` in `018`
- **Problem:** Table 017 is created but never read or written; all code uses the 018 table.
- **Impact:** Maintenance debt / confusion, no runtime effect.
- **Fix:** Roadmap **0.7** — remove the dead table.

---

## Summary
| Severity | Count | Items |
|---|---|---|
| 🔴 Blocker | 3 | Webhook HMAC, velocity_tracker entrypoint, multi-worker scheduler |
| 🟠 Bug | 3 | Per-process quota, 02:00 collision, HTTP archive miner |
| 🟡 Integration gap | 2 | Publish scope, deep Story page |
| ⚪ Hardening | 2 | Single shared secret, dead table |

**Cheapest isolated fixes:** #6 (HTTP→HTTPS, one line) and #5 (stagger 02:00). Most of this list is exactly Phase 0 (0.1–0.7) in `ROADMAP.md`.
