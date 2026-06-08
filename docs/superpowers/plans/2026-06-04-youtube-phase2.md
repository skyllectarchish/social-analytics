# YouTube Phase 2: Advanced Intelligence Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 advanced YouTube analytics features: Outlier Detection, Predictive Projections, Archive Miner, Cross-Platform ROI, and Webhook Intelligence.

**Architecture:** Hybrid webhook/polling backend. PubSubHubbub when `WEBHOOK_BASE_URL` is set (ngrok locally), daily cron fallback when absent. Eight new ClickHouse tables (032–039). Four new frontend pages. Scheduler jobs extend the existing `scheduler.py` / APScheduler pattern.

**Tech Stack:** FastAPI, ClickHouse ReplacingMergeTree, APScheduler, scikit-learn (already in requirements.txt), httpx, YouTube Data API v3 + Analytics API v2, PubSubHubbub/WebSub, YouTube Autocomplete API (free), Wikipedia Pageviews API (free), Ollama AI client (existing `ai/client.py`), React 19 + TypeScript, Recharts, Framer Motion.

> **No test suite:** This project has no configured test runner. Each task ends with a manual smoke-test step instead of `pytest`.

---

## File Map

**New backend files:**
- `backend/migrations/032_create_youtube_competitors.sql`
- `backend/migrations/033_create_youtube_competitor_videos.sql`
- `backend/migrations/034_create_youtube_competitor_velocity.sql`
- `backend/migrations/035_create_youtube_title_history.sql`
- `backend/migrations/036_create_youtube_archive_suggestions.sql`
- `backend/migrations/037_create_youtube_predictions.sql`
- `backend/migrations/038_create_youtube_alerts.sql`
- `backend/migrations/039_create_youtube_model_state.sql`
- `backend/app/youtube/webhook.py`
- `backend/app/youtube/predictive_model.py`
- `backend/app/jobs/yt_outlier_detection.py`
- `backend/app/jobs/yt_competitor_poll.py`
- `backend/app/jobs/yt_golden_hour.py`
- `backend/app/jobs/yt_preflight.py`
- `backend/app/jobs/yt_archive_miner.py`
- `backend/app/jobs/yt_velocity_tracker.py`

**Modified backend files:**
- `backend/app/config.py` — 7 new fields
- `backend/.env.example` — `WEBHOOK_BASE_URL`
- `backend/app/constants.py` — new constants + extend `YOUTUBE_ANALYTICS_OVERVIEW_METRICS`
- `backend/app/models/queries.py` — 18 new SQL queries
- `backend/app/repositories/youtube_repo.py` — new CRUD functions
- `backend/app/youtube/service.py` — 4 new functions
- `backend/app/youtube/router.py` — 8 new endpoints
- `backend/app/youtube/schemas.py` — new Pydantic models
- `backend/app/scheduler.py` — 3 new job registrations
- `backend/app/main.py` — register webhook router

**New frontend files:**
- `frontend/src/pages/YoutubeCompetitorsPage.tsx`
- `frontend/src/pages/YoutubePredictivePage.tsx`
- `frontend/src/pages/YoutubeArchivePage.tsx`
- `frontend/src/pages/YoutubeFunnelPage.tsx`

**Modified frontend files:**
- `frontend/src/api/youtubeTypes.ts` — new types
- `frontend/src/components/youtube/YoutubeDashboardLayout.tsx` — 4 new nav items
- `frontend/src/App.tsx` — 4 new routes

---

### Task 1: ClickHouse Migrations 032–039

**Files:** Create all 8 `.sql` files in `backend/migrations/`

- [ ] **Step 1: Create migration 032**

