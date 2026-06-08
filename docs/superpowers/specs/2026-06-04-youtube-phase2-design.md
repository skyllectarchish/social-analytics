# YouTube Phase 2: Advanced Intelligence Suite — Design Spec

**Date:** 2026-06-04
**Status:** Approved

---

## Context

Phase 1 delivered the foundational YouTube integration: OAuth, channel/video sync, overview dashboard, and AI-annotated retention curves (`docs/superpowers/specs/2026-06-04-youtube-integration-design.md`). Phase 1 was deliberately scoped to exclude five advanced features, all of which are now ready to build:

1. Outlier Detection & Reverse Engineering
2. Predictive Performance Projections
3. Archive Miner (Content Revival)
4. Cross-Platform ROI Funnel
5. Real-Time Webhook Intelligence

The goal is to give creators intelligence that YouTube Studio cannot provide: competitive intelligence, forward-looking predictions, content revival signals, and cross-platform attribution.

---

## Architecture

### Hybrid Webhook Strategy

Controlled by a new `WEBHOOK_BASE_URL` env var:

- **Set:** subscribe to competitor and own channels via YouTube's PubSubHubbub (WebSub) at `{WEBHOOK_BASE_URL}/api/youtube/webhook/receive`. Zero quota cost for discovery.
- **Absent:** fall back to nightly cron that polls competitor latest videos. Features still work; outlier alerts arrive next day instead of within minutes.

Local dev: use ngrok to expose `localhost:8000` and set `WEBHOOK_BASE_URL` to the ngrok URL.

---

## Backend

### New ClickHouse Tables (migrations 032–039)

| Table | Engine | Purpose |
|---|---|---|
| `youtube_competitors` | ReplacingMergeTree(updated_at) | Competitor channels tracked per user. Columns: user_id, yt_channel_id, competitor_channel_id, competitor_title, competitor_thumbnail_url, webhook_active, added_at, updated_at |
| `youtube_competitor_videos` | ReplacingMergeTree(fetched_at) | Video snapshots for baseline calculation. Columns: user_id, competitor_channel_id, video_id, title, description, thumbnail_url, published_at, view_count, llm_analysis (Nullable(String)), fetched_at |
| `youtube_competitor_velocity` | ReplacingMergeTree(checked_at) | View counts at scheduled checkpoints. Columns: user_id, competitor_channel_id, video_id, hours_since_publish (UInt8), view_count, checked_at |
| `youtube_title_history` | MergeTree() | Title change log (own + competitor). Columns: user_id, channel_id, video_id, title_text, observed_at |
| `youtube_archive_suggestions` | ReplacingMergeTree(generated_at) | Archive Miner output. Columns: user_id, video_id, original_title, trending_topic, wikipedia_spike_pct, autocomplete_matches (Array(String)), suggestion_type (LowCardinality: 'REMAKE'/'SHORT'/'UPDATE'), llm_recommendation, generated_at |
| `youtube_predictions` | ReplacingMergeTree(predicted_at) | 30-day view projections. Columns: user_id, video_id, four_hour_views, four_hour_avg_watch_s, ctr_pct, predicted_30d_views, predicted_low, predicted_high, revenue_low_usd, revenue_high_usd, predicted_at |
| `youtube_alerts` | MergeTree() | In-app alerts (golden hour, preflight). Columns: user_id, video_id, alert_type (LowCardinality: 'GOLDEN_HOUR_UNDER'/'GOLDEN_HOUR_OVER'/'PREFLIGHT'), alert_body (String), created_at |
| `youtube_model_state` | ReplacingMergeTree(trained_at) | Predictive model coefficients per user. Columns: user_id, coefficients_json (String), intercept (Float64), r2_score (Float64), training_sample_size (UInt16), trained_at |

All use `(user_id, ...)` as ORDER BY prefix for per-user isolation.

### New Endpoints

**Webhook module (`backend/app/youtube/webhook.py`, mounted at `/api/youtube/webhook`)**
- `GET /verify` — echo `hub.challenge` query param (PubSubHubbub subscription verification)
- `POST /receive` — parse Atom XML notification; route by channel_id to own-channel or competitor handler

**Competitor management (`backend/app/youtube/router.py`, new routes)**
- `GET /competitors` — list user's tracked competitors
- `POST /competitors` — add competitor by @handle or channel URL (calls `fetch_channel_by_handle()`)
- `DELETE /competitors/{competitor_channel_id}` — remove competitor and unsubscribe webhook

**New insights endpoints**
- `GET /insights/cross-platform?days=90` — joins `youtube_daily_metrics` + Instagram daily data; returns daily subscriber gains + Instagram Reel post dates
- `GET /insights/predictions/{video_id}` — fetch stored prediction for a video
- `GET /insights/archive` — list archive suggestions for user
- `POST /insights/archive/refresh` — trigger immediate Archive Miner scan (throttled: 1/day per user)

### New Service Functions (`backend/app/youtube/service.py`)

