# DATABASE.md

> ClickHouse schema for **Social Analytics**. Database: `social_analytics` (from `CLICKHOUSE_DATABASE`).
> DDL: `backend/migrations/*.sql` (042 numbered files). Centralized SQL: `backend/app/models/queries.py` (~2130 lines, SELECTs only). No ORM — 6 of ~43 tables have a `@dataclass` row-mapper in `backend/app/models/`.

---

## 1. Migration model

- **Runner:** `backend/run_migrations.py`. Connects via `clickhouse-connect` (HTTPS 8443, `secure=True`), `CREATE DATABASE IF NOT EXISTS`, then creates a bookkeeping table `db_migrations(version String, applied_at DateTime) ENGINE=ReplacingMergeTree(applied_at) ORDER BY version`.
- **Ordering:** globs `migrations/*.sql`, **sorts lexically by filename**, skips files already recorded in `db_migrations`. Strips `--` comments, splits each file on `;`, runs each statement with `client.command()`.
- **Numbers 032–036 are each used twice** (one Instagram/Tier-2 file + one YouTube file). Lexical sort disambiguates them (`032_create_archive_tables.sql` < `032_create_youtube_competitors.sql`).
- **Not a real migration framework:** no transactions, no down-migrations. Idempotency comes solely from every statement using `IF NOT EXISTS`. A half-applied file is not recorded, so a re-run retries the whole file (safe only because of the guards).

---

## 2. Table Catalog

