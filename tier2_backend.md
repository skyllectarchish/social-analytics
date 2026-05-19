# Tier 2 Backend — Implementation Summary

This document covers the backend additions for every Tier 2 feature. It mirrors the structure of the per-feature plans (`tier2_period_over_period.md`, `tier2_audience_growth_drivers.md`, `tier2_hashtag_performance.md`, `tier2_comment_sentiment.md`, `tier2_competitor_benchmarking.md`) but focuses only on the server side — the frontend hooks/components were built first and are documented in those plans.

All endpoints follow the existing repo conventions:
- SQL is centralised in `backend/app/models/queries.py` using ClickHouse `{name:Type}` placeholders.
- Repos in `backend/app/repositories/` are thin wrappers over `client.query(...)`.
- Routes live in `backend/app/instagram/router.py` and depend on `auth.dependencies.get_current_user`.
- Schemas live in `backend/app/instagram/schemas.py`.
- Tables are `ReplacingMergeTree(<timestamp>)`; reads use `FINAL` + `ORDER BY <timestamp> DESC LIMIT 1` where freshness matters.

---

## 1. Shared infrastructure

### `backend/app/stats.py` — significance helpers
| Symbol | Purpose |
|---|---|
| `pct_delta(current, prior)` | Percent change. Returns `None` when no prior is given **or** when `prior == 0 and current != 0` (infinite delta isn't JSON-representable). Returns `0.0` when both are 0. |
| `two_prop_z(p1, n1, p2, n2)` | Z-statistic for two-proportion test. Returns `0.0` when either n < 30 (floor matches the doc's "small_sample" gate). |
| `welchs_t(mean_a, var_a, n_a, mean_b, var_b, n_b)` | Welch's t-statistic for count metrics with known per-period variance. |
| `is_significant(statistic)` | True iff `|t| ≥ 1.96` (95% two-tailed). |
| `rate_significance(cur_count, cur_denom, prior_count, prior_denom)` | Convenience wrapper for ratio metrics. Returns `None` when any input is missing / denominators are non-positive / either sample is too small to test. Callers wire this straight into `ComparisonValue.significant`. |

### `backend/app/repositories/comparison.py` — period-over-period helper
| Symbol | Purpose |
|---|---|
| `COMPARE_TO_PATTERN` | Regex usable as `Query(..., pattern=COMPARE_TO_PATTERN)`. |
| `resolve_compare_window(compare_to, since, until)` | Translates the wire value (`prev_period`, `prev_year`, `YYYY-MM-DD,YYYY-MM-DD`) to a concrete `(since, until)`. |
| `with_comparison(loader, since, until, compare_to)` | Runs `loader` for the current and (optionally) prior window. |

### `backend/app/instagram/schemas.py` — `ComparisonValue`
```python
class ComparisonValue(BaseModel):
    current: float
    prior: float | None = None
    delta_pct: float | None = None
    significant: bool | None = None
```

Two response models now carry a `comparisons: dict[str, ComparisonValue] | None` map so the FE's `ComparisonMetricPill` can render delta + significance without re-doing the math:

| Endpoint | Map keys | Significance computation |
|---|---|---|
| `/insights/dashboard` | `total_views`, `total_reach`, `total_interactions`, `total_accounts_engaged`, `net_follower_growth` | None for all — pure aggregate counts without per-day variance. FE renders delta only. |
| `/insights/algorithm-metrics` | `total_saves`, `total_shares`, `total_reach` (count) + `account_save_rate`, `account_share_rate` (rate) | 2-prop z-test on the rate metrics (denominator = period reach). Counts get `significant=None`. |

Existing scalar fields stay as plain numbers — the `comparisons` map is purely additive, so existing FE consumers reading `data.total_views` keep working. The FE's `unwrapComparison` helper accepts both shapes, so call sites that swap to `ComparisonMetricPill` just pass `data={data.comparisons?.total_views ?? data.total_views}`.

All other Tier 1 / Tier 2 endpoints continue to surface comparisons via the additive `prior: <Self> | None = None` pattern — the FE can derive deltas itself with its own `pctDelta` helper when needed. Promoting more endpoints to per-metric `ComparisonValue` maps follows the same pattern shown above.

---

## 2. F5 — Audience Growth Drivers

### Queries (`app/models/queries.py`)
| Name | Purpose |
|---|---|
| `GET_DAILY_FOLLOWS` | Per-day net follower change from `account_insights` (metric `follows_and_unfollows`). |
| `GET_POSTS_FOR_ATTRIBUTION` | Post + reach + (optional) non-follower reach within the window. |

### Repo (`app/repositories/insights_repo.py`)
```python
find_growth_drivers(client, user_id, ig_user_id, since, limit=10) -> list[dict]
```
Attribution model: for each day with `daily_follows > 0`, posts on `day` or `day-1` split the gain in proportion to `non_follower_reach` (falls back to `reach` if the breakdown isn't synced). Returns: `ig_media_id`, `media_product_type`, `permalink`, `thumbnail_url`, `caption`, `reach`, `non_follower_reach`, `attributed_follows`, `conversion_rate_pct`.

### Endpoints
```
GET /api/instagram/insights/growth-drivers
    ?days=90&limit=10
→ GrowthDriversResponse {
    period_days: int,
    drivers: [GrowthDriverItem, ...]
}

GET /api/instagram/insights/follower-quality/spikes      # Tier 1 endpoint, augmented
    ?days=90&threshold=50
→ FollowerSpikesResponse {
    period_days, spike_threshold,
    spikes: [FollowerSpike {
        spike_date, follows_change, interactions,
        interaction_per_follow_ratio, is_suspicious,
        candidate_drivers: [GrowthDriverItem, ...]    # ← F5.5 addition
    }]
}
```

The spikes augmentation reuses `_attribute_drivers_for_day` (extracted from `find_growth_drivers`) via the new repo helper `find_candidate_drivers_for_spikes`, which batches one `GET_POSTS_FOR_ATTRIBUTION` query across the spike window and splits attribution per day. Attribution failures are logged but don't fail the spike response — the chart still renders with empty `candidate_drivers` arrays.

### Migrations: **none required** (pure SQL on existing tables).

---

## 3. F2 — Hashtag Performance

### Migration 008 — `post_hashtags`
```sql
CREATE TABLE IF NOT EXISTS post_hashtags (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_media_id String,
    hashtag String,                       -- lowercase, no leading #
    position UInt16,
    timestamp DateTime,
    media_product_type String DEFAULT '',
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, hashtag, ig_media_id);
```

### Extraction (`app/instagram/hashtags.py`)
```python
extract_hashtags(caption: str | None) -> list[tuple[str, int]]
```
Unicode-aware (matches Hindi/Spanish/Korean tags), case-folded, ignores `@mentions`.

`instagram_repo.bulk_insert_media` calls `_insert_hashtags_for_media` after every media insert; the helper silently no-ops if `post_hashtags` doesn't yet exist (so deploying schema and code separately is safe).

### Backfill — `backend/scripts/backfill_hashtags.py`
```
cd backend
python -m scripts.backfill_hashtags
```
Idempotent (ReplacingMergeTree on `(user_id, hashtag, ig_media_id)`).

### Queries
| Name | Purpose |
|---|---|
| `GET_TOP_HASHTAGS` | Per-hashtag avg reach + engagement + save rate, gated by `min_uses`. |
| `GET_HASHTAG_TREND` | Weekly engagement series for one hashtag. |
| `GET_HASHTAG_COMBOS` | Top co-occurring pairs ranked by combined engagement (uses `h1.hashtag < h2.hashtag` to deduplicate). |

### Repo functions
```python
find_top_hashtags(client, user_id, since, limit, min_uses) -> list[dict]
find_hashtag_trend(client, user_id, tag, since) -> list[dict]
find_hashtag_combos(client, user_id, since, min_uses) -> list[dict]
```

### Endpoints
```
GET /api/instagram/insights/hashtags
    ?days=90&limit=30&min_uses=2&compare_to=prev_period
→ HashtagsResponse { period_days, data: [HashtagPerformanceItem], prior? }

GET /api/instagram/insights/hashtags/trend
    ?tag=morningroutine&days=180&compare_to=prev_year
→ HashtagTrendResponse { tag, period_days, data: [HashtagTrendPoint], prior? }

GET /api/instagram/insights/hashtags/combos
    ?days=90&min_uses=2&compare_to=prev_period
→ HashtagComboResponse { period_days, data: [HashtagComboItem], prior? }
```

All three accept the same `compare_to` (`prev_period` | `prev_year` | `YYYY-MM-DD,YYYY-MM-DD`) as the Tier 1 endpoints and populate `prior` with a same-shape response when set. The underlying queries gained `AND h.timestamp <= {until:DateTime}` filters so the prior window is scoped correctly — without that, the prior query would return everything from `prior_since` to "now" and over-count.

---

## 4. F4 — Comment Sentiment + Topics

### Migrations
| File | Table |
|---|---|
| `009_create_instagram_comments.sql` | `instagram_comments` — top-level + reply comments per media |
| `010_create_comment_sentiment.sql` | `comment_sentiment` — per-comment sentiment / is_question / is_spam / embedding |
| `011_create_comment_topics.sql` | `comment_topics` — clustered topic labels per period |
| `014_add_comment_topics_is_question.sql` | `ALTER comment_topics ADD is_question UInt8` — tags clusters where the majority of comments are questions |

### Comment sync
`app/instagram/service.py::fetch_comments_for_media(media_id, token, max_pages=5)` paginates `/{media-id}/comments` with `replies{...}` and flattens both into a single list. Replies are tagged with `_parent_id`. The repo inserts them via `comment_repo.bulk_insert_comments`.

> Wiring this into `_run_insights_sync` is a one-line addition (for each media id, fetch comments → bulk_insert_comments). Left to the F4 cutover so it can ship behind a flag.

### Sentiment batch job — `app/jobs/sentiment_batch.py`
- Pulls comments missing a sentiment row (`GET_COMMENTS_PENDING_SENTIMENT`).
- Calls **Claude Haiku 4.5** per comment with a strict JSON schema (`sentiment`, `score`, `is_question`, `is_spam`).
- Writes results to `comment_sentiment` (model column `claude-haiku-4-5`).
- Anthropic key reads from `settings.anthropic_api_key` (added to `app/config.py` + `.env.example`).
- Run with `python -m app.jobs.sentiment_batch` (or schedule via cron at 03:00 UTC).

### Topic clustering job — `app/jobs/topic_clustering.py`
- Pulls non-spam comments in the lookback window along with each comment's `is_question` flag.
- TF-IDF + KMeans (`scikit-learn`); k chosen as `min(12, max(4, n/60))`.
- Labels each cluster with one Claude Haiku call from 5 representative comments.
- Tags the cluster `is_question=True` when ≥50% of its members were flagged `is_question=1` by the sentiment job (threshold in `QUESTION_CLUSTER_THRESHOLD`).
- Writes to `comment_topics` (ReplacingMergeTree on `(user_id, cluster_id, period_start)`).
- Run weekly (`python -m app.jobs.topic_clustering`).

`find_topics` reads the stored `is_question` flag and additionally applies a label heuristic (`who/what/where/when/why/how/which/can/could/...` starter or `?` in label) as a fallback for rows written before migration 014 added the column. This means the FE's question icon lights up immediately on existing data without waiting for a re-cluster.

> The plan calls for proper embedding-based clustering. TF-IDF is a deliberate v0 — replace `_vectorise` with a Voyage/OpenAI embedding fetch once that pipeline lands.

### Queries
| Name | Purpose |
|---|---|
| `GET_SENTIMENT_SUMMARY` | Total comments per bucket (excludes spam). |
| `GET_SENTIMENT_TREND` | Weekly stacked positive/neutral/negative. |
| `GET_TOPICS` | Latest cluster rows per user. |
| `GET_QUESTION_POSTS` | Posts ranked by `is_question` count. |
| `GET_MEDIA_SENTIMENT_DISTRIBUTION` | One-post sentiment counts. |
| `GET_MEDIA_SENTIMENT_SAMPLES` | Up to 3 representative comments per bucket (by like_count). |
| `GET_COMMENTS_PENDING_SENTIMENT` | Comments without a sentiment row yet — used by the batch job. |

### Repo (`app/repositories/comment_repo.py` + insights_repo)
```python
# Comment-corpus side
comment_repo.bulk_insert_comments(client, user_id, ig_media_id, comments)
comment_repo.find_comments_pending_sentiment(client, limit)
comment_repo.bulk_insert_sentiment(client, rows_in)
comment_repo.replace_topics_for_user(client, user_id, period_start, period_end, clusters)

# Aggregation side (insights_repo)
find_sentiment_distribution(client, user_id, since)
find_sentiment_trend(client, user_id, since)
find_topics(client, user_id, since)
find_question_posts(client, user_id, since, limit)
find_media_sentiment_distribution(client, user_id, ig_media_id)
find_media_sentiment_samples(client, user_id, ig_media_id, per_bucket=3)
```

### Endpoints
```
GET /api/instagram/insights/sentiment
    ?days=90
→ SentimentSummaryResponse {
    period_days, total,
    distribution: { positive, neutral, negative },
    trend: [{ week_start, positive, neutral, negative }]
}

GET /api/instagram/insights/sentiment/topics
    ?days=90
→ TopicsResponse { period_days, topics: [{ cluster_id, label, size, is_question }] }

GET /api/instagram/insights/sentiment/questions
    ?days=90&limit=10
→ QuestionPostsResponse { period_days, posts: [QuestionPostItem] }

GET /api/instagram/insights/sentiment/media/{media_id}
→ MediaSentimentResponse {
    ig_media_id, total,
    distribution: { positive, neutral, negative },
    samples: [{ ig_comment_id, username, text, sentiment }]
}
```

---

## 5. F3 — Competitor Benchmarking

### Migrations
| File | Table |
|---|---|
| `012_create_competitor_handles.sql` | `competitor_handles` — user-tracked handles (soft-deleted via `active=0`) |
| `013_create_competitor_snapshots.sql` | `competitor_snapshots` — one row per (user, handle, day) |
| `015_add_competitor_failure_tracking.sql` | `ALTER competitor_handles ADD consecutive_failures UInt8` — counts back-to-back failed daily syncs so we can auto-disable handles whose owners went private |

### Business Discovery — `app/instagram/competitors.py`
```python
async def fetch_competitor_snapshot(my_ig_user_id, handle, token) -> dict | None
def derive_snapshot_metrics(business_discovery: dict) -> dict
```
Uses `business_discovery.username(<handle>){…}` on `/{my-ig-user-id}` (the authenticated user's existing token). Returns `None` for handle-not-found / private / personal accounts. `derive_snapshot_metrics` reduces Meta's payload into the row shape we store:
- `followers_count`, `media_count`
- `posts_last_7d`, `reels_last_7d`, `carousels_last_7d`
- `avg_likes_last_25`, `avg_comments_last_25`, `avg_engagement_rate_pct`

Engagement is computed `(likes + comments) / followers` over the last 25 posts. The disclaimer in the frontend already calls out that this differs from the reach-based engagement we compute for the authenticated user.

### Repo — `app/repositories/competitor_repo.py`
```python
list_handles(client, user_id) -> list[dict]                  # includes consecutive_failures
count_active_handles(client, user_id) -> int
upsert_handle(client, user_id, handle, ig_user_id, display_name, profile_picture_url, active=True)
soft_delete_handle(client, user_id, handle)
record_failure(client, user_id, handle) -> int               # returns new count
record_success(client, user_id, handle)
insert_snapshot(client, user_id, handle, snapshot_date, metrics)
latest_snapshots(client, user_id) -> dict[handle, dict]      # uses argMax(...) for FINAL-free reads
timeline(client, user_id, since_date) -> dict[handle, list[(date, followers)]]
```
Constants: `MAX_ACTIVE_COMPETITORS = 10`, `MAX_CONSECUTIVE_FAILURES = 3`.

All "edit one column" paths (`upsert_handle`, `soft_delete_handle`, `record_*`) read the existing row via `_load_existing_handle_row` and rewrite the full row — ReplacingMergeTree updates are append-only inserts, so the column list (`_HANDLE_INSERT_COLUMNS`) must be pinned in one place to keep schema drift survivable.

### Resilience to partially-applied migrations

`app/repositories/safe_query.py` exposes two helpers used across the Tier 2 read paths:

- `is_schema_missing(exc)` — returns True for ClickHouse "table doesn't exist" / "unknown identifier" / "code: 60|47|36" error shapes.
- `safe_call(fn, fallback, label)` — runs the closure, returns `fallback` on a schema-missing error (with a tagged warning log), re-raises anything else.

Every Tier 2 read path is wrapped with `safe_call` (hashtags, sentiment, topics, growth drivers, candidate-driver attribution, self content mix, self last-25 posts, competitor list / snapshots / timeline). Write paths use two layers of fallback: `_insert_handle_row` (competitor handles) and `replace_topics_for_user` (topics) first try the full column set, fall back to the legacy column list when migration 014/015 hasn't been applied, and silently skip when the table itself is missing.

Net effect: a freshly-deployed backend missing some migrations no longer 500s the website — the affected widgets just show empty-state copy until migrations are applied. All other failure types (network errors, auth errors, type bugs) still propagate so real bugs don't get silently swallowed.

### Daily sync — `app/jobs/competitor_sync.py`
- Joins `competitor_handles` × `instagram_profiles` to get `(user_id, handle, ig_user_id, access_token)`.
- Decrypts the token, calls `fetch_competitor_snapshot`, persists via `insert_snapshot`.
- **Failure tracking** (Tier 2 / F3 edge case "Competitor becomes private"): each failed lookup — Graph 400 / not-found / connection error — calls `competitor_repo.record_failure` to bump `consecutive_failures`. A successful snapshot resets it via `record_success`. When the counter hits `competitor_repo.MAX_CONSECUTIVE_FAILURES` (3), the handle is auto-soft-deleted so it stops eating API quota.
- Token-decrypt errors don't count toward `consecutive_failures` — those are the user's problem, not the competitor's.
- Writes a daily snapshot for the authenticated user under `handle='you'` so the timeline chart has a continuous self series (see `_compute_self_metrics`).
- Run with `python -m app.jobs.competitor_sync` (cron-friendly).

### Endpoints
```
GET /api/instagram/competitors
→ CompetitorListResponse {
    competitors: [CompetitorItem {
        handle, ig_user_id, display_name, profile_picture_url,
        latest_snapshot?, consecutive_failures   # ← from competitor_handles
    }],
    you: SelfSnapshot { followers_count, media_count, posts_last_7d, ..., avg_engagement_rate_pct }
}
# you-side metrics are computed from the latest 25 owned posts using the same
# (likes+comments)/followers definition for apples-to-apples comparison.
# consecutive_failures lets the FE render a "data may be stale" badge before
# the handle hits MAX_CONSECUTIVE_FAILURES and gets auto-soft-deleted.

POST /api/instagram/competitors
body { handle: "^[A-Za-z0-9._]{1,30}$" }
→ CompetitorItem (with first snapshot)
# 400 if not a public Business/Creator account or cap reached.

DELETE /api/instagram/competitors/{handle} → 204
# soft delete (active=0); snapshot history preserved.

GET /api/instagram/competitors/timeline
    ?days=90
→ CompetitorTimelineResponse {
    period_days,
    series: [CompetitorTimelineSeries {
        handle, display_name, points: [{ date, followers }]
    }]
}
# `handle="you"` series carries a single "today" point until per-day
# self-snapshots are wired (TODO: extend competitor_sync to also snapshot the
# authenticated user's profile).

GET /api/instagram/competitors/content-mix
    ?days=30
→ ContentMixResponse {
    period_days,
    accounts: [ContentMixAccount {
        handle, display_name, mix: { reels, carousel, image } // fractions in [0,1]
    }]
}
# Competitor mix is derived from the latest snapshot's last-7d counts; the user's
# mix comes from instagram_media.
```

---

## 6. File inventory

```
backend/
├── .env.example                                # + ANTHROPIC_API_KEY
├── requirements.txt                            # + anthropic, scikit-learn (job-only)
├── migrations/
│   ├── 008_create_post_hashtags.sql            # F2
│   ├── 009_create_instagram_comments.sql       # F4
│   ├── 010_create_comment_sentiment.sql        # F4
│   ├── 011_create_comment_topics.sql           # F4
│   ├── 012_create_competitor_handles.sql       # F3
│   └── 013_create_competitor_snapshots.sql     # F3
├── scripts/
│   └── backfill_hashtags.py                    # F2
└── app/
    ├── config.py                               # + anthropic_api_key
    ├── stats.py                                # F1 — significance helpers
    ├── instagram/
    │   ├── competitors.py                      # F3 — Business Discovery wrapper
    │   ├── hashtags.py                         # F2 — extractor
    │   ├── router.py                           # + 11 new endpoints
    │   ├── schemas.py                          # + ComparisonValue + per-feature schemas
    │   └── service.py                          # + fetch_comments_for_media (F4)
    ├── jobs/
    │   ├── __init__.py                         # F2/F3/F4 batch jobs live here
    │   ├── sentiment_batch.py                  # F4
    │   ├── topic_clustering.py                 # F4
    │   └── competitor_sync.py                  # F3
    ├── models/
    │   └── queries.py                          # + 18 new SQL strings
    └── repositories/
        ├── __init__.py                         # + comment_repo, competitor_repo
        ├── comparison.py                       # F1 — period-over-period helper
        ├── comment_repo.py                     # F4
        ├── competitor_repo.py                  # F3
        ├── instagram_repo.py                   # + _insert_hashtags_for_media (F2)
        └── insights_repo.py                    # + F5/F2/F4 query wrappers
```

---

## 7. Endpoint cheat-sheet

| Method | Path | Feature | Frontend hook |
|---|---|---|---|
| GET | `/api/instagram/insights/growth-drivers` | F5 | `useGrowthDrivers` |
| GET | `/api/instagram/insights/hashtags` | F2 | `useTopHashtags` |
| GET | `/api/instagram/insights/hashtags/trend` | F2 | `useHashtagTrend` |
| GET | `/api/instagram/insights/hashtags/combos` | F2 | `useHashtagCombos` |
| GET | `/api/instagram/insights/sentiment` | F4 | `useSentimentSummary` |
| GET | `/api/instagram/insights/sentiment/topics` | F4 | `useTopics` |
| GET | `/api/instagram/insights/sentiment/questions` | F4 | `useQuestionPosts` |
| GET | `/api/instagram/insights/sentiment/media/{id}` | F4 | `useMediaSentiment` |
| GET | `/api/instagram/competitors` | F3 | `useCompetitors` |
| POST | `/api/instagram/competitors` | F3 | `useCompetitors().add` |
| DELETE | `/api/instagram/competitors/{handle}` | F3 | `useCompetitors().remove` |
| GET | `/api/instagram/competitors/timeline` | F3 | `useCompetitorTimeline` |
| GET | `/api/instagram/competitors/content-mix` | F3 | `useContentMix` |

All Tier 1 endpoints continue to work unchanged. Adding `compare_to` to Tier 1 endpoints is a per-route extension that uses the F1 helpers — the schemas and helpers are in place; promoting individual fields to `ComparisonValue` is the only remaining FE/BE alignment step.

---

## 8. Build / run

```bash
# Migrations (idempotent; safe to re-run)
cd backend
python run_migrations.py

# Backfill hashtags once after applying migration 008
python -m scripts.backfill_hashtags

# Sentiment job (requires ANTHROPIC_API_KEY)
python -m app.jobs.sentiment_batch

# Topic clustering job
python -m app.jobs.topic_clustering

# Daily competitor snapshot
python -m app.jobs.competitor_sync

# Dev server
uvicorn app.main:app --reload
```

## 9. Scheduling

Suggested cron cadence (UTC):

| Job | Cadence | Reason |
|---|---|---|
| `sentiment_batch` | every 6 h | catches up on newly-synced comments without piling up |
| `topic_clustering` | weekly (Sun 04:30) | clusters are stable enough; LLM cost dominates |
| `competitor_sync` | daily (04:00) | matches the snapshot granularity we surface |

The repo doesn't ship a scheduler — APScheduler or system cron / Cloud Scheduler / a worker queue are all fine; each job's `main()` is self-contained.

---

## 10. Status of formerly-deferred items

| Item | Status |
|---|---|
| **Comment sync wired into `_run_insights_sync`** | ✅ Done. After each media-insights refresh, `service.fetch_comments_for_media` runs for FEED/REELS media and `comment_repo.bulk_insert_comments` persists results. Skipped silently if the `instagram_comments` table is missing. |
| **Self-snapshot in `competitor_sync`** | ✅ Done. The daily job now writes a `handle='you'` row per user to `competitor_snapshots` using owned-profile + last-25-posts metrics. `/competitors/timeline` reads the "you" series from this history; falls back to a single "today" point if the job hasn't run yet. |
| **`non_follower_reach` separate fetch** | ✅ Done. `service.fetch_media_insights_batch` now calls `/{media-id}/insights?metric=reach&breakdown=follower_type` for FEED/REELS media and appends synthetic `follower_reach` + `non_follower_reach` metric rows to the batch result. The existing media-insights upsert path persists them automatically. F5 attribution uses these values when present and falls back to total `reach` otherwise. |
| **`compare_to` rollout on Tier 1 endpoints** | ✅ Done. `/insights/{overview,dashboard,format-breakdown,best-time,algorithm-metrics,reels-retention,reels-retention/trend}` all accept `compare_to` (`prev_period` \| `prev_year` \| `YYYY-MM-DD,YYYY-MM-DD`). Each response model has an additive `prior: <Self> \| None = None` field so existing FE code keeps working; FE swaps to `ComparisonMetricPill` can read `prior` directly. Underlying queries were extended with an `until` filter so prior windows are scoped correctly. |
| Embedding-based clustering in `topic_clustering` | Still deferred. TF-IDF v0 is shipped; swap once Voyage/OpenAI embedding pipeline lands. |
| Job scheduler | Still deferred — each job exposes a runnable `main()`; choice of scheduler is deployment-specific. |