- `fetch_channel_by_handle(handle, access_token)` — YouTube Data API `channels.list?forHandle=@handle`
- `fetch_video_stats(video_id, access_token)` — lightweight `videos.list` for `statistics` part only (1 quota unit)
- `subscribe_to_channel(channel_id, webhook_url)` — POST to `https://pubsubhubbub.appspot.com/subscribe`
- `unsubscribe_from_channel(channel_id, webhook_url)` — POST with `hub.mode=unsubscribe`
- Extend `fetch_analytics_overview()` to include `impressions`, `impressionsCTR`, `averageViewDuration` metrics

### New Jobs (`backend/app/jobs/`)

**`outlier_detection.py`**
- Trigger: webhook receipt for competitor channel OR daily cron fallback (midnight UTC)
- Logic: compute per-channel baseline = avg(view_count) over last 30 videos in `youtube_competitor_videos`
- Schedule velocity checks at +4h, +12h, +24h using APScheduler
- At 24h: if view_count ≥ 3× baseline → flag as outlier → call `ai_client.synthesize()` with prompt: title, description, thumbnail URL, view spike ratio → store LLM breakdown in `youtube_competitor_videos.llm_analysis`

**`golden_hour.py`**
- Trigger: own-channel webhook publish event OR APScheduler poll 60 min after new video detected in daily sync
- Fetch video stats at exactly 60 min
- Compare to channel baseline (avg 1h views from historical data)
- If < 50% of baseline: alert "underperforming — check title/thumbnail"
- If > 200% of baseline: alert "trending — engage comments now"
- Stored in `youtube_daily_metrics` as synthetic `golden_hour_alert` record

**`preflight_check.py`**
- Trigger: own-channel webhook publish event only (no polling fallback needed)
- Input: video title, description, thumbnail URL
- LLM prompt: check title length (< 60 chars for mobile), hook presence, CTR keyword strength
- Output: `{score: 0-100, issues: [...], suggestions: [...]}` serialized as JSON and stored as `alert_body` in `youtube_alerts` with `alert_type='PREFLIGHT'`

**`archive_miner.py`**
- Trigger: weekly APScheduler cron (configurable, default Sunday 3:00 UTC)
- Fetch all user videos with `published_at < NOW() - 1 YEAR`
- For each video (batched, max 20 per run):
  1. LLM extracts: (a) core topic keyword for autocomplete, (b) Wikipedia article title (exact page name) for pageviews lookup
  2. YouTube Autocomplete API: `http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={topic}` — check if topic appears in suggestions
  3. Wikipedia Pageviews API: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/{wikipedia_article}/daily/{30d_ago}/{today}` — detect spike if last 7d avg > 30d avg × 1.3
  4. If either signal fires: LLM generates `suggestion_type` + `llm_recommendation`
- Write results to `youtube_archive_suggestions`

**`competitor_poll.py`** (fallback, runs only when `WEBHOOK_BASE_URL` absent)
- Daily cron (01:00 UTC)
- For each tracked competitor: `fetch_latest_videos(competitor_channel_id, access_token, max_results=5)`
- Upserts into `youtube_competitor_videos`; triggers outlier check

### Predictive Model (`backend/app/youtube/predictive_model.py`)

- `train(user_id)` — query historical videos (≥30 days old) with 4h velocity + final 30d views; fit `sklearn.LinearRegression`
- `predict(four_hour_views, four_hour_avg_watch_s, ctr_pct)` → `(predicted, low, high)`
- Revenue: `predicted × (rpm / 1000)` where `rpm` defaults to `3.0`, user-overridable
- Model retrained weekly or when user has ≥5 new matured videos
- Stored as serialized JSON coefficients in a new `youtube_model_state` ClickHouse table (single-row per user)

Hourly velocity tracking: APScheduler fires at +1h, +2h, +3h, +4h after detecting a new video publish. Calls `fetch_video_stats()` and inserts to `youtube_competitor_velocity` with `channel_id = user's own channel`.

### New SQL Queries (`backend/app/models/queries.py`)

All parameterized:
- `GET_COMPETITORS`, `UPSERT_COMPETITOR`, `DELETE_COMPETITOR`
- `GET_COMPETITOR_VIDEOS`, `BULK_INSERT_COMPETITOR_VIDEOS`
- `GET_COMPETITOR_VELOCITY`, `INSERT_COMPETITOR_VELOCITY`
- `GET_TITLE_HISTORY`, `INSERT_TITLE_HISTORY`
- `GET_ARCHIVE_SUGGESTIONS`, `UPSERT_ARCHIVE_SUGGESTION`
- `GET_PREDICTION`, `UPSERT_PREDICTION`
- `GET_ALERTS`, `INSERT_ALERT`
- `GET_MODEL_STATE`, `UPSERT_MODEL_STATE`
- `GET_CROSS_PLATFORM_DATA` — joins `youtube_daily_metrics` + `instagram_media` by date

### New Config Fields (`backend/app/config.py`)

```python
WEBHOOK_BASE_URL: str | None = None
ARCHIVE_MINER_MAX_VIDEOS_PER_RUN: int = 20
DEFAULT_RPM_USD: float = 3.0
COMPETITOR_LIMIT_STANDARD: int = 5
COMPETITOR_LIMIT_PREMIUM: int = 25
```