| Table | Migration | Engine (version col) | ORDER BY (= primary key) | Notes |
|---|---|---|---|---|
| `users` | 001 | ReplacingMergeTree(updated_at) | `(id)` | + bloom_filter index on `email` |
| `instagram_profiles` | 002 | ReplacingMergeTree(updated_at) | `(user_id, ig_user_id)` | holds encrypted `access_token` |
| `instagram_media` | 003 (+007) | ReplacingMergeTree(fetched_at) | `(user_id, ig_user_id, ig_media_id)` | no `updated_at`; dedup via FINAL |
| `account_insights` | 004 | ReplacingMergeTree(updated_at) | `(user_id, ig_user_id, metric_name, end_time)` | time-series |
| `demographic_insights` | 005 | ReplacingMergeTree(updated_at) | `(user_id, ig_user_id, metric_name, dimension_key, dimension_value, timeframe)` | |
| `media_insights` | 006 | ReplacingMergeTree(updated_at) | `(user_id, ig_media_id, metric_name)` | **double-duty**: posts + stories |
| `post_hashtags` | 008 | ReplacingMergeTree(fetched_at) | `(user_id, hashtag, ig_media_id)` | denormalized from captions |
| `instagram_comments` | 009 | ReplacingMergeTree(fetched_at) | `(user_id, ig_media_id, ig_comment_id)` | `parent_comment_id=''`=top-level |
| `comment_sentiment` | 010 (+035) | ReplacingMergeTree(computed_at) | `(user_id, ig_comment_id)` | 1:1 with comment |
| `comment_topics` | 011 (+014) | ReplacingMergeTree(computed_at) | `(user_id, cluster_id, period_start)` | TF-IDF/KMeans clusters |
| `competitor_handles` | 012 (+015) | ReplacingMergeTree(updated_at) | `(user_id, handle)` | `active` soft-delete |
| `competitor_snapshots` | 013 | ReplacingMergeTree(fetched_at) | `(user_id, handle, snapshot_date)` | daily series |
| `branded_hashtags` | 016 | ReplacingMergeTree(updated_at) | `(user_id, hashtag)` | max 3/user |
| `branded_hashtag_mentions` | 017 | ReplacingMergeTree(updated_at) | `(user_id, hashtag, ig_media_id)` | **legacy/dead** (no query reads it) |
| `branded_hashtag_comment_mentions` | 018 (+019) | ReplacingMergeTree(updated_at) | `(user_id, hashtag, ig_comment_id)` | `source` = comment\|post |
| `ai_digests` | 020 | ReplacingMergeTree(updated_at) | `(user_id, week_of)` | cached weekly digest |
| `ai_feedback` | 021 | ReplacingMergeTree(updated_at) | `(user_id, feature, ref_id)` | thumbs up/down |
| `ai_quota_usage` | 022 | ReplacingMergeTree(updated_at) | `(user_id, called_at, call_id)` | billing ledger |
| `ai_events` | 023 | **MergeTree** (append-only) | `(user_id, ts)` | telemetry |
| `ai_ideas` | 024 | ReplacingMergeTree(updated_at) | `(user_id, period_days, limit_n)` | cached ideas |
| `ai_diagnostics` | 025 | ReplacingMergeTree(updated_at) | `(user_id, ig_media_id)` | cached per-post diagnosis |
| `youtube_tokens` | 026 | ReplacingMergeTree(updated_at) | `(user_id, yt_channel_id)` | encrypted refresh token |
| `youtube_channels` | 027 | ReplacingMergeTree(fetched_at) | `(user_id, yt_channel_id)` | |
| `youtube_videos` | 028 | ReplacingMergeTree(fetched_at) | `(user_id, yt_channel_id, video_id)` | |
| `youtube_daily_metrics` | 029 | ReplacingMergeTree(end_time) | `(user_id, yt_channel_id, metric_name, end_time)` | |
| `youtube_retention_curves` | 030 | ReplacingMergeTree(fetched_at) | `(user_id, yt_channel_id, video_id, elapsed_video_time_ratio)` | |
| `youtube_retention_annotations` | 031 | ReplacingMergeTree(generated_at) | `(user_id, video_id, timestamp_seconds)` | AI drop-off notes |
| `archive_posts` | 032_archive | ReplacingMergeTree(imported_at) | `(user_id, taken_at, caption)` | data-export import |
| `archive_stories` | 032_archive | ReplacingMergeTree(imported_at) | `(user_id, taken_at)` | |
| `follower_events` | 032_archive | ReplacingMergeTree(imported_at) | `(user_id, follower_username)` | |
| `youtube_competitors` | 032_youtube | ReplacingMergeTree(updated_at) | `(user_id, competitor_channel_id)` | `is_deleted` flag |
| `instagram_stories` | 033_ig | ReplacingMergeTree(fetched_at) | `(user_id, ig_media_id)` | insights reuse `media_insights` |
| `youtube_competitor_videos` | 033_yt | ReplacingMergeTree(fetched_at) | `(user_id, competitor_channel_id, video_id)` | re-carry `llm_analysis`/`is_outlier` |
| `dm_funnels` | 034_dm | ReplacingMergeTree(updated_at) | `(user_id, funnel_id)` | `ig_media_id=''`=all posts |
| `dm_funnel_sends` | 034_dm | ReplacingMergeTree(sent_at) | `(user_id, funnel_id, ig_comment_id)` | dedup ledger |
| `youtube_competitor_velocity` | 034_yt | ReplacingMergeTree(checked_at) | `(user_id, yt_channel_id, video_id, hours_since_publish)` | own + competitor videos |
| `youtube_title_history` | 035_yt (+040) | **MergeTree** (append-only) | `(user_id, yt_channel_id, video_id, observed_at)` | |
| `youtube_archive_suggestions` | 036_yt | ReplacingMergeTree(generated_at) | `(user_id, yt_channel_id, video_id)` | |
| `instagram_sync_jobs` | 036_sync | ReplacingMergeTree(updated_at) | `(user_id, job_id)` | sync status polling |
| `youtube_predictions` | 037 | ReplacingMergeTree(predicted_at) | `(user_id, video_id)` | |
| `youtube_alerts` | 038 | **MergeTree** (append-only) | `(user_id, video_id, created_at)` | |
| `youtube_model_state` | 039 | ReplacingMergeTree(trained_at) | `(user_id)` | one row/user |
| `story_snapshot_jobs` | 041 | ReplacingMergeTree(updated_at) | `(user_id)` | one row/user |
| `trending_audio` | 042 | ReplacingMergeTree(updated_at) | `(week, rank)` | **global, not user-scoped** |
| `db_migrations` | runner | ReplacingMergeTree(applied_at) | `(version)` | bookkeeping |

No `PARTITION BY` anywhere. `index_granularity = 8192` (the default) is set explicitly on core IG/YouTube/archive tables.

---

## 3. Column detail (selected critical tables)

> Full column lists for all groups follow the migrations verbatim. Key tables:

**`users`** (001): `id UUID DEFAULT generateUUIDv4()`, `email String`, `username String`, `hashed_password String`, `is_active UInt8 DEFAULT 1`, `created_at DateTime`, `updated_at DateTime`. **Index:** `idx_email (email) TYPE bloom_filter GRANULARITY 1` — the **only explicit data-skipping index in the whole schema**.