```sql
-- backend/migrations/032_create_youtube_competitors.sql
CREATE TABLE IF NOT EXISTS youtube_competitors (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    competitor_channel_id String,
    competitor_title String,
    competitor_thumbnail_url String,
    webhook_active Bool DEFAULT false,
    is_deleted Bool DEFAULT false,
    added_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, competitor_channel_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 2: Create migration 033**

```sql
-- backend/migrations/033_create_youtube_competitor_videos.sql
CREATE TABLE IF NOT EXISTS youtube_competitor_videos (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    competitor_channel_id String,
    video_id String,
    title String,
    description String,
    thumbnail_url String,
    published_at DateTime,
    view_count UInt64,
    llm_analysis Nullable(String),
    is_outlier Bool DEFAULT false,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, competitor_channel_id, video_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 3: Create migration 034**

```sql
-- backend/migrations/034_create_youtube_competitor_velocity.sql
CREATE TABLE IF NOT EXISTS youtube_competitor_velocity (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    channel_id String,
    video_id String,
    hours_since_publish UInt8,
    view_count UInt64,
    avg_watch_s Float64 DEFAULT 0,
    ctr_pct Float64 DEFAULT 0,
    checked_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(checked_at)
ORDER BY (user_id, channel_id, video_id, hours_since_publish)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 4: Create migration 035**

```sql
-- backend/migrations/035_create_youtube_title_history.sql
CREATE TABLE IF NOT EXISTS youtube_title_history (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    channel_id String,
    video_id String,
    title_text String,
    observed_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, channel_id, video_id, observed_at)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 5: Create migration 036**

```sql
-- backend/migrations/036_create_youtube_archive_suggestions.sql
CREATE TABLE IF NOT EXISTS youtube_archive_suggestions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    original_title String,
    trending_topic String,
    wikipedia_spike_pct Float64,
    autocomplete_matches Array(String),
    suggestion_type LowCardinality(String),
    llm_recommendation String,
    generated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(generated_at)
ORDER BY (user_id, video_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 6: Create migration 037**

```sql
-- backend/migrations/037_create_youtube_predictions.sql
CREATE TABLE IF NOT EXISTS youtube_predictions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    four_hour_views UInt64,
    four_hour_avg_watch_s Float64,
    ctr_pct Float64,
    predicted_30d_views UInt64,
    predicted_low UInt64,
    predicted_high UInt64,
    revenue_low_usd Float64,
    revenue_high_usd Float64,
    predicted_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(predicted_at)
ORDER BY (user_id, video_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 7: Create migration 038**

```sql
-- backend/migrations/038_create_youtube_alerts.sql
CREATE TABLE IF NOT EXISTS youtube_alerts (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    alert_type LowCardinality(String),
    alert_body String,
    is_read Bool DEFAULT false,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, created_at)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 8: Create migration 039**

```sql
-- backend/migrations/039_create_youtube_model_state.sql
CREATE TABLE IF NOT EXISTS youtube_model_state (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    coefficients_json String,
    intercept Float64,
    r2_score Float64,
    training_sample_size UInt16,
    trained_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(trained_at)
ORDER BY (user_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 9: Apply migrations**

```bash
cd backend && python run_migrations.py
```
Expected: 8 new tables created, no errors.

- [ ] **Step 10: Commit**

```bash
git add backend/migrations/032_*.sql backend/migrations/033_*.sql backend/migrations/034_*.sql backend/migrations/035_*.sql backend/migrations/036_*.sql backend/migrations/037_*.sql backend/migrations/038_*.sql backend/migrations/039_*.sql
git commit -m "feat(yt-p2): add ClickHouse migrations 032-039 for Phase 2 tables"
```

---

### Task 2: Config + Constants

**Files:** Modify `backend/app/config.py`, `backend/app/constants.py`, `backend/.env.example`

- [ ] **Step 1: Add 7 new fields to `Settings` class in `backend/app/config.py`**

Add after the `google_redirect_uri` line:

```python
    # YouTube Phase 2 — Webhook Intelligence
    # Set to your public base URL (e.g. https://abc123.ngrok.io) to enable
    # PubSubHubbub subscriptions. Leave blank to use polling fallback.
    webhook_base_url: str = ""

    # Archive Miner
    archive_miner_max_videos_per_run: int = 20
    scheduler_archive_miner_day: int = 6   # 6 = Sunday
    scheduler_archive_miner_hour: int = 3  # UTC

    # Predictive projections
    default_rpm_usd: float = 3.0

    # Competitor limits
    competitor_limit_standard: int = 5
    competitor_limit_premium: int = 25
```

- [ ] **Step 2: Add constants to `backend/app/constants.py`**

Append to the YouTube section:

```python
YOUTUBE_PUBSUBHUBBUB_HUB_URL: str = "https://pubsubhubbub.appspot.com/subscribe"
YOUTUBE_WEBSUB_LEASE_SECONDS: int = 864000  # 10 days

# Extend overview metrics to include reach / CTR data (used by predictive model)
YOUTUBE_ANALYTICS_OVERVIEW_METRICS: str = (
    "views,estimatedMinutesWatched,subscribersGained,subscribersLost,"
    "impressions,impressionsCTR,averageViewDuration"
)
```

Replace the existing `YOUTUBE_ANALYTICS_OVERVIEW_METRICS` line with the new multi-metric version above.

- [ ] **Step 3: Add to `backend/.env.example`**

```
# YouTube Phase 2 — Webhook Intelligence
# Set to ngrok public URL (e.g. https://abc123.ngrok.io) to enable PubSubHubbub.
# Leave blank to use daily polling fallback.
WEBHOOK_BASE_URL=
```

- [ ] **Step 4: Smoke test** — start backend (`uvicorn app.main:app --reload`), confirm startup with no `ValidationError` from pydantic-settings.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/constants.py backend/.env.example
git commit -m "feat(yt-p2): add Phase 2 config fields, constants, and env example"
```

---

### Task 3: SQL Queries

**Files:** Modify `backend/app/models/queries.py`

- [ ] **Step 1: Append all new queries to the end of `queries.py`**

```python
# ── YouTube Phase 2 ──────────────────────────────────────────────────────────

# --- Competitors ---

GET_YT_COMPETITORS = """
SELECT competitor_channel_id, competitor_title, competitor_thumbnail_url,
       webhook_active, added_at
FROM youtube_competitors FINAL
WHERE user_id = {user_id:UUID}
  AND is_deleted = false
ORDER BY added_at DESC
"""

COUNT_YT_COMPETITORS = """
SELECT count()
FROM youtube_competitors FINAL
WHERE user_id = {user_id:UUID}
  AND is_deleted = false
"""

# --- Competitor Videos ---

GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE = """
SELECT video_id, view_count, published_at, title, thumbnail_url,
       llm_analysis, is_outlier
FROM youtube_competitor_videos FINAL
WHERE user_id = {user_id:UUID}
  AND competitor_channel_id = {competitor_channel_id:String}
ORDER BY published_at DESC
LIMIT 30
"""

GET_YT_COMPETITOR_OUTLIERS = """
SELECT v.competitor_channel_id, v.video_id, v.title, v.thumbnail_url,
       v.view_count, v.published_at, v.llm_analysis
FROM youtube_competitor_videos v FINAL
WHERE v.user_id = {user_id:UUID}
  AND v.is_outlier = true
ORDER BY v.published_at DESC
LIMIT 50
"""

# --- Velocity ---

GET_YT_VELOCITY = """
SELECT hours_since_publish, view_count, avg_watch_s, ctr_pct, checked_at
FROM youtube_competitor_velocity FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY hours_since_publish ASC
"""

GET_YT_OWN_VELOCITY_SAMPLES = """
SELECT v.video_id, vel.view_count AS four_hour_views,
       vel.avg_watch_s AS four_hour_avg_watch_s, vel.ctr_pct,
       toUInt64(v.view_count) AS final_views
FROM youtube_videos v FINAL
JOIN youtube_competitor_velocity vel FINAL
  ON vel.video_id = v.video_id
     AND vel.user_id = v.user_id
     AND vel.hours_since_publish = 4
WHERE v.user_id = {user_id:UUID}
  AND v.view_count > 0
  AND toDate(v.published_at) <= today() - 30
ORDER BY v.published_at DESC
LIMIT 100
"""

# --- Title History ---

GET_YT_TITLE_HISTORY = """
SELECT title_text, observed_at
FROM youtube_title_history
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY observed_at ASC
"""

GET_YT_LAST_OBSERVED_TITLE = """
SELECT title_text
FROM youtube_title_history
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY observed_at DESC
LIMIT 1
"""

# --- Archive Suggestions ---

GET_YT_ARCHIVE_SUGGESTIONS = """
SELECT video_id, original_title, trending_topic, wikipedia_spike_pct,
       autocomplete_matches, suggestion_type, llm_recommendation, generated_at
FROM youtube_archive_suggestions FINAL
WHERE user_id = {user_id:UUID}
ORDER BY generated_at DESC
"""

GET_YT_LAST_ARCHIVE_SCAN = """
SELECT max(generated_at) AS last_scan
FROM youtube_archive_suggestions FINAL
WHERE user_id = {user_id:UUID}
"""

# --- Predictions ---

GET_YT_PREDICTION = """
SELECT video_id, four_hour_views, four_hour_avg_watch_s, ctr_pct,
       predicted_30d_views, predicted_low, predicted_high,
       revenue_low_usd, revenue_high_usd, predicted_at
FROM youtube_predictions FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY predicted_at DESC
LIMIT 1
"""

# --- Alerts ---

GET_YT_ALERTS = """
SELECT id, video_id, alert_type, alert_body, is_read, created_at
FROM youtube_alerts
WHERE user_id = {user_id:UUID}
ORDER BY created_at DESC
LIMIT 20
"""

# --- Model State ---

GET_YT_MODEL_STATE = """
SELECT coefficients_json, intercept, r2_score, training_sample_size, trained_at
FROM youtube_model_state FINAL
WHERE user_id = {user_id:UUID}
ORDER BY trained_at DESC
LIMIT 1
"""

# --- Cross-Platform ---

GET_YT_DAILY_SUBSCRIBER_NET = """
SELECT
    toDate(end_time) AS day,
    sumIf(metric_value, metric_name = 'subscribersGained') AS gained,
    sumIf(metric_value, metric_name = 'subscribersLost') AS lost
FROM youtube_daily_metrics FINAL
WHERE user_id = {user_id:UUID}
  AND end_time >= {start_date:DateTime}
GROUP BY day
ORDER BY day ASC
"""

GET_INSTAGRAM_REEL_POSTS = """
SELECT toDate(timestamp) AS post_date, ig_media_id, thumbnail_url, caption
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND media_type IN ('VIDEO', 'REEL')
  AND timestamp >= {start_date:DateTime}
ORDER BY post_date ASC
"""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/queries.py
git commit -m "feat(yt-p2): add 18 new SQL queries for Phase 2 features"
```

---

### Task 4: Repository Layer

**Files:** Modify `backend/app/repositories/youtube_repo.py`

- [ ] **Step 1: Add imports at top of file**

```python
from ..models.queries import (
    # existing imports...
    COUNT_YT_COMPETITORS,
    GET_YT_ARCHIVE_SUGGESTIONS,
    GET_YT_ALERTS,
    GET_YT_COMPETITOR_OUTLIERS,
    GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE,
    GET_YT_COMPETITORS,
    GET_YT_DAILY_SUBSCRIBER_NET,
    GET_YT_LAST_ARCHIVE_SCAN,
    GET_YT_LAST_OBSERVED_TITLE,
    GET_YT_MODEL_STATE,
    GET_YT_OWN_VELOCITY_SAMPLES,
    GET_YT_PREDICTION,
    GET_YT_TITLE_HISTORY,
    GET_YT_VELOCITY,
    GET_INSTAGRAM_REEL_POSTS,
)
```

- [ ] **Step 2: Append competitor CRUD functions**

```python
# --- Competitors ---

def list_competitors(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_COMPETITORS, parameters={"user_id": user_id}).result_rows
    return [
        {"competitor_channel_id": r[0], "competitor_title": r[1],
         "competitor_thumbnail_url": r[2], "webhook_active": bool(r[3]),
         "added_at": str(r[4])}
        for r in rows
    ]


def count_competitors(client: Client, user_id: str) -> int:
    rows = client.query(COUNT_YT_COMPETITORS, parameters={"user_id": user_id}).result_rows
    return int(rows[0][0]) if rows else 0


def upsert_competitor(client: Client, user_id: str, yt_channel_id: str, competitor: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_competitors",
        [[str(uuid.uuid4()), user_id, yt_channel_id,
          competitor["competitor_channel_id"], competitor.get("competitor_title", ""),
          competitor.get("competitor_thumbnail_url", ""),
          bool(competitor.get("webhook_active", False)),
          False, now, now]],
        column_names=["id", "user_id", "yt_channel_id", "competitor_channel_id",
                      "competitor_title", "competitor_thumbnail_url",
                      "webhook_active", "is_deleted", "added_at", "updated_at"],
    )


def delete_competitor(client: Client, user_id: str, competitor_channel_id: str) -> None:
    client.command(
        "ALTER TABLE youtube_competitors DELETE WHERE user_id = {uid:UUID} AND competitor_channel_id = {cid:String}",
        parameters={"uid": user_id, "cid": competitor_channel_id},
        settings={"mutations_sync": 2},
    )


def mark_competitor_webhook_active(client: Client, user_id: str, competitor_channel_id: str, active: bool) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.command(
        "ALTER TABLE youtube_competitors UPDATE webhook_active = {active:Bool}, updated_at = {now:DateTime} "
        "WHERE user_id = {uid:UUID} AND competitor_channel_id = {cid:String}",
        parameters={"active": active, "now": now, "uid": user_id, "cid": competitor_channel_id},
        settings={"mutations_sync": 2},
    )
```

- [ ] **Step 3: Append competitor video + velocity functions**

```python
# --- Competitor Videos ---

def get_competitor_videos_for_baseline(client: Client, user_id: str, competitor_channel_id: str) -> list[dict]:
    rows = client.query(
        GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE,
        parameters={"user_id": user_id, "competitor_channel_id": competitor_channel_id},
    ).result_rows
    return [
        {"video_id": r[0], "view_count": int(r[1]), "published_at": r[2],
         "title": r[3], "thumbnail_url": r[4], "llm_analysis": r[5], "is_outlier": bool(r[6])}
        for r in rows
    ]


def bulk_insert_competitor_videos(client: Client, user_id: str, videos: list[dict]) -> None:
    if not videos:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [str(uuid.uuid4()), user_id, v["competitor_channel_id"], v["video_id"],
         v.get("title", ""), v.get("description", ""), v.get("thumbnail_url", ""),
         v.get("published_at", now), int(v.get("view_count", 0)),
         v.get("llm_analysis"), bool(v.get("is_outlier", False)), now]
        for v in videos
    ]
    client.insert(
        "youtube_competitor_videos", rows,
        column_names=["id", "user_id", "competitor_channel_id", "video_id", "title",
                      "description", "thumbnail_url", "published_at", "view_count",
                      "llm_analysis", "is_outlier", "fetched_at"],
    )


def mark_video_outlier(client: Client, user_id: str, video_id: str, llm_analysis: str) -> None:
    client.command(
        "ALTER TABLE youtube_competitor_videos UPDATE is_outlier = true, llm_analysis = {analysis:String}, fetched_at = now() "
        "WHERE user_id = {uid:UUID} AND video_id = {vid:String}",
        parameters={"uid": user_id, "vid": video_id, "analysis": llm_analysis},
        settings={"mutations_sync": 2},
    )


def get_competitor_outliers(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_COMPETITOR_OUTLIERS, parameters={"user_id": user_id}).result_rows
    return [
        {"competitor_channel_id": r[0], "video_id": r[1], "title": r[2],
         "thumbnail_url": r[3], "view_count": int(r[4]),
         "published_at": str(r[5]), "llm_analysis": r[6]}
        for r in rows
    ]


# --- Velocity ---

def insert_velocity_point(client: Client, user_id: str, channel_id: str, video_id: str,
                           hours: int, view_count: int, avg_watch_s: float = 0.0, ctr_pct: float = 0.0) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_competitor_velocity",
        [[str(uuid.uuid4()), user_id, channel_id, video_id, hours, view_count, avg_watch_s, ctr_pct, now]],
        column_names=["id", "user_id", "channel_id", "video_id", "hours_since_publish",
                      "view_count", "avg_watch_s", "ctr_pct", "checked_at"],
    )


def get_velocity(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YT_VELOCITY, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    return [{"hours": int(r[0]), "view_count": int(r[1]), "avg_watch_s": float(r[2]),
             "ctr_pct": float(r[3]), "checked_at": str(r[4])} for r in rows]


def get_own_velocity_samples(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_OWN_VELOCITY_SAMPLES, parameters={"user_id": user_id}).result_rows
    return [{"video_id": r[0], "four_hour_views": int(r[1]), "four_hour_avg_watch_s": float(r[2]),
             "ctr_pct": float(r[3]), "final_views": int(r[4])} for r in rows]
```

- [ ] **Step 4: Append title history, archive, prediction, alerts, model state functions**

```python
# --- Title History ---

def record_title_if_changed(client: Client, user_id: str, channel_id: str, video_id: str, current_title: str) -> None:
    rows = client.query(GET_YT_LAST_OBSERVED_TITLE,
                        parameters={"user_id": user_id, "video_id": video_id}).result_rows
    last_title = rows[0][0] if rows else None
    if last_title == current_title:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_title_history",
        [[str(uuid.uuid4()), user_id, channel_id, video_id, current_title, now]],
        column_names=["id", "user_id", "channel_id", "video_id", "title_text", "observed_at"],
    )


def get_title_history(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YT_TITLE_HISTORY, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    return [{"title_text": r[0], "observed_at": str(r[1])} for r in rows]


# --- Archive Suggestions ---

def upsert_archive_suggestion(client: Client, user_id: str, suggestion: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_archive_suggestions",
        [[str(uuid.uuid4()), user_id, suggestion["video_id"], suggestion["original_title"],
          suggestion["trending_topic"], float(suggestion.get("wikipedia_spike_pct", 0)),
          suggestion.get("autocomplete_matches", []), suggestion["suggestion_type"],
          suggestion["llm_recommendation"], now]],
        column_names=["id", "user_id", "video_id", "original_title", "trending_topic",
                      "wikipedia_spike_pct", "autocomplete_matches", "suggestion_type",
                      "llm_recommendation", "generated_at"],
    )


def get_archive_suggestions(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_ARCHIVE_SUGGESTIONS, parameters={"user_id": user_id}).result_rows
    return [{"video_id": r[0], "original_title": r[1], "trending_topic": r[2],
             "wikipedia_spike_pct": float(r[3]), "autocomplete_matches": list(r[4]),
             "suggestion_type": r[5], "llm_recommendation": r[6], "generated_at": str(r[7])}
            for r in rows]


def get_last_archive_scan(client: Client, user_id: str) -> datetime | None:
    rows = client.query(GET_YT_LAST_ARCHIVE_SCAN, parameters={"user_id": user_id}).result_rows
    val = rows[0][0] if rows else None
    return val if val and str(val) != "1970-01-01 00:00:00" else None


# --- Predictions ---

def upsert_prediction(client: Client, user_id: str, pred: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_predictions",
        [[str(uuid.uuid4()), user_id, pred["video_id"],
          int(pred["four_hour_views"]), float(pred["four_hour_avg_watch_s"]),
          float(pred["ctr_pct"]), int(pred["predicted_30d_views"]),
          int(pred["predicted_low"]), int(pred["predicted_high"]),
          float(pred["revenue_low_usd"]), float(pred["revenue_high_usd"]), now]],
        column_names=["id", "user_id", "video_id", "four_hour_views", "four_hour_avg_watch_s",
                      "ctr_pct", "predicted_30d_views", "predicted_low", "predicted_high",
                      "revenue_low_usd", "revenue_high_usd", "predicted_at"],
    )


def get_prediction(client: Client, user_id: str, video_id: str) -> dict | None:
    rows = client.query(GET_YT_PREDICTION, parameters={"user_id": user_id, "video_id": video_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {"video_id": r[0], "four_hour_views": int(r[1]), "four_hour_avg_watch_s": float(r[2]),
            "ctr_pct": float(r[3]), "predicted_30d_views": int(r[4]), "predicted_low": int(r[5]),
            "predicted_high": int(r[6]), "revenue_low_usd": float(r[7]),
            "revenue_high_usd": float(r[8]), "predicted_at": str(r[9])}


# --- Alerts ---

def insert_alert(client: Client, user_id: str, video_id: str, alert_type: str, alert_body: str) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_alerts",
        [[str(uuid.uuid4()), user_id, video_id, alert_type, alert_body, False, now]],
        column_names=["id", "user_id", "video_id", "alert_type", "alert_body", "is_read", "created_at"],
    )


def get_alerts(client: Client, user_id: str) -> list[dict]:
    rows = client.query(GET_YT_ALERTS, parameters={"user_id": user_id}).result_rows
    return [{"id": str(r[0]), "video_id": r[1], "alert_type": r[2],
             "alert_body": r[3], "is_read": bool(r[4]), "created_at": str(r[5])}
            for r in rows]


# --- Model State ---

def upsert_model_state(client: Client, user_id: str, state: dict) -> None:
    import json
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_model_state",
        [[str(uuid.uuid4()), user_id, json.dumps(state["coefficients"]),
          float(state["intercept"]), float(state["r2_score"]),
          int(state["sample_size"]), now]],
        column_names=["id", "user_id", "coefficients_json", "intercept",
                      "r2_score", "training_sample_size", "trained_at"],
    )


def get_model_state(client: Client, user_id: str) -> dict | None:
    import json
    rows = client.query(GET_YT_MODEL_STATE, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {"coefficients": json.loads(r[0]), "intercept": float(r[1]),
            "r2_score": float(r[2]), "sample_size": int(r[3]), "trained_at": str(r[4])}


# --- Cross-Platform ---

def get_daily_subscriber_net(client: Client, user_id: str, start_date: datetime) -> list[dict]:
    rows = client.query(GET_YT_DAILY_SUBSCRIBER_NET,
                        parameters={"user_id": user_id, "start_date": start_date}).result_rows
    return [{"day": str(r[0]), "gained": int(r[1]), "lost": int(r[2])} for r in rows]


def get_instagram_reel_posts(client: Client, user_id: str, start_date: datetime) -> list[dict]:
    rows = client.query(GET_INSTAGRAM_REEL_POSTS,
                        parameters={"user_id": user_id, "start_date": start_date}).result_rows
    return [{"post_date": str(r[0]), "ig_media_id": r[1], "thumbnail_url": r[2], "caption": r[3]}
            for r in rows]
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/youtube_repo.py backend/app/models/queries.py
git commit -m "feat(yt-p2): add repository layer for all Phase 2 tables"
```

---

### Task 5: Service Additions

**Files:** Modify `backend/app/youtube/service.py`, `backend/app/constants.py`

- [ ] **Step 1: Add 4 new functions to `backend/app/youtube/service.py`**

```python
async def fetch_channel_by_handle(handle: str, access_token: str) -> dict | None:
    """Resolve a YouTube @handle or channel URL to channel metadata."""
    # Strip URL prefix and @ sign
    handle = handle.strip()
    for prefix in ("https://www.youtube.com/@", "https://youtube.com/@", "@"):
        if handle.startswith(prefix):
            handle = handle[len(prefix):]
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/channels",
            params={"part": "snippet,statistics", "forHandle": handle},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            return None
        items = resp.json().get("items", [])
        if not items:
            return None
        item = items[0]
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        return {
            "competitor_channel_id": item["id"],
            "competitor_title": snippet.get("title", ""),
            "competitor_thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
            "subscriber_count": int(stats.get("subscriberCount", 0)),
        }


async def fetch_video_stats(video_id: str, access_token: str) -> dict | None:
    """Lightweight fetch: statistics + snippet for a single video (1 quota unit)."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/videos",
            params={"part": "snippet,statistics", "id": video_id},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            return None
        items = resp.json().get("items", [])
        if not items:
            return None
        item = items[0]
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        return {
            "video_id": video_id,
            "title": snippet.get("title", ""),
            "view_count": int(stats.get("viewCount", 0)),
            "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
        }


async def subscribe_to_channel(channel_id: str, webhook_base_url: str) -> bool:
    """Subscribe to PubSubHubbub for a YouTube channel. Returns True on success."""
    from ..constants import YOUTUBE_PUBSUBHUBBUB_HUB_URL, YOUTUBE_WEBSUB_LEASE_SECONDS
    topic_url = f"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channel_id}"
    callback_url = f"{webhook_base_url.rstrip('/')}/api/youtube/webhook/receive"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            YOUTUBE_PUBSUBHUBBUB_HUB_URL,
            data={
                "hub.callback": callback_url,
                "hub.mode": "subscribe",
                "hub.topic": topic_url,
                "hub.verify": "async",
                "hub.lease_seconds": str(YOUTUBE_WEBSUB_LEASE_SECONDS),
            },
        )
        return resp.status_code in (200, 202, 204)


async def unsubscribe_from_channel(channel_id: str, webhook_base_url: str) -> None:
    from ..constants import YOUTUBE_PUBSUBHUBBUB_HUB_URL
    topic_url = f"https://www.youtube.com/xml/feeds/videos.xml?channel_id={channel_id}"
    callback_url = f"{webhook_base_url.rstrip('/')}/api/youtube/webhook/receive"
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            YOUTUBE_PUBSUBHUBBUB_HUB_URL,
            data={"hub.callback": callback_url, "hub.mode": "unsubscribe",
                  "hub.topic": topic_url, "hub.verify": "async"},
        )
```

- [ ] **Step 2: Extend `fetch_analytics_overview` to store the 3 new metrics**

In `service.py`, find the `fetch_analytics_overview` function and update the returned metrics parsing. The function currently builds rows with `metric_name` keys. The new constants string now includes `impressions,impressionsCTR,averageViewDuration` — the function should automatically handle them since the metric names are used as column headers from the API response. Verify the function maps each column name to a `metric_name` row — if it hard-codes `["views", "estimatedMinutesWatched", ...]`, update those lists to include `"impressions"`, `"impressionsCTR"`, `"averageViewDuration"`.

Read `service.py` around `fetch_analytics_overview` and update any hardcoded metric lists to use `YOUTUBE_ANALYTICS_OVERVIEW_METRICS.split(",")`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/youtube/service.py backend/app/constants.py
git commit -m "feat(yt-p2): add fetch_channel_by_handle, fetch_video_stats, subscribe/unsubscribe helpers"
```

---

### Task 6: Webhook Module

**Files:** Create `backend/app/youtube/webhook.py`

- [ ] **Step 1: Create the file**

```python
"""PubSubHubbub webhook endpoints for YouTube Phase 2.

GET  /api/youtube/webhook/verify  — hub subscription challenge echo
POST /api/youtube/webhook/receive — XML feed notification handler

These endpoints are public (no auth) — YouTube calls them directly.
"""

import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response

from ..database import get_client
from ..repositories import youtube_repo
from . import service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube/webhook", tags=["youtube-webhook"])

_ATOM_NS = "http://www.w3.org/2005/Atom"
_YT_NS = "http://www.youtube.com/xml/schemas/2015"


def _parse_notification(body: str) -> list[dict]:
    """Parse Atom XML from YouTube PubSubHubbub → list of notification dicts."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []
    ns = {"atom": _ATOM_NS, "yt": _YT_NS}
    entries = []
    for entry in root.findall("atom:entry", ns):
        video_id = entry.findtext("yt:videoId", default="", namespaces=ns)
        channel_id = entry.findtext("yt:channelId", default="", namespaces=ns)
        title = entry.findtext("atom:title", default="", namespaces=ns)
        updated_str = entry.findtext("atom:updated", default="", namespaces=ns)
        if video_id and channel_id:
            entries.append({"video_id": video_id, "channel_id": channel_id,
                             "title": title, "updated_str": updated_str})
    return entries


@router.get("/verify")
def verify(
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_mode: str = Query(default="", alias="hub.mode"),
):
    """PubSubHubbub subscription verification — echo the challenge."""
    logger.info("WebSub verify: mode=%s", hub_mode)
    return Response(content=hub_challenge, media_type="text/plain")


@router.post("/receive")
async def receive(request: Request, background_tasks: BackgroundTasks):
    """Receive XML feed notification from YouTube hub."""
    body = (await request.body()).decode("utf-8", errors="replace")
    notifications = _parse_notification(body)
    if not notifications:
        return Response(status_code=204)

    client = get_client()

    for notif in notifications:
        channel_id = notif["channel_id"]
        video_id = notif["video_id"]
        title = notif["title"]

        # Detect which user(s) track this channel (own or competitor)
        # Own channel: find user by yt_channel_id in youtube_tokens
        own_rows = client.query(
            "SELECT user_id FROM youtube_tokens FINAL WHERE yt_channel_id = {cid:String} LIMIT 1",
            parameters={"cid": channel_id},
        ).result_rows
        if own_rows:
            user_id = str(own_rows[0][0])
            # Record title history
            background_tasks.add_task(
                _handle_own_channel_notification, user_id, channel_id, video_id, title
            )

        # Competitor channel: find all users tracking this channel
        comp_rows = client.query(
            "SELECT DISTINCT user_id FROM youtube_competitors FINAL "
            "WHERE competitor_channel_id = {cid:String} AND is_deleted = false",
            parameters={"cid": channel_id},
        ).result_rows
        for row in comp_rows:
            user_id = str(row[0])
            background_tasks.add_task(
                _handle_competitor_notification, user_id, channel_id, video_id, title
            )

    return Response(status_code=204)


async def _handle_own_channel_notification(user_id: str, channel_id: str, video_id: str, title: str) -> None:
    """Record title change + schedule Golden Hour check."""
    from ..config import settings
    client = get_client()
    youtube_repo.record_title_if_changed(client, user_id, channel_id, video_id, title)

    # Schedule golden hour check via APScheduler
    if settings.enable_scheduler:
        try:
            from ..scheduler import schedule_golden_hour
            schedule_golden_hour(user_id, channel_id, video_id)
        except Exception:
            logger.exception("Failed to schedule golden hour for video %s", video_id)

    # Preflight check (fire immediately in background)
    try:
        from ..jobs.yt_preflight import run_preflight
        await run_preflight(user_id, video_id, title)
    except Exception:
        logger.exception("Preflight check failed for video %s", video_id)


async def _handle_competitor_notification(user_id: str, channel_id: str, video_id: str, title: str) -> None:
    """Record title history and trigger outlier velocity tracking for competitor video."""
    client = get_client()
    youtube_repo.record_title_if_changed(client, user_id, channel_id, video_id, title)

    if settings.enable_scheduler:
        try:
            from ..scheduler import schedule_velocity_checks
            schedule_velocity_checks(user_id, channel_id, video_id)
        except Exception:
            logger.exception("Failed to schedule velocity checks for video %s", video_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/youtube/webhook.py
git commit -m "feat(yt-p2): add PubSubHubbub webhook module with XML parser"
```

---

### Task 7: Competitor Management Endpoints + New Insight Endpoints

**Files:** Modify `backend/app/youtube/router.py`, create/modify `backend/app/youtube/schemas.py`

- [ ] **Step 1: Add new Pydantic schemas to `backend/app/youtube/schemas.py`**

```python
# Append to schemas.py:

class YoutubeCompetitor(BaseModel):
    competitor_channel_id: str
    competitor_title: str
    competitor_thumbnail_url: str
    webhook_active: bool
    added_at: str


class AddCompetitorRequest(BaseModel):
    handle: str  # @handle or youtube.com/@ URL


class CompetitorOutlier(BaseModel):
    competitor_channel_id: str
    video_id: str
    title: str
    thumbnail_url: str
    view_count: int
    published_at: str
    llm_analysis: str | None


class TitleHistoryEntry(BaseModel):
    title_text: str
    observed_at: str


class YoutubeArchiveSuggestion(BaseModel):
    video_id: str
    original_title: str
    trending_topic: str
    wikipedia_spike_pct: float
    autocomplete_matches: list[str]
    suggestion_type: str
    llm_recommendation: str
    generated_at: str


class ArchiveMinerStatus(BaseModel):
    last_scan: str | None
    suggestions: list[YoutubeArchiveSuggestion]


class VelocityPoint(BaseModel):
    hours: int
    view_count: int
    avg_watch_s: float
    ctr_pct: float


class YoutubePrediction(BaseModel):
    video_id: str
    four_hour_views: int
    four_hour_avg_watch_s: float
    ctr_pct: float
    predicted_30d_views: int
    predicted_low: int
    predicted_high: int
    revenue_low_usd: float
    revenue_high_usd: float
    predicted_at: str
    model_r2: float | None = None


class YoutubeAlert(BaseModel):
    id: str
    video_id: str
    alert_type: str
    alert_body: str
    is_read: bool
    created_at: str


class CrossPlatformDay(BaseModel):
    day: str
    subscribers_gained: int
    subscribers_lost: int
    net_subscribers: int
    has_instagram_reel: bool


class InstagramReelMarker(BaseModel):
    post_date: str
    ig_media_id: str
    thumbnail_url: str
    caption: str


class CrossPlatformResponse(BaseModel):
    days: list[CrossPlatformDay]
    reel_posts: list[InstagramReelMarker]
    correlation: float | None
```

- [ ] **Step 2: Add 8 new routes to `backend/app/youtube/router.py`**

Add these imports at top:
```python
from .schemas import (
    # existing...
    AddCompetitorRequest,
    ArchiveMinerStatus,
    CompetitorOutlier,
    CrossPlatformResponse,
    InstagramReelMarker,
    TitleHistoryEntry,
    YoutubeAlert,
    YoutubeCompetitor,
    YoutubePrediction,
)
```

Add routes:
```python
# ── Competitors ──────────────────────────────────────────────────────────────

@router.get("/competitors", response_model=list[YoutubeCompetitor])
async def list_competitors(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.list_competitors(client, str(current_user.id))


@router.post("/competitors", response_model=YoutubeCompetitor, status_code=201)
async def add_competitor(
    body: AddCompetitorRequest,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()

    count = youtube_repo.count_competitors(client, user_id)
    if count >= settings.competitor_limit_standard:
        raise HTTPException(status_code=429, detail=f"Competitor limit reached ({settings.competitor_limit_standard})")

    token = youtube_repo.find_token(client, user_id)
    if not token:
        raise _channel_not_connected()

    from ..crypto import decrypt_token
    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh)

    competitor = await service.fetch_channel_by_handle(body.handle, access_token)
    if not competitor:
        raise HTTPException(status_code=404, detail="YouTube channel not found for that handle")

    if settings.webhook_base_url:
        ok = await service.subscribe_to_channel(competitor["competitor_channel_id"], settings.webhook_base_url)
        competitor["webhook_active"] = ok
    else:
        competitor["webhook_active"] = False

    youtube_repo.upsert_competitor(client, user_id, token["yt_channel_id"], competitor)
    competitor["added_at"] = str(datetime.now(timezone.utc))
    return YoutubeCompetitor(**competitor)


@router.delete("/competitors/{competitor_channel_id}", status_code=204)
async def remove_competitor(
    competitor_channel_id: str,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()
    if settings.webhook_base_url:
        await service.unsubscribe_from_channel(competitor_channel_id, settings.webhook_base_url)
    youtube_repo.delete_competitor(client, user_id, competitor_channel_id)


# ── Insights: Outliers ───────────────────────────────────────────────────────

@router.get("/insights/outliers", response_model=list[CompetitorOutlier])
def get_outliers(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_competitor_outliers(client, str(current_user.id))


@router.get("/insights/title-history/{video_id}", response_model=list[TitleHistoryEntry])
def get_title_history(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_title_history(client, str(current_user.id), video_id)


# ── Insights: Velocity + Predictions ────────────────────────────────────────

@router.get("/insights/velocity/{video_id}")
def get_velocity(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_velocity(client, str(current_user.id), video_id)


@router.get("/insights/predictions/{video_id}", response_model=YoutubePrediction | None)
def get_prediction(video_id: str, current_user: User = Depends(get_current_user)):
    client = get_client()
    pred = youtube_repo.get_prediction(client, str(current_user.id), video_id)
    if pred is None:
        return None
    model = youtube_repo.get_model_state(client, str(current_user.id))
    return YoutubePrediction(**pred, model_r2=model["r2_score"] if model else None)


# ── Insights: Archive Miner ──────────────────────────────────────────────────

@router.get("/insights/archive", response_model=ArchiveMinerStatus)
def get_archive(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    suggestions = youtube_repo.get_archive_suggestions(client, user_id)
    last_scan = youtube_repo.get_last_archive_scan(client, user_id)
    return ArchiveMinerStatus(
        last_scan=str(last_scan) if last_scan else None,
        suggestions=suggestions,
    )


@router.post("/insights/archive/refresh", status_code=202)
async def refresh_archive(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    client = get_client()
    last_scan = youtube_repo.get_last_archive_scan(client, user_id)
    if last_scan:
        from datetime import timedelta
        if (datetime.now(timezone.utc).replace(tzinfo=None) - last_scan).total_seconds() < 86400:
            raise HTTPException(status_code=429, detail="Archive scan already ran today")
    background_tasks.add_task(_run_archive_miner_for_user, user_id)
    return {"status": "queued"}


async def _run_archive_miner_for_user(user_id: str) -> None:
    from ..jobs.yt_archive_miner import run_for_user
    try:
        await run_for_user(user_id)
    except Exception:
        logger.exception("Archive miner failed for user %s", user_id)


# ── Insights: Alerts ─────────────────────────────────────────────────────────

@router.get("/insights/alerts", response_model=list[YoutubeAlert])
def get_alerts(current_user: User = Depends(get_current_user)):
    client = get_client()
    return youtube_repo.get_alerts(client, str(current_user.id))


# ── Insights: Cross-Platform ─────────────────────────────────────────────────

@router.get("/insights/cross-platform", response_model=CrossPlatformResponse)
def get_cross_platform(
    days: int = Query(default=90, ge=7, le=365),
    current_user: User = Depends(get_current_user),
):
    from datetime import timedelta
    import numpy as np

    client = get_client()
    user_id = str(current_user.id)
    start_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    yt_rows = youtube_repo.get_daily_subscriber_net(client, user_id, start_date)
    ig_rows = youtube_repo.get_instagram_reel_posts(client, user_id, start_date)

    ig_dates = {r["post_date"] for r in ig_rows}
    day_map = {r["day"]: r for r in yt_rows}

    # Build unified day list
    result_days = [
        CrossPlatformDay(
            day=r["day"],
            subscribers_gained=r["gained"],
            subscribers_lost=r["lost"],
            net_subscribers=r["gained"] - r["lost"],
            has_instagram_reel=r["day"] in ig_dates,
        )
        for r in yt_rows
    ]

    # Pearson correlation between IG reel days and subscriber gains
    correlation = None
    if len(result_days) >= 10:
        try:
            ig_flag = np.array([1 if d.has_instagram_reel else 0 for d in result_days])
            gains = np.array([d.subscribers_gained for d in result_days])
            if gains.std() > 0 and ig_flag.std() > 0:
                correlation = float(np.corrcoef(ig_flag, gains)[0, 1])
        except Exception:
            pass

    return CrossPlatformResponse(
        days=result_days,
        reel_posts=[InstagramReelMarker(**r) for r in ig_rows],
        correlation=round(correlation, 3) if correlation is not None else None,
    )
```

- [ ] **Step 3: Add missing import at top of `router.py`**

```python
from datetime import datetime, timezone
```

- [ ] **Step 4: Smoke test** — start backend, hit `GET /api/youtube/competitors` (should return 200 with empty list if connected). Hit `GET /api/youtube/insights/archive` (should return 200).

- [ ] **Step 5: Commit**

```bash
git add backend/app/youtube/router.py backend/app/youtube/schemas.py
git commit -m "feat(yt-p2): add competitor management + 8 new insight endpoints"
```

---

### Task 8: Outlier Detection Job

**Files:** Create `backend/app/jobs/yt_outlier_detection.py`

- [ ] **Step 1: Create the file**

```python
"""Outlier detection for competitor channels.

Called by two paths:
1. Scheduled: `_run()` — processes all users' competitors daily (fallback when no webhook).
2. Event: `check_video_after_delay(user_id, channel_id, video_id, hours)` —
   called by scheduler at +4h / +12h / +24h after a webhook notification.
"""

import asyncio
import logging
import statistics

from ..database import get_client
from ..repositories import youtube_repo
from ..crypto import decrypt_token
from ..config import settings
from . import youtube_service_module as _svc  # alias to avoid circular

logger = logging.getLogger(__name__)

_OUTLIER_MULTIPLIER = 3.0  # video must be 3x channel average to flag


async def check_video_after_delay(user_id: str, channel_id: str, video_id: str, hours: int) -> None:
    """Fetch current stats for a competitor video at `hours` post-publish and check for outlier."""
    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        return
    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    try:
        from ..youtube import service
        access_token = await service.refresh_access_token(refresh)
        stats = await service.fetch_video_stats(video_id, access_token)
    except Exception:
        logger.exception("fetch_video_stats failed for %s", video_id)
        return
    if not stats:
        return

    view_count = stats["view_count"]
    youtube_repo.insert_velocity_point(client, user_id, channel_id, video_id, hours, view_count)

    # Only make the outlier call at 24h when we have stable data
    if hours < 24:
        return

    baseline_videos = youtube_repo.get_competitor_videos_for_baseline(client, user_id, channel_id)
    if len(baseline_videos) < 5:
        return
    avg_views = statistics.mean(v["view_count"] for v in baseline_videos if v["view_count"] > 0) or 1

    if view_count >= avg_views * _OUTLIER_MULTIPLIER:
        await _generate_outlier_analysis(client, user_id, video_id, stats["title"], view_count, avg_views)


async def _generate_outlier_analysis(client, user_id: str, video_id: str, title: str, view_count: int, avg_views: float) -> None:
    """Ask LLM to reverse-engineer why this video outperformed."""
    from ..ai.client import synthesize, _model_for_feature
    ratio = view_count / max(avg_views, 1)
    prompt = (
        f"A YouTube video titled \"{title}\" received {view_count:,} views in 24 hours, "
        f"which is {ratio:.1f}x above the channel's average of {avg_views:,.0f} views. "
        "Analyze in 2-3 sentences why this video likely outperformed: consider the title format, "
        "topic novelty, hook strength, and thumbnail concept. Be specific and actionable."
    )
    try:
        result = await synthesize(
            model=_model_for_feature(),
            system="You are a YouTube content strategist. Be concise and data-driven.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        analysis = result.text.strip()
    except Exception:
        logger.exception("LLM outlier analysis failed for video %s", video_id)
        analysis = f"Video performed {ratio:.1f}x above channel average. Manual review recommended."

    youtube_repo.mark_video_outlier(client, user_id, video_id, analysis)


async def _run() -> None:
    """Daily batch: for all users, fetch latest competitor videos and check baselines."""
    client = get_client()
    # Get all distinct (user_id, competitor_channel_id) pairs
    rows = client.query(
        "SELECT DISTINCT user_id, competitor_channel_id FROM youtube_competitors FINAL WHERE is_deleted = false"
    ).result_rows

    for row in rows:
        user_id, competitor_channel_id = str(row[0]), row[1]
        token = youtube_repo.find_token(client, user_id)
        if not token:
            continue
        try:
            refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
            from ..youtube import service
            access_token = await service.refresh_access_token(refresh)
            videos = await service.fetch_latest_videos(competitor_channel_id, access_token, max_results=5)
        except Exception:
            logger.exception("Failed to fetch videos for competitor %s", competitor_channel_id)
            continue

        if not videos:
            continue

        # Upsert fetched videos
        for v in videos:
            v["competitor_channel_id"] = competitor_channel_id
        youtube_repo.bulk_insert_competitor_videos(client, user_id, videos)

        # Record title changes
        channel_snapshot = youtube_repo.find_channel(client, user_id)
        own_channel_id = channel_snapshot["yt_channel_id"] if channel_snapshot else ""
        for v in videos:
            youtube_repo.record_title_if_changed(client, user_id, competitor_channel_id, v["video_id"], v.get("title", ""))

        # Check most recent video for outlier (after 24h+ since publish)
        from datetime import datetime, timezone, timedelta
        for v in videos[:1]:  # Only newest video
            published = v.get("published_at")
            if not published:
                continue
            age_hours = (datetime.now(timezone.utc).replace(tzinfo=None) - published).total_seconds() / 3600
            if 20 <= age_hours <= 48:  # Check in the 20-48h window
                await check_video_after_delay(user_id, competitor_channel_id, v["video_id"], 24)


def main() -> None:
    asyncio.run(_run())
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/jobs/yt_outlier_detection.py
git commit -m "feat(yt-p2): add outlier detection job with LLM reverse engineering"
```

---

### Task 9: Competitor Poll Fallback + Velocity Tracker

**Files:** Create `backend/app/jobs/yt_competitor_poll.py`, `backend/app/jobs/yt_velocity_tracker.py`

- [ ] **Step 1: Create `yt_competitor_poll.py`** (used when `WEBHOOK_BASE_URL` is absent)

```python
"""Daily competitor poll — fallback when PubSubHubbub is not configured."""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def _run() -> None:
    from .yt_outlier_detection import _run as outlier_run
    await outlier_run()


def main() -> None:
    asyncio.run(_run())
```

- [ ] **Step 2: Create `yt_velocity_tracker.py`** (hourly velocity checks for own-channel videos)

```python
"""Hourly velocity tracker for newly published own-channel videos.

Fired at +1h, +2h, +3h, +4h after publish by APScheduler date jobs.
Stores results in youtube_competitor_velocity using own channel_id.
After the 4h point, retrains the predictive model and stores a prediction.
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def record_velocity(user_id: str, channel_id: str, video_id: str, hours: int) -> None:
    """Fetch current stats and store velocity point. At 4h, trigger prediction."""
    from ..database import get_client
    from ..repositories import youtube_repo
    from ..crypto import decrypt_token
    from ..config import settings
    from ..youtube import service

    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        return

    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    try:
        access_token = await service.refresh_access_token(refresh)
    except Exception:
        logger.exception("Token refresh failed for user %s", user_id)
        return

    # Fetch video-level analytics (CTR + avg watch time need Analytics API)
    stats = await service.fetch_video_stats(video_id, access_token)
    if not stats:
        return

    youtube_repo.insert_velocity_point(
        client, user_id, channel_id, video_id, hours,
        view_count=stats["view_count"],
        avg_watch_s=0.0,  # Analytics API not queried here for simplicity
        ctr_pct=0.0,
    )

    if hours == 4:
        await _make_prediction(client, user_id, video_id, stats["view_count"])


async def _make_prediction(client, user_id: str, video_id: str, four_hour_views: int) -> None:
    from ..youtube.predictive_model import train_model, predict
    from ..repositories import youtube_repo

    samples = youtube_repo.get_own_velocity_samples(client, user_id)
    model_state = youtube_repo.get_model_state(client, user_id)

    # Retrain if we have enough samples
    if len(samples) >= 5:
        model_state = train_model(samples)
        youtube_repo.upsert_model_state(client, user_id, model_state)

    if not model_state:
        return

    predicted, low, high = predict(model_state, four_hour_views, 0.0, 0.0)
    from ..config import settings
    rpm = settings.default_rpm_usd
    youtube_repo.upsert_prediction(client, user_id, {
        "video_id": video_id,
        "four_hour_views": four_hour_views,
        "four_hour_avg_watch_s": 0.0,
        "ctr_pct": 0.0,
        "predicted_30d_views": predicted,
        "predicted_low": low,
        "predicted_high": high,
        "revenue_low_usd": round(low / 1000 * rpm, 2),
        "revenue_high_usd": round(high / 1000 * rpm, 2),
    })
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/jobs/yt_competitor_poll.py backend/app/jobs/yt_velocity_tracker.py
git commit -m "feat(yt-p2): add competitor poll fallback and velocity tracker"
```

---

### Task 10: Golden Hour + Preflight Jobs

**Files:** Create `backend/app/jobs/yt_golden_hour.py`, `backend/app/jobs/yt_preflight.py`

- [ ] **Step 1: Create `yt_golden_hour.py`**

```python
"""Golden Hour alert — fires 60 minutes after a video is published.

Compares the 60-minute view count to the channel's baseline 60-minute
performance. Stores an alert in youtube_alerts.
"""

import asyncio
import logging
import statistics

logger = logging.getLogger(__name__)

_UNDER_THRESHOLD = 0.5   # < 50% of baseline = underperforming alert
_OVER_THRESHOLD = 2.0    # > 200% of baseline = viral alert


async def run_golden_hour(user_id: str, channel_id: str, video_id: str) -> None:
    from ..database import get_client
    from ..repositories import youtube_repo
    from ..crypto import decrypt_token
    from ..config import settings
    from ..youtube import service

    client = get_client()
    token = youtube_repo.find_token(client, user_id)
    if not token:
        return

    refresh = decrypt_token(token["refresh_token"], settings.jwt_secret_key)
    try:
        access_token = await service.refresh_access_token(refresh)
        stats = await service.fetch_video_stats(video_id, access_token)
    except Exception:
        logger.exception("Golden hour fetch failed for video %s", video_id)
        return
    if not stats:
        return

    current_views = stats["view_count"]
    # Store the 1-hour velocity point
    youtube_repo.insert_velocity_point(client, user_id, channel_id, video_id, 1, current_views)

    # Compute baseline: average 1h view count from historical velocity data
    baseline_rows = client.query(
        "SELECT avg(view_count) FROM youtube_competitor_velocity FINAL "
        "WHERE user_id = {uid:UUID} AND channel_id = {cid:String} AND hours_since_publish = 1 "
        "AND video_id != {vid:String}",
        parameters={"uid": user_id, "cid": channel_id, "vid": video_id},
    ).result_rows
    baseline = float(baseline_rows[0][0]) if baseline_rows and baseline_rows[0][0] else 0

    if baseline < 10:
        # Not enough history — store raw point only, no alert
        return

    ratio = current_views / baseline
    if ratio < _UNDER_THRESHOLD:
        alert_body = (
            f"Your video has {current_views:,} views after 1 hour — {ratio:.0%} of your typical baseline. "
            "Consider updating the title or thumbnail now while the video is still fresh."
        )
        youtube_repo.insert_alert(client, user_id, video_id, "GOLDEN_HOUR_UNDER", alert_body)
    elif ratio > _OVER_THRESHOLD:
        alert_body = (
            f"Your video has {current_views:,} views after 1 hour — {ratio:.1f}× your typical baseline! "
            "Jump into the comments now to boost engagement while it's trending."
        )
        youtube_repo.insert_alert(client, user_id, video_id, "GOLDEN_HOUR_OVER", alert_body)
```

- [ ] **Step 2: Create `yt_preflight.py`**

```python
"""Preflight AI check — fires immediately when a video is published via webhook.

Checks the video title for common CTR anti-patterns and stores the result
as a PREFLIGHT alert.
"""

import json
import logging

logger = logging.getLogger(__name__)


async def run_preflight(user_id: str, video_id: str, title: str) -> None:
    from ..database import get_client
    from ..repositories import youtube_repo
    from ..ai.client import synthesize, _model_for_feature

    if not title:
        return

    prompt = (
        f'Analyze this YouTube video title for CTR best practices: "{title}"\n\n'
        "Return a JSON object with:\n"
        '- "score": integer 0-100 (100 = perfect)\n'
        '- "issues": array of short strings describing problems found\n'
        '- "suggestions": array of short actionable improvements\n\n'
        "Check: title length (flag if >60 chars), presence of a hook or curiosity gap, "
        "keyword strength, mobile readability, and emotional trigger words."
    )

    try:
        result = await synthesize(
            model=_model_for_feature(),
            system="You are a YouTube SEO expert. Return only valid JSON.",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            output_format={"type": "object", "properties": {
                "score": {"type": "integer"},
                "issues": {"type": "array", "items": {"type": "string"}},
                "suggestions": {"type": "array", "items": {"type": "string"}},
            }},
        )
        data = json.loads(result.text)
    except Exception:
        logger.exception("Preflight AI failed for video %s", video_id)
        return

    score = data.get("score", 0)
    if score >= 80:
        return  # No alert needed for high-scoring titles

    client = get_client()
    youtube_repo.insert_alert(client, user_id, video_id, "PREFLIGHT", json.dumps(data))
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/jobs/yt_golden_hour.py backend/app/jobs/yt_preflight.py
git commit -m "feat(yt-p2): add golden hour alert and preflight title check jobs"
```

---

### Task 11: Archive Miner Job

**Files:** Create `backend/app/jobs/yt_archive_miner.py`

- [ ] **Step 1: Create the file**

```python
"""Archive Miner — weekly job that surfaces revival opportunities from old videos.

For each user's videos older than 1 year:
1. LLM extracts the core topic keyword + Wikipedia article title.
2. YouTube Autocomplete API checks if the topic still has search demand.
3. Wikipedia Pageviews API checks for a trending spike (last 7d vs prior 23d).
4. If either signal fires, LLM generates a specific revival recommendation.
"""

import asyncio
import json
import logging

import httpx

from ..config import settings
from ..database import get_client
from ..repositories import youtube_repo

logger = logging.getLogger(__name__)


async def _extract_topic(title: str, description: str) -> dict:
    """Returns {"keyword": str, "wikipedia_article": str}."""
    from ..ai.client import synthesize, _model_for_feature
    prompt = (
        f'Video title: "{title}"\nDescription snippet: "{description[:200]}"\n\n'
        "Return a JSON object with:\n"
        '- "keyword": the single best YouTube search keyword for this topic (2-4 words)\n'
        '- "wikipedia_article": the exact Wikipedia article title for this topic (use proper capitalization)\n'
        "Keep both short and specific. If no clear Wikipedia article exists, use the keyword as article."
    )
    result = await synthesize(
        model=_model_for_feature(),
        system="Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=80,
    )
    data = json.loads(result.text)
    return {"keyword": data.get("keyword", title[:40]), "wikipedia_article": data.get("wikipedia_article", title[:40])}


async def _check_youtube_autocomplete(keyword: str) -> list[str]:
    """Returns autocomplete suggestions for keyword from YouTube."""
    url = "http://suggestqueries.google.com/complete/search"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, params={"client": "firefox", "ds": "yt", "q": keyword})
            if resp.status_code != 200:
                return []
            data = resp.json()
            return list(data[1]) if len(data) > 1 else []
    except Exception:
        return []


async def _check_wikipedia_spike(article: str) -> float:
    """Returns % change in pageviews (last 7d avg vs prior 23d avg). 0.0 on error."""
    from datetime import datetime, timedelta
    end = datetime.utcnow()
    start = end - timedelta(days=30)
    url = (
        f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
        f"/en.wikipedia/all-access/all-agents/{article.replace(' ', '_')}/daily"
        f"/{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"User-Agent": "InfluenceIQ/2.0 (analytics dashboard)"})
            if resp.status_code != 200:
                return 0.0
            items = resp.json().get("items", [])
            if len(items) < 14:
                return 0.0
            recent_7d_avg = sum(i["views"] for i in items[-7:]) / 7
            prior_avg = sum(i["views"] for i in items[:-7]) / max(len(items) - 7, 1)
            if prior_avg == 0:
                return 0.0
            return (recent_7d_avg - prior_avg) / prior_avg * 100
    except Exception:
        return 0.0


async def _generate_recommendation(title: str, year: int, keyword: str, spike_pct: float, suggestions: list[str]) -> dict:
    """Returns {"suggestion_type": str, "llm_recommendation": str}."""
    from ..ai.client import synthesize, _model_for_feature
    context = []
    if spike_pct > 30:
        context.append(f"Wikipedia pageviews for '{keyword}' spiked +{spike_pct:.0f}% in the last 7 days")
    if suggestions:
        context.append(f"YouTube autocomplete shows active demand: {', '.join(suggestions[:3])}")
    context_str = ". ".join(context)

    prompt = (
        f'Old video: "{title}" (published {year})\n'
        f"Trend signal: {context_str}\n\n"
        "Suggest ONE specific action:\n"
        '- "REMAKE": make a fresh, updated version targeting the trending angle\n'
        '- "SHORT": clip a key moment into a YouTube Short\n'
        '- "UPDATE": update title/description/chapters to capture new search traffic\n\n'
        "Return JSON with:\n"
        '- "suggestion_type": one of REMAKE / SHORT / UPDATE\n'
        '- "llm_recommendation": 1-2 sentence specific action the creator should take'
    )
    result = await synthesize(
        model=_model_for_feature(),
        system="Return only valid JSON.",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
    )
    data = json.loads(result.text)
    return {
        "suggestion_type": data.get("suggestion_type", "UPDATE"),
        "llm_recommendation": data.get("llm_recommendation", "Consider updating this video."),
    }


async def run_for_user(user_id: str) -> None:
    """Process one user's old videos and write archive suggestions."""
    from datetime import datetime, timedelta

    client = get_client()
    cutoff = datetime.utcnow() - timedelta(days=365)

    # Fetch old videos from ClickHouse
    rows = client.query(
        "SELECT video_id, title, description FROM youtube_videos FINAL "
        "WHERE user_id = {uid:UUID} AND published_at < {cutoff:DateTime} "
        "ORDER BY published_at DESC LIMIT {limit:UInt32}",
        parameters={"uid": user_id, "cutoff": cutoff, "limit": settings.archive_miner_max_videos_per_run},
    ).result_rows

    if not rows:
        return

    for video_id, title, description in rows:
        try:
            topic = await _extract_topic(title, description)
            keyword = topic["keyword"]
            wiki_article = topic["wikipedia_article"]

            suggestions = await _check_youtube_autocomplete(keyword)
            spike_pct = await _check_wikipedia_spike(wiki_article)

            # Only proceed if there's a real signal
            if spike_pct < 30 and not any(keyword.lower() in s.lower() for s in suggestions):
                continue

            from datetime import datetime as dt
            year = cutoff.year  # approximate
            rec = await _generate_recommendation(title, year, keyword, spike_pct, suggestions)

            youtube_repo.upsert_archive_suggestion(client, user_id, {
                "video_id": video_id,
                "original_title": title,
                "trending_topic": keyword,
                "wikipedia_spike_pct": spike_pct,
                "autocomplete_matches": suggestions[:5],
                "suggestion_type": rec["suggestion_type"],
                "llm_recommendation": rec["llm_recommendation"],
            })
        except Exception:
            logger.exception("Archive miner failed for video %s user %s", video_id, user_id)


async def _run() -> None:
    """Weekly batch: run archive miner for all connected YouTube users."""
    client = get_client()
    rows = client.query("SELECT DISTINCT user_id FROM youtube_tokens FINAL").result_rows
    for row in rows:
        await run_for_user(str(row[0]))


def main() -> None:
    asyncio.run(_run())
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/jobs/yt_archive_miner.py
git commit -m "feat(yt-p2): add archive miner job with Wikipedia + autocomplete trend signals"
```

---

### Task 12: Predictive Model

**Files:** Create `backend/app/youtube/predictive_model.py`

- [ ] **Step 1: Create the file**

```python
"""Linear regression model for 30-day view prediction.

Input features: 4-hour view count, 4-hour average watch time (seconds), CTR %.
Target: 30-day view count.

Trained on the user's own historical videos that have both 4h velocity data
and a mature (30d+) final view count. Falls back to a simple multiplier
when insufficient training data exists.
"""

import json
import logging

import numpy as np
from sklearn.linear_model import LinearRegression

logger = logging.getLogger(__name__)

_MIN_SAMPLES = 5
_FALLBACK_MULTIPLIER = 180  # 4h views × 180 ≈ rough 30-day estimate


def train_model(samples: list[dict]) -> dict:
    """Train on historical velocity samples.

    Each sample: {four_hour_views, four_hour_avg_watch_s, ctr_pct, final_views}
    Returns serializable state dict or {} if too few samples.
    """
    if len(samples) < _MIN_SAMPLES:
        return {}
    X = np.array([[s["four_hour_views"], s["four_hour_avg_watch_s"], s["ctr_pct"]]
                  for s in samples], dtype=float)
    y = np.array([s["final_views"] for s in samples], dtype=float)
    model = LinearRegression()
    model.fit(X, y)
    r2 = float(model.score(X, y))
    return {
        "coefficients": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "r2_score": r2,
        "sample_size": len(samples),
    }


def predict(model_state: dict, four_hour_views: int, avg_watch_s: float, ctr_pct: float) -> tuple[int, int, int]:
    """Returns (predicted, low, high) view counts.

    Falls back to multiplier if model_state is empty or missing keys.
    """
    if not model_state or "coefficients" not in model_state:
        predicted = int(four_hour_views * _FALLBACK_MULTIPLIER)
    else:
        coef = model_state["coefficients"]
        intercept = model_state["intercept"]
        raw = intercept + coef[0] * four_hour_views + coef[1] * avg_watch_s + coef[2] * ctr_pct
        predicted = max(0, int(raw))

    r2 = model_state.get("r2_score", 0.0) if model_state else 0.0
    # Wider confidence band for low-accuracy models
    margin_pct = 0.50 if r2 < 0.5 else 0.25
    margin = max(int(predicted * margin_pct), 100)
    low = max(0, predicted - margin)
    high = predicted + margin
    return predicted, low, high
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/youtube/predictive_model.py
git commit -m "feat(yt-p2): add linear regression predictive model for 30-day views"
```

---

### Task 13: Register Jobs in Scheduler + Mount Webhook Router

**Files:** Modify `backend/app/scheduler.py`, `backend/app/main.py`

- [ ] **Step 1: Add 3 new async wrappers + `schedule_golden_hour` + `schedule_velocity_checks` to `scheduler.py`**

Add after the existing `_run_weekly_digest` function:

```python
async def _run_yt_outlier_detection() -> None:
    from .jobs import yt_competitor_poll
    if not settings.webhook_base_url:
        try:
            await yt_competitor_poll._run()
        except Exception:
            logger.exception("Scheduled yt_competitor_poll failed")


async def _run_yt_archive_miner() -> None:
    if not settings.ollama_api_key:
        logger.info("Scheduled yt_archive_miner skipped — OLLAMA_API_KEY not set")
        return
    from .jobs import yt_archive_miner
    try:
        await yt_archive_miner._run()
    except Exception:
        logger.exception("Scheduled yt_archive_miner failed")


def schedule_golden_hour(user_id: str, channel_id: str, video_id: str) -> None:
    """Schedule a golden hour check 60 minutes from now."""
    global _scheduler
    if _scheduler is None:
        return
    from datetime import datetime, timedelta, timezone
    from apscheduler.triggers.date import DateTrigger
    from .jobs.yt_golden_hour import run_golden_hour
    run_at = datetime.now(timezone.utc) + timedelta(minutes=60)
    job_id = f"golden_hour_{user_id}_{video_id}"
    _scheduler.add_job(
        run_golden_hour,
        DateTrigger(run_date=run_at),
        id=job_id,
        args=[user_id, channel_id, video_id],
        replace_existing=True,
        misfire_grace_time=600,
    )


def schedule_velocity_checks(user_id: str, channel_id: str, video_id: str) -> None:
    """Schedule velocity checks at +4h, +12h, +24h for a competitor video."""
    global _scheduler
    if _scheduler is None:
        return
    from datetime import datetime, timedelta, timezone
    from apscheduler.triggers.date import DateTrigger
    from .jobs.yt_outlier_detection import check_video_after_delay
    now = datetime.now(timezone.utc)
    for hours in (4, 12, 24):
        run_at = now + timedelta(hours=hours)
        job_id = f"velocity_{user_id}_{video_id}_{hours}h"
        _scheduler.add_job(
            check_video_after_delay,
            DateTrigger(run_date=run_at),
            id=job_id,
            args=[user_id, channel_id, video_id, hours],
            replace_existing=True,
            misfire_grace_time=1800,
        )
```

- [ ] **Step 2: Register new cron jobs in `start_scheduler()` in `scheduler.py`**

Inside `start_scheduler()`, after the `weekly_digest` job registration, add:

```python
    sch.add_job(
        _run_yt_outlier_detection,
        CronTrigger(hour=2, minute=0),
        id="yt_outlier_detection",
        name="Daily YouTube competitor outlier scan (polling fallback)",
        replace_existing=True,
    )

    sch.add_job(
        _run_yt_archive_miner,
        CronTrigger(
            day_of_week=settings.scheduler_archive_miner_day,
            hour=settings.scheduler_archive_miner_hour,
            minute=30,
        ),
        id="yt_archive_miner",
        name="Weekly YouTube archive miner",
        replace_existing=True,
    )
```

- [ ] **Step 3: Mount webhook router in `backend/app/main.py`**

Add import:
```python
from .youtube.webhook import router as youtube_webhook_router
```

Add router registration after `app.include_router(youtube_router)`:
```python
app.include_router(youtube_webhook_router)
```

- [ ] **Step 4: Smoke test** — restart backend. Confirm startup logs show 2 new scheduled jobs (`yt_outlier_detection`, `yt_archive_miner`). Hit `GET /api/youtube/webhook/verify?hub.challenge=test&hub.mode=subscribe` — should return `test` as plain text.

- [ ] **Step 5: Commit**

```bash
git add backend/app/scheduler.py backend/app/main.py
git commit -m "feat(yt-p2): register archive miner + outlier cron jobs and webhook router"
```

---

### Task 14: Frontend TypeScript Types

**Files:** Modify `frontend/src/api/youtubeTypes.ts`

- [ ] **Step 1: Append new types**

```typescript
// ── YouTube Phase 2 types ────────────────────────────────────────────────────

export interface YoutubeCompetitor {
  competitor_channel_id: string;
  competitor_title: string;
  competitor_thumbnail_url: string;
  webhook_active: boolean;
  added_at: string;
}

export interface CompetitorOutlier {
  competitor_channel_id: string;
  video_id: string;
  title: string;
  thumbnail_url: string;
  view_count: number;
  published_at: string;
  llm_analysis: string | null;
}

export interface TitleHistoryEntry {
  title_text: string;
  observed_at: string;
}

export interface YoutubeArchiveSuggestion {
  video_id: string;
  original_title: string;
  trending_topic: string;
  wikipedia_spike_pct: number;
  autocomplete_matches: string[];
  suggestion_type: "REMAKE" | "SHORT" | "UPDATE";
  llm_recommendation: string;
  generated_at: string;
}

export interface ArchiveMinerStatus {
  last_scan: string | null;
  suggestions: YoutubeArchiveSuggestion[];
}

export interface VelocityPoint {
  hours: number;
  view_count: number;
  avg_watch_s: number;
  ctr_pct: number;
}

export interface YoutubePrediction {
  video_id: string;
  four_hour_views: number;
  four_hour_avg_watch_s: number;
  ctr_pct: number;
  predicted_30d_views: number;
  predicted_low: number;
  predicted_high: number;
  revenue_low_usd: number;
  revenue_high_usd: number;
  predicted_at: string;
  model_r2: number | null;
}

export interface YoutubeAlert {
  id: string;
  video_id: string;
  alert_type: string;
  alert_body: string;
  is_read: boolean;
  created_at: string;
}

export interface CrossPlatformDay {
  day: string;
  subscribers_gained: number;
  subscribers_lost: number;
  net_subscribers: number;
  has_instagram_reel: boolean;
}

export interface InstagramReelMarker {
  post_date: string;
  ig_media_id: string;
  thumbnail_url: string;
  caption: string;
}

export interface CrossPlatformResponse {
  days: CrossPlatformDay[];
  reel_posts: InstagramReelMarker[];
  correlation: number | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/youtubeTypes.ts
git commit -m "feat(yt-p2): add TypeScript types for all Phase 2 features"
```

---

### Task 15: Updated Sidebar Navigation

**Files:** Modify `frontend/src/components/youtube/YoutubeDashboardLayout.tsx`

- [ ] **Step 1: Find the `YT_NAV` array and replace it**

Find:
```typescript
const YT_NAV = [
  { label: "Overview", href: "/youtube" },
  { label: "Retention Studio", href: "/youtube/retention" },
];
```

Replace with:
```typescript
const YT_NAV = [
  { label: "Overview", href: "/youtube" },
  { label: "Retention Studio", href: "/youtube/retention" },
  { label: "Outlier Radar", href: "/youtube/competitors" },
  { label: "Predictive Studio", href: "/youtube/predict" },
  { label: "Archive Miner", href: "/youtube/archive" },
  { label: "Cross-Platform", href: "/youtube/funnel" },
];
```

- [ ] **Step 2: Smoke test** — start frontend (`npm run dev`), navigate to `/youtube`. Confirm 6 sidebar items appear and links resolve without 404 (pages don't exist yet — that's OK, the routes are next).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/youtube/YoutubeDashboardLayout.tsx
git commit -m "feat(yt-p2): add 4 new nav items to YouTube sidebar"
```

---

### Task 16: Outlier Radar Page

**Files:** Create `frontend/src/pages/YoutubeCompetitorsPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ExternalLink, TrendingUp } from "lucide-react";
import apiClient from "../api/client";
import type {
  YoutubeCompetitor, CompetitorOutlier, TitleHistoryEntry,
} from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { fmt } from "../lib/fmt";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function YoutubeCompetitorsPage() {
  const [competitors, setCompetitors] = useState<YoutubeCompetitor[]>([]);
  const [outliers, setOutliers] = useState<CompetitorOutlier[]>([]);
  const [handle, setHandle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedOutlier, setSelectedOutlier] = useState<CompetitorOutlier | null>(null);
  const [titleHistory, setTitleHistory] = useState<TitleHistoryEntry[]>([]);

  const load = async () => {
    setLoading(true);
    const [compRes, outlierRes] = await Promise.all([
      apiClient.get<YoutubeCompetitor[]>("/youtube/competitors").catch(() => null),
      apiClient.get<CompetitorOutlier[]>("/youtube/insights/outliers").catch(() => null),
    ]);
    setCompetitors(compRes?.data ?? []);
    setOutliers(outlierRes?.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCompetitor = async () => {
    if (!handle.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await apiClient.post("/youtube/competitors", { handle: handle.trim() });
      setHandle("");
      await load();
    } catch (e: any) {
      setAddError(e?.response?.data?.detail ?? "Failed to add competitor");
    } finally {
      setAdding(false);
    }
  };

  const removeCompetitor = async (id: string) => {
    await apiClient.delete(`/youtube/competitors/${id}`).catch(() => null);
    await load();
  };

  const loadTitleHistory = async (videoId: string) => {
    const res = await apiClient.get<TitleHistoryEntry[]>(`/youtube/insights/title-history/${videoId}`).catch(() => null);
    setTitleHistory(res?.data ?? []);
  };

  return (
    <YoutubeDashboardLayout active="Outlier Radar">
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Outlier Radar</h1>
        <p className="text-sm text-ink/50 mb-6">Track competitors and get AI analysis when their videos go viral.</p>

        {/* Add competitor */}
        <div className="card-hairline glass rounded-2xl p-4 mb-6">
          <p className="text-sm font-medium text-ink mb-2">Add Competitor Channel</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/50 border border-white/30 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/30"
              placeholder="@channelhandle or youtube.com/@handle"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCompetitor()}
            />
            <button
              onClick={addCompetitor}
              disabled={adding || !handle.trim()}
              className="btn-glow bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={14} /> {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Competitor list */}
          <div className="card-hairline glass rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider mb-3">Tracking ({competitors.length})</p>
            {competitors.length === 0 && !loading && (
              <p className="text-sm text-ink/40 text-center py-6">No competitors tracked yet.</p>
            )}
            {competitors.map(c => (
              <div key={c.competitor_channel_id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/40 transition-colors">
                {c.competitor_thumbnail_url && (
                  <img src={c.competitor_thumbnail_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.competitor_title}</p>
                  {c.webhook_active && <span className="text-[10px] text-green-600 font-medium">● Live</span>}
                </div>
                <button onClick={() => removeCompetitor(c.competitor_channel_id)} className="text-ink/30 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Outlier feed */}
          <div className="lg:col-span-2 space-y-4">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wider">Outlier Videos</p>
            {outliers.length === 0 && !loading && (
              <div className="card-hairline glass rounded-2xl p-8 text-center text-ink/40 text-sm">
                No outliers detected yet. Add competitors and check back after the next sync.
              </div>
            )}
            {outliers.map(o => (
              <motion.div
                key={o.video_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-hairline glass rounded-2xl p-4"
              >
                <div className="flex gap-3">
                  {o.thumbnail_url && (
                    <img src={o.thumbnail_url} className="w-24 h-14 rounded-lg object-cover flex-shrink-0" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2">{o.title}</p>
                      <span className="chip bg-red-100 text-red-700 text-xs whitespace-nowrap flex items-center gap-1">
                        <TrendingUp size={10} /> {fmt(o.view_count)} views
                      </span>
                    </div>
                    <p className="text-xs text-ink/40 mt-1">{formatDate(o.published_at)}</p>
                    {o.llm_analysis && (
                      <p className="text-xs text-ink/70 mt-2 bg-violet/5 rounded-lg p-2 border border-violet/10">
                        {o.llm_analysis}
                      </p>
                    )}
                    <button
                      onClick={async () => {
                        setSelectedOutlier(o === selectedOutlier ? null : o);
                        if (o !== selectedOutlier) await loadTitleHistory(o.video_id);
                      }}
                      className="text-xs text-violet underline mt-2"
                    >
                      {selectedOutlier?.video_id === o.video_id ? "Hide title history" : "Show title history"}
                    </button>
                    <AnimatePresence>
                      {selectedOutlier?.video_id === o.video_id && titleHistory.length > 1 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-2"
                        >
                          <div className="space-y-1">
                            {titleHistory.map((t, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-ink/30 shrink-0">{formatDate(t.observed_at)}</span>
                                <span className={i === titleHistory.length - 1 ? "font-medium" : "line-through text-ink/40"}>
                                  {t.title_text}
                                </span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubeCompetitorsPage.tsx
git commit -m "feat(yt-p2): add Outlier Radar page with competitor management and AI analysis"
```

---

### Task 17: Predictive Studio Page

**Files:** Create `frontend/src/pages/YoutubePredictivePage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import apiClient from "../api/client";
import type { YoutubeVideo, VelocityPoint, YoutubePrediction } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import { fmt } from "../lib/fmt";

export default function YoutubePredictivePage() {
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [selected, setSelected] = useState<YoutubeVideo | null>(null);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [prediction, setPrediction] = useState<YoutubePrediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get<{ videos: YoutubeVideo[] }>("/youtube/videos?page=1&page_size=30")
      .then(r => setVideos(r.data.videos ?? []))
      .catch(() => setVideos([]));
  }, []);

  const selectVideo = async (v: YoutubeVideo) => {
    setSelected(v);
    setLoading(true);
    const [velRes, predRes] = await Promise.all([
      apiClient.get<VelocityPoint[]>(`/youtube/insights/velocity/${v.video_id}`).catch(() => null),
      apiClient.get<YoutubePrediction | null>(`/youtube/insights/predictions/${v.video_id}`).catch(() => null),
    ]);
    setVelocity(velRes?.data ?? []);
    setPrediction(predRes?.data ?? null);
    setLoading(false);
  };

  const revenueRange = prediction
    ? `$${prediction.revenue_low_usd.toFixed(0)} – $${prediction.revenue_high_usd.toFixed(0)}`
    : null;

  return (
    <YoutubeDashboardLayout active="Predictive Studio">
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Predictive Studio</h1>
        <p className="text-sm text-ink/50 mb-6">4-hour velocity → 30-day view projection.</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video list */}
          <div className="card-hairline glass rounded-2xl p-4 space-y-2 max-h-[600px] overflow-y-auto">
            {videos.map(v => (
              <button
                key={v.video_id}
                onClick={() => selectVideo(v)}
                className={`w-full flex gap-3 p-2 rounded-xl text-left transition-colors ${
                  selected?.video_id === v.video_id ? "bg-red-50 ring-1 ring-red-300" : "hover:bg-white/50"
                }`}
              >
                <img src={v.thumbnail_url} className="w-16 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
                <div className="min-w-0">
                  <p className="text-xs font-medium line-clamp-2">{v.title}</p>
                  <p className="text-[10px] text-ink/40 mt-0.5">{fmt(v.view_count)} views</p>
                </div>
              </button>
            ))}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2 space-y-4">
            {!selected && (
              <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
                Select a video to see velocity and projection.
              </div>
            )}
            {selected && (
              <>
                {/* Velocity chart */}
                <div className="card-hairline glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-ink mb-3">View Velocity</p>
                  {velocity.length === 0 ? (
                    <p className="text-xs text-ink/40 text-center py-6">No velocity data yet. Check back after the next hourly sync.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={velocity}>
                        <XAxis dataKey="hours" tickFormatter={h => `${h}h`} tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={50} />
                        <Tooltip formatter={(v: number) => [fmt(v), "Views"]} labelFormatter={h => `${h}h after publish`} />
                        <Bar dataKey="view_count" fill="#dc2626" radius={4} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Prediction card */}
                <div className="card-hairline glass rounded-2xl p-4">
                  <p className="text-sm font-semibold text-ink mb-3">30-Day Projection</p>
                  {loading && <p className="text-xs text-ink/40">Loading…</p>}
                  {!loading && !prediction && (
                    <p className="text-xs text-ink/40">No prediction yet — velocity data needed first (requires 4+ hours of data).</p>
                  )}
                  {!loading && prediction && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-ink/50">Predicted Views</p>
                        <p className="text-2xl font-bold num text-red-700">{fmt(prediction.predicted_30d_views)}</p>
                        <p className="text-[10px] text-ink/40">range: {fmt(prediction.predicted_low)} – {fmt(prediction.predicted_high)}</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-ink/50">Est. Revenue</p>
                        <p className="text-2xl font-bold num text-green-700">{revenueRange}</p>
                        <p className="text-[10px] text-ink/40">at $3 RPM default</p>
                      </div>
                      {prediction.model_r2 !== null && (
                        <p className="col-span-2 text-[10px] text-ink/40 text-center">
                          Model accuracy: {(prediction.model_r2 * 100).toFixed(0)}% R² on historical data
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubePredictivePage.tsx
git commit -m "feat(yt-p2): add Predictive Studio page with velocity chart and 30-day projection"
```

---

### Task 18: Archive Miner Page

**Files:** Create `frontend/src/pages/YoutubeArchivePage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Clock, Scissors, Edit3, RotateCcw } from "lucide-react";
import apiClient from "../api/client";
import type { ArchiveMinerStatus, YoutubeArchiveSuggestion } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

const TYPE_CONFIG = {
  REMAKE: { label: "Remake", icon: RotateCcw, color: "text-violet bg-violet/10" },
  SHORT: { label: "Clip to Short", icon: Scissors, color: "text-red-600 bg-red-50" },
  UPDATE: { label: "Update", icon: Edit3, color: "text-amber-600 bg-amber-50" },
} as const;

function SuggestionCard({ s }: { s: YoutubeArchiveSuggestion }) {
  const cfg = TYPE_CONFIG[s.suggestion_type] ?? TYPE_CONFIG.UPDATE;
  const Icon = cfg.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-hairline glass rounded-2xl p-4 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1">{s.original_title}</p>
        <span className={`chip text-xs flex items-center gap-1 whitespace-nowrap ${cfg.color}`}>
          <Icon size={10} /> {cfg.label}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip bg-ink/5 text-ink/60 text-[10px]">#{s.trending_topic}</span>
        {s.wikipedia_spike_pct > 0 && (
          <span className="chip bg-green-50 text-green-700 text-[10px]">
            Wikipedia +{s.wikipedia_spike_pct.toFixed(0)}%
          </span>
        )}
        {s.autocomplete_matches.length > 0 && (
          <span className="chip bg-blue-50 text-blue-700 text-[10px]">
            YT search: "{s.autocomplete_matches[0]}"
          </span>
        )}
      </div>
      <p className="text-xs text-ink/60 bg-violet/5 rounded-lg p-2 border border-violet/10">
        {s.llm_recommendation}
      </p>
    </motion.div>
  );
}

export default function YoutubeArchivePage() {
  const [status, setStatus] = useState<ArchiveMinerStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await apiClient.get<ArchiveMinerStatus>("/youtube/insights/archive").catch(() => null);
    setStatus(res?.data ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    await apiClient.post("/youtube/insights/archive/refresh").catch(() => null);
    await new Promise(r => setTimeout(r, 2000)); // Let background task start
    await load();
    setScanning(false);
  };

  const lastScanText = status?.last_scan
    ? `Last scanned ${new Date(status.last_scan).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "Never scanned";

  return (
    <YoutubeDashboardLayout active="Archive Miner">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-ink mb-1">Archive Miner</h1>
            <p className="text-sm text-ink/50 flex items-center gap-1">
              <Clock size={12} /> {lastScanText}
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="btn-glow bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Run Scan Now"}
          </button>
        </div>

        {loading && <p className="text-sm text-ink/40">Loading suggestions…</p>}

        {!loading && status?.suggestions.length === 0 && (
          <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
            No revival opportunities found yet.<br />
            Run a scan or check back after the weekly job runs.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {status?.suggestions.map(s => (
            <SuggestionCard key={s.video_id} s={s} />
          ))}
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubeArchivePage.tsx
git commit -m "feat(yt-p2): add Archive Miner page with revival suggestion cards"
```

---

### Task 19: Cross-Platform ROI Page

**Files:** Create `frontend/src/pages/YoutubeFunnelPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import apiClient from "../api/client";
import type { CrossPlatformResponse, CrossPlatformDay } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";

const DAYS_OPTIONS = [30, 90, 180] as const;

function CorrelationChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.abs(value * 100).toFixed(0);
  const color = value > 0.5 ? "text-green-700 bg-green-50" : value > 0.2 ? "text-amber-700 bg-amber-50" : "text-ink/50 bg-ink/5";
  return (
    <span className={`chip text-sm font-semibold ${color}`}>
      Instagram → YouTube correlation: {value >= 0 ? "+" : ""}{(value * 100).toFixed(0)}%
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const day = payload[0]?.payload as CrossPlatformDay;
  return (
    <div className="glass card-hairline rounded-xl p-3 text-xs shadow-lg">
      <p className="font-semibold text-ink mb-1">{label}</p>
      <p className="text-green-600">+{day.subscribers_gained} gained</p>
      <p className="text-red-500">−{day.subscribers_lost} lost</p>
      <p className="text-ink font-medium">Net: {day.net_subscribers > 0 ? "+" : ""}{day.net_subscribers}</p>
      {day.has_instagram_reel && <p className="text-violet mt-1 font-medium">📸 Instagram Reel posted</p>}
    </div>
  );
};

export default function YoutubeFunnelPage() {
  const [days, setDays] = useState<typeof DAYS_OPTIONS[number]>(90);
  const [data, setData] = useState<CrossPlatformResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get<CrossPlatformResponse>(`/youtube/insights/cross-platform?days=${days}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const reelDates = new Set(data?.reel_posts.map(r => r.post_date) ?? []);
  const chartData = data?.days.map(d => ({
    ...d,
    label: d.day.slice(5), // MM-DD format
  })) ?? [];

  return (
    <YoutubeDashboardLayout active="Cross-Platform">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-ink mb-1">Cross-Platform ROI</h1>
            <p className="text-sm text-ink/50">Does Instagram drive YouTube subscribers?</p>
          </div>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  days === d ? "bg-red-600 text-white" : "bg-white/50 text-ink/60 hover:bg-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Correlation badge */}
        {data?.correlation !== undefined && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <CorrelationChip value={data.correlation} />
            <span className="text-[10px] text-ink/30">Pearson correlation — not causal attribution</span>
          </div>
        )}

        {loading && <p className="text-sm text-ink/40 py-12 text-center">Loading cross-platform data…</p>}

        {!loading && chartData.length === 0 && (
          <div className="card-hairline glass rounded-2xl p-12 text-center text-ink/40 text-sm">
            No data yet. Make sure both Instagram and YouTube are connected and synced.
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <div className="card-hairline glass rounded-2xl p-6">
            <p className="text-xs text-ink/50 mb-4">
              Vertical lines = Instagram Reel posts · Area = daily YouTube subscriber net
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                {/* Mark Instagram reel days */}
                {data?.reel_posts.map(r => (
                  <ReferenceLine
                    key={r.ig_media_id}
                    x={r.post_date.slice(5)}
                    stroke="#7c3aed"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="net_subscribers"
                  stroke="#dc2626"
                  fill="#dc2626"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Net subscribers"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top driving reels */}
        {data && data.reel_posts.length > 0 && (
          <div className="card-hairline glass rounded-2xl p-4 mt-6">
            <p className="text-sm font-semibold text-ink mb-3">Instagram Reels Posted in Period</p>
            <div className="space-y-2">
              {data.reel_posts.slice(0, 8).map(r => (
                <div key={r.ig_media_id} className="flex items-center gap-3 text-xs">
                  {r.thumbnail_url && <img src={r.thumbnail_url} className="w-10 h-10 rounded-lg object-cover" alt="" />}
                  <div>
                    <p className="text-ink/50">{r.post_date}</p>
                    <p className="line-clamp-1 text-ink/70">{r.caption?.slice(0, 80) || "No caption"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubeFunnelPage.tsx
git commit -m "feat(yt-p2): add Cross-Platform ROI page with correlation chart"
```

---

### Task 20: Register New Routes

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: Add 4 imports at the top of `App.tsx`**

```typescript
import YoutubeCompetitorsPage from "./pages/YoutubeCompetitorsPage";
import YoutubePredictivePage from "./pages/YoutubePredictivePage";
import YoutubeArchivePage from "./pages/YoutubeArchivePage";
import YoutubeFunnelPage from "./pages/YoutubeFunnelPage";
```

- [ ] **Step 2: Add 4 new `ProtectedRoute` entries** in the YouTube routes block (after `/youtube/retention`):

```tsx
<Route path="/youtube/competitors" element={<ProtectedRoute><YoutubeCompetitorsPage /></ProtectedRoute>} />
<Route path="/youtube/predict" element={<ProtectedRoute><YoutubePredictivePage /></ProtectedRoute>} />
<Route path="/youtube/archive" element={<ProtectedRoute><YoutubeArchivePage /></ProtectedRoute>} />
<Route path="/youtube/funnel" element={<ProtectedRoute><YoutubeFunnelPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Run type check**

```bash
cd frontend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 4: Smoke test** — navigate to each new page. Confirm they render without white-screen crashes. Confirm sidebar highlights the active item.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(yt-p2): register 4 new YouTube Phase 2 routes in App.tsx"
```

---

## Self-Review: Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| 8 new ClickHouse tables (032–039) | Task 1 |
| Config: `WEBHOOK_BASE_URL`, 6 other fields | Task 2 |
| SQL queries for all new tables | Task 3 |
| Repository CRUD for all tables | Task 4 |
| `fetch_channel_by_handle`, `fetch_video_stats`, subscribe/unsubscribe | Task 5 |
| Extend `fetch_analytics_overview` with CTR metrics | Task 5 Step 2 |
| Webhook verify + receive endpoints | Task 6 |
| Competitor GET/POST/DELETE endpoints | Task 7 |
| Outlier feed + title history endpoints | Task 7 |
| Cross-platform, predictions, archive, alerts endpoints | Task 7 |
| Outlier detection job with LLM reverse engineering | Task 8 |
| Competitor poll fallback | Task 9 |
| Velocity tracker job | Task 9 |
| Golden Hour alert job | Task 10 |
| Preflight AI check job | Task 10 |
| Archive Miner with Wikipedia + autocomplete | Task 11 |
| Predictive model (sklearn LinearRegression) | Task 12 |
| Schedule jobs in scheduler.py + schedule_golden_hour helper | Task 13 |
| Mount webhook router in main.py | Task 13 |
| TypeScript types for all new endpoints | Task 14 |
| Sidebar with 6 nav items | Task 15 |
| Outlier Radar page | Task 16 |
| Predictive Studio page | Task 17 |
| Archive Miner page | Task 18 |
| Cross-Platform ROI page | Task 19 |
| Routes registered in App.tsx | Task 20 |

**Type consistency check:**
- `YoutubeCompetitor` — defined in Task 14, used in Task 7 (schema), Task 16 (page) ✓
- `CompetitorOutlier` — defined Task 14, schema Task 7, page Task 16 ✓
- `YoutubePrediction` — defined Task 14, schema Task 7, page Task 17 ✓
- `ArchiveMinerStatus` — defined Task 14, schema Task 7, page Task 18 ✓
- `CrossPlatformResponse` — defined Task 14, schema Task 7, page Task 19 ✓
- `youtube_repo.insert_velocity_point(client, user_id, channel_id, video_id, hours, view_count)` — defined Task 4, called in Task 8/9/10 ✓
- `schedule_golden_hour(user_id, channel_id, video_id)` — defined Task 13, called Task 6 ✓
- `schedule_velocity_checks(user_id, channel_id, video_id)` — defined Task 13, called Task 6 ✓

**One gap found and noted:** Task 5 Step 2 says to "read and update" `fetch_analytics_overview`. This is intentionally left for the implementer to do inline since the exact current code structure must be read first — it cannot be shown without seeing the live file. The instruction is explicit about what to look for.

---

## End-to-End Verification

1. **Migrations:** `cd backend && python run_migrations.py` — 8 new tables appear in ClickHouse.
2. **Webhook verify:** `curl "https://localhost:8000/api/youtube/webhook/verify?hub.challenge=ping&hub.mode=subscribe"` — returns `ping`.
3. **Add competitor:** POST `/api/youtube/competitors` with `{"handle": "@mkbhd"}` — returns competitor object.
4. **Archive scan:** POST `/api/youtube/insights/archive/refresh` — returns 202. Wait 30s. GET `/api/youtube/insights/archive` — shows suggestions (if any old videos exist).
5. **Predictive page:** Navigate to `/youtube/predict`, select a video — velocity chart appears (empty if no velocity data yet; will populate after next publish).
6. **Cross-platform:** Navigate to `/youtube/funnel` — chart renders (may show empty state if Instagram not connected).
7. **Sidebar:** All 6 nav items present and active state correct on each page.
8. **TypeScript build:** `cd frontend && npm run build` — zero errors.