Add `WEBHOOK_BASE_URL` to `.env.example`.

---

## Frontend

### Updated Sidebar (`YoutubeDashboardLayout.tsx`)

```
Overview          → /youtube
Retention Studio  → /youtube/retention
Outlier Radar     → /youtube/competitors
Predictive Studio → /youtube/predict
Archive Miner     → /youtube/archive
Cross-Platform    → /youtube/funnel
```

### New Pages (4 files under `frontend/src/pages/`)

**`YoutubeCompetitorsPage.tsx` (`/youtube/competitors`)**
- Left panel (320px): competitor channel list. Add button opens a dialog (input @handle or URL) → calls `POST /competitors` → shows channel name + avatar to confirm. "3 outlier" badge per channel.
- Right panel: outlier feed. Cards sorted by recency:
  - Video thumbnail, title, "5.2× average" chip, publish date
  - Expandable "Why it worked" section: LLM breakdown (title analysis, topic strength, hook assessment)
  - Title history timeline below: shows original → revised titles with timestamps
- Empty state: "Add a competitor to start tracking outliers"

**`YoutubePredictivePage.tsx` (`/youtube/predict`)**
- Left panel: recent video list (last 30 days). Each item shows current views + "velocity" badge if < 4h old.
- Right panel on select:
  - Velocity chart: bar chart for hourly first-4h data, then daily line
  - Prediction card: "Predicted 30-day views: 12,400 – 18,700" + revenue range
  - Model accuracy: "Accuracy on past 8 videos: 78%"
  - "Insufficient data" state when < 10 historical videos (explain why)

**`YoutubeArchivePage.tsx` (`/youtube/archive`)**
- Header: "Last scanned: 3 days ago" + "Run Scan Now" button (disabled if scanned today)
- Cards grid (2-col desktop, 1-col mobile):
  - Original video thumbnail + title + year
  - Trending topic badge
  - Wikipedia pageviews sparkline (7 days)
  - Action chip: "REMAKE", "CLIP TO SHORT", or "UPDATE"
  - LLM recommendation text (1-2 sentences)
- Empty state: "No revival opportunities found yet — check back after next scan"

**`YoutubeFunnelPage.tsx` (`/youtube/funnel`)**
- Full-width combo chart (Recharts ComposedChart):
  - Area: YouTube daily subscriber gains
  - ReferenceLine: Instagram Reel post dates (vertical markers with tooltip)
- Correlation score chip: "Instagram → YouTube: 74% correlation" (Pearson r, clearly labeled)
- "Top Driving Reels" table: Reel thumbnail, post date, avg subscriber gain over 3 days post-post
- Disclaimer chip below chart: "Correlation only — causation not guaranteed. No UTM tracking."
- Empty state when Instagram not connected: prompt to connect Instagram

### New TypeScript Types (`frontend/src/api/youtubeTypes.ts` additions)

```ts
YoutubeCompetitor, CompetitorVideo, CompetitorOutlier, TitleHistoryEntry
YoutubeArchiveSuggestion, ArchiveMinerStatus
YoutubePrediction, VelocityPoint, PredictiveResponse
CrossPlatformDay, CrossPlatformResponse
```

### New Routes (`App.tsx`, 4 ProtectedRoute entries)

```
/youtube/competitors  → YoutubeCompetitorsPage
/youtube/predict      → YoutubePredictivePage
/youtube/archive      → YoutubeArchivePage
/youtube/funnel       → YoutubeFunnelPage
```

---

## Out of Scope

- User-configurable RPM per video (global RPM setting only)
- Historical competitor analytics before tracking started
- YouTube comment sentiment for competitor videos
- Push notifications / email alerts (alerts stored in-app only)
- Tier enforcement (competitor limits implemented as config constants but no auth-tier check in Phase 2)

---

## Verification

1. **Webhook flow:** Set `WEBHOOK_BASE_URL` via ngrok. Add own channel as subscriber. Publish a test video. Confirm `golden_hour.py` fires at +60min and stores alert. Confirm `preflight_check.py` fires immediately.
2. **Outlier detection:** Add a competitor channel. Manually insert a fake video with 10× baseline views into `youtube_competitor_videos`. Confirm LLM analysis triggers and appears in Outlier Radar page.
3. **Archive Miner:** Manually trigger `POST /insights/archive/refresh`. Confirm job runs, queries Wikipedia API, and stores at least one suggestion (requires a channel with videos > 1 year old).
4. **Predictive:** Select a video published within 4 hours. Confirm velocity chart shows hourly data points. Select a video > 30 days old. Confirm prediction card shows projected range.
5. **Cross-Platform:** Connect both Instagram and YouTube. Navigate to `/youtube/funnel`. Confirm combo chart renders with both datasets and correlation score computes without error.
6. **Fallback polling:** Unset `WEBHOOK_BASE_URL`, restart backend. Confirm daily cron job appears in APScheduler logs and competitor videos are upserted at the scheduled time.