**`instagram_profiles`** (002): `id UUID`, `user_id UUID`, `ig_user_id String`, `username/name/biography/profile_picture_url String`, `followers_count/follows_count/media_count UInt64`, `access_token String` (Fernet ciphertext), `token_expires_at DateTime`, `connected_at DateTime`, `updated_at DateTime`.

**`instagram_media`** (003+007): `id UUID`, `ig_media_id String`, `ig_user_id String`, `user_id UUID`, `media_type String`, `media_url/thumbnail_url/permalink/caption String`, `timestamp DateTime`, `like_count/comments_count UInt64`, `fetched_at DateTime`, `media_product_type String` (FEED/REELS/STORY).

**`account_insights`** (004): `user_id UUID`, `ig_user_id String`, `metric_name String`, `metric_value Int64`, `period String DEFAULT 'day'`, `end_time DateTime`, `fetched_at/updated_at DateTime`.

**`comment_sentiment`** (010+035): `user_id UUID`, `ig_comment_id String`, `ig_media_id String`, `sentiment String` (positive/neutral/negative), `score Float32` (−1..+1), `is_question/is_spam/is_collab UInt8`, `language String`, `embedding Array(Float32)`, `model String`, `computed_at DateTime`.

**`ai_quota_usage`** (022): `user_id UUID`, `call_id UUID`, `feature LowCardinality(String)`, `model LowCardinality(String)`, `input_tokens/output_tokens/cache_read_tokens/cache_write_tokens UInt32`, `cost_usd_micros UInt64` (USD×1e6 — ⚠ always 0, pricing table empty), `called_at/updated_at DateTime`.

**`youtube_tokens`** (026): `id UUID`, `user_id UUID`, `yt_channel_id String`, `refresh_token String` (Fernet ciphertext — access tokens never stored), `connected_at/updated_at DateTime`.

**`youtube_predictions`** (037): `user_id UUID`, `video_id String`, `four_hour_views UInt64`, `four_hour_avg_watch_s Float64`, `ctr_pct Float64`, `predicted_30d_views UInt64`, `predicted_low/predicted_high UInt64`, `revenue_low_usd/revenue_high_usd Float64`, `predicted_at DateTime`.

**`trending_audio`** (042): `id UUID`, `week Date` (Monday), `rank UInt8`, `title String`, `artist/reels_count/delta/use_case/source String`, `updated_at DateTime`. **Global** — populated by `scripts/seed_trending_audio.py`, curated editorially (the Graph API exposes no trending-audio data).

> The full column inventory per group (Users & Auth, IG profile/media/insights, Comments/sentiment/topics, Competitors, Branded hashtags, Stories, Archive import, DM funnels, Sync jobs, AI, YouTube) is in the migration files 001–042. Common patterns: every business table starts with `id UUID DEFAULT generateUUIDv4()` and `user_id UUID`; enum-like columns use `LowCardinality(String)`.

---

## 4. Entity-Relationship Diagram (logical — ClickHouse has no FKs)

Primary join keys: `user_id` (tenant scope, on every table), `ig_user_id`, `ig_media_id`, `ig_comment_id`, `hashtag`, `handle`, `yt_channel_id`/`competitor_channel_id`, `video_id`, `funnel_id`, `week`/`week_of`.

```
users (id)
  │ user_id
  ├── instagram_profiles (ig_user_id)              ← IG account anchor (encrypted token)
  │      │ ig_user_id
  │      ├── instagram_media (ig_media_id) ─────────────┐
  │      │      │ ig_media_id                            │
  │      │      ├── media_insights (metric_name)         │ (stories reuse this table)
  │      │      ├── instagram_comments (ig_comment_id)   │
  │      │      │      ├── comment_sentiment   [1:1]      │
  │      │      │      └── self-join parent_comment_id    │
  │      │      ├── post_hashtags (hashtag)               │
  │      │      ├── instagram_stories                     │
  │      │      ├── ai_diagnostics (ig_media_id)          │
  │      │      └── dm_funnel_sends (ig_comment_id)       │
  │      ├── account_insights (metric_name, end_time)
  │      └── demographic_insights (metric_name, dimension_*)
  ├── comment_topics (sample_comment_ids[])  (soft ref to ig_comment_id)
  ├── branded_hashtags (hashtag) → branded_hashtag_comment_mentions
  ├── competitor_handles (handle) → competitor_snapshots (daily)
  ├── dm_funnels (funnel_id) → dm_funnel_sends
  ├── ai_digests (week_of) / ai_ideas / ai_feedback / ai_quota_usage / ai_events
  ├── instagram_sync_jobs (job_id) / story_snapshot_jobs
  ├── archive_posts / archive_stories / follower_events   (no ig_media_id)
  └── youtube_tokens / youtube_channels (yt_channel_id)
         │ yt_channel_id
         ├── youtube_videos (video_id) ──────────────┐
         │      ├── youtube_retention_curves          │
         │      ├── youtube_retention_annotations      │
         │      ├── youtube_title_history              │
         │      ├── youtube_predictions                │
         │      ├── youtube_alerts                     │
         │      ├── youtube_archive_suggestions        │
         │      └── youtube_competitor_velocity (own + competitor videos)
         ├── youtube_daily_metrics (metric_name, end_time)
         ├── youtube_model_state (1/user)
         └── youtube_competitors (competitor_channel_id)
                └── youtube_competitor_videos (video_id)

trending_audio (week, rank)   — GLOBAL, no user_id
db_migrations (version)       — runner bookkeeping
```

