# PERFORMANCE_AUDIT.md

> Findings from a static read of the codebase. Each item: **Finding · Severity · Evidence · Recommended fix.** Severity is engineering judgment (High = cost/correctness risk at scale; Medium = noticeable inefficiency; Low = polish). No runtime profiling was performed (no test suite is wired up).

---

## High severity

### P1 — N+1 LLM calls in `sentiment_batch`
- **Finding:** one Anthropic Claude Haiku call **per comment**, up to 5000 per run, hourly (`jobs/sentiment_batch.py`).
- **Impact:** dominant recurring cost driver; the module's own estimate is ~$0.30 per 1k comments. At 5000/run × hourly that is the single largest LLM spend.
- **Fix:** batch multiple comments per prompt (Haiku handles dozens of short texts per call), or move to a local embedding/classifier model for sentiment and reserve the LLM for ambiguous cases. Cache by comment-text hash to avoid re-scoring identical spam.

### P2 — No multi-worker safety for the scheduler
- **Finding:** APScheduler runs in-process with no distributed lock (`scheduler.py`); comments note only one uvicorn worker should schedule.
- **Impact:** running >1 worker with `ENABLE_SCHEDULER=true` duplicates **every** job — including DM sends (`dm_funnel_runner`) and every LLM call. Correctness + cost hazard.
- **Fix:** gate the scheduler to one worker (leader election, a ClickHouse advisory lock row, or a dedicated scheduler process), or set `ENABLE_SCHEDULER` only on a single instance.

### P3 — Quota cap is per-process, not global
- **Finding:** `ai/quota.py` enforces the monthly call limit with a per-user `asyncio.Lock`; documented to not cover multi-worker races (`quota.py:36-39`).
- **Impact:** with N workers the cap can be exceeded by up to N concurrent requests; uncontrolled LLM spend.
- **Fix:** enforce atomically in ClickHouse (insert-then-count within a window) or a shared store (Redis `INCR`). Also evict `_user_locks` entries — the `defaultdict` grows unbounded per distinct user.

---

## Medium severity

### P4 — Heavy jobs collide at 02:00 UTC
- **Finding:** `account_sync` (config `hour=2`) and `yt_outlier_detection` (hardcoded `hour=2`, `scheduler.py:320`) both run at 02:00.
- **Impact:** with `max_instances:1` and a process-wide ClickHouse client, the two heavy jobs serialize or contend, partly defeating the staggering rationale.
- **Fix:** move `yt_outlier_detection` to a config field and a distinct hour (e.g. 05:00).

### P5 — Per-row mutations instead of append-only on YouTube tables
- **Finding:** `youtube_repo.py` uses real `ALTER TABLE ... DELETE/UPDATE` mutations (`:58, :294, :345`) rather than the ReplacingMergeTree append pattern used elsewhere.
- **Impact:** ClickHouse mutations are expensive (rewrite parts) and heavier than appends; inconsistent with the rest of the schema.
- **Fix:** switch to append + `FINAL`/`argMax` reads, or soft-delete flags as the IG side does.

### P6 — Predictive-model R² is in-sample
- **Finding:** `predictive_model.py:31` computes R² via `model.score(X, y)` on the **training** set.
- **Impact:** the confidence band shown to users (±25% when R²≥0.5) is optimistic — it reflects fit, not generalization.
- **Fix:** hold out a validation split or use cross-validation; widen the band accordingly. With only ≥5 samples required, prefer a conservative prior.

### P7 — Account-insights fan-out as single GETs
- **Finding:** `service.fetch_account_insights` issues per-day `total_value` metric requests as concurrent single GETs under `asyncio.Semaphore(3)` (`service.py:729`) because graph.instagram.com rejects batch requests.
- **Impact:** many round-trips per sync window; the semaphore caps concurrency at 3, so long windows are slow.
- **Fix:** this is largely a Graph API constraint; mitigate by widening windows where the API allows and caching already-synced days (the code already chunks via `_iter_windows` — verify it skips days already stored).

---

## Low severity

### P8 — No client-side request cache / dedup
- **Finding:** the frontend has no React Query/SWR; every page refetches on mount via `useState`+`useEffect` (`COMPONENT_GUIDE.md` §9). Navigating away and back re-hits the API.
- **Impact:** redundant calls (e.g. `GET /ai/quota` is fetched by `CopilotPage`, `DashboardLayout`, and `YoutubeDashboardLayout` separately; `GET /instagram/profile` by DashboardPage + DashboardLayout + others).
- **Fix:** introduce a lightweight query cache or lift commonly-shared reads (profile, quota) into context.

### P9 — Dead code shipped to the bundle
- **Finding:** `InboxPage` (6 endpoints, fully built) is imported nowhere/routed nowhere; `branded_hashtag_mentions` table (migration 017) is dead; `yt_velocity_tracker.main()` is a broken CLI stub.
- **Impact:** bundle weight + maintenance confusion.
- **Fix:** route `InboxPage` (it's a finished feature) or remove it; drop migration 017's table from queries awareness.

### P10 — AI cost telemetry is a no-op
- **Finding:** `ai/client.py` `cost_usd_micros` always returns 0 (empty pricing table, `:94-117`); `ai_quota_usage.cost_usd_micros` is always 0; `/api/admin/ai-cost` reports $0.
- **Impact:** spend is invisible — you can't monitor the very cost P1/P3 create.
- **Fix:** populate the pricing table for `gpt-oss:120b` (and the Anthropic Haiku jobs) so cost tracking works.

### P11 — Mojibake/archive parsing & XML parsing without size limits
- **Finding:** webhook `/receive` parses attacker-controllable Atom XML with no size cap (`webhook.py`); archive import caps JSON at 50MB but processes uploads synchronously in the request.
- **Impact:** large payloads block the worker thread.
- **Fix:** stream/limit XML size; move archive parsing to a background task with progress reporting.

---

## Things done well (no action)
- **ReplacingMergeTree + FINAL/argMax** read patterns are correct and `user_id`-leading `ORDER BY` prunes granules per tenant.
- **Stale-only media-insights sync** (`find_media_needing_sync`, 24h threshold) avoids re-fetching unchanged posts.
- **AI caching** (ideas 6h, diagnostics 5min, digest read-cache) and **quota-skip** for cached reads and `<3`-question mining reduce LLM calls.
- **`safe_call`** prevents pre-migration tables from 500-ing without masking real errors.
- **`useAuthedImage`** revokes object URLs on unmount, avoiding blob leaks.