`ai_feedback.ref_id` is polymorphic (week_of / idea.id / ig_media_id / caption-hash).

---

## 5. Indexes & ordering

- **Only explicit skip index:** `users.idx_email` (bloom_filter) for login-by-email.
- All other "indexing" is implicit via `ORDER BY` (= primary index): `user_id` is first in nearly every key so reads prune granules by tenant.
- `LowCardinality(String)` dictionary-encodes enum-ish columns (AI `feature`/`model`/`status`/`rating`; YouTube `metric_name`/`video_format`/`alert_type`/`suggestion_type`).
- Single-row-per-user tables: `youtube_model_state`, `story_snapshot_jobs` (`ORDER BY (user_id)`).

---

## 6. queries.py read patterns

`models/queries.py` holds **only SELECTs** — inserts go through `client.insert(table, rows, column_names=[...])`. A shared fragment `PIVOTED_MEDIA_METRICS` is concatenated into ~12 queries to pivot the long `media_insights` (`metric_name`/`metric_value`) into columns (reach, views, saved, shares, comments, avg_watch_time, …).

Three "latest version" read patterns coexist:
1. **`FINAL` + `ORDER BY <version> DESC LIMIT 1`** — single-latest reads (`GET_INSTAGRAM_PROFILE`, `GET_INSTAGRAM_TOKEN`, `GET_YOUTUBE_TOKEN`, `GET_LATEST_SYNC_JOB`, `GET_YT_MODEL_STATE`).
2. **`argMax(col, version)` GROUP BY** — per-key latest without FINAL (`GET_COMPETITOR_LATEST_SNAPSHOTS`, `GET_COMPETITOR_TIMELINE`).
3. **No FINAL** — append-only `MergeTree` tables and hot counts (`GET_AI_QUOTA_USED_THIS_MONTH`, `dm_funnel_sends` dedup scan, `LIST_TRENDING_AUDIO_WEEKS`) intentionally skip FINAL to avoid forcing expensive merges.

Constant groups: Users · IG Profiles · IG Media · Account/Demographic/Media insights · Dashboard aggregates · Comment inbox/superfans · Anomaly alerts · Content-Lab analytics (format/best-time/algorithm/reels/follower-quality) · Drill-downs · Growth drivers · Hashtags · Sentiment/topics · Competitors · Branded hashtags · AI (digest/ideas/diagnostic/caption/quota/cost) · YouTube (tokens/channel/videos/metrics/retention/competitors/velocity/title/archive/prediction/alerts/model) · Cross-platform · DM funnels · Sync jobs · Trending audio.

---

## 7. Gotchas

- `instagram_media` has **no `updated_at`** — its version column is `fetched_at`; `GET_MEDIA_IMAGE_URL` relies on `FINAL` for dedup.
- `branded_hashtag_mentions` (017) is **dead** — superseded by `branded_hashtag_comment_mentions` (018) because the Instagram Login API token can't call `ig_hashtag_search`.
- `media_insights` stores **both** post and story insights, keyed `(user_id, ig_media_id, metric_name)`.
- `youtube_competitor_velocity` stores the user's **own** videos too (keyed by their own channel id) — `GET_YT_OWN_VELOCITY_SAMPLES` joins it to train `youtube_model_state`.
- `youtube_competitor_videos.llm_analysis Nullable(String)` and `instagram_sync_jobs.finished_at Nullable(DateTime)` are the only non-DateTime `Nullable` columns; inserts must re-carry `llm_analysis`/`is_outlier` to avoid merge clobbering.
