---
title: YouTube Integration — Foundation + AI Retention
date: 2026-06-04
status: approved
scope: Phase 1 only (Foundation + AI-Annotated Retention Curve)
---

# YouTube Integration Design

## Scope

Foundation (Google OAuth → channel/video sync → basic metrics dashboard) plus one high-differentiation feature: AI-annotated retention curves. Separate `/youtube` dashboard root. Mirrors Instagram module architecture exactly.

**Not in scope (future phases):** Outlier detection, PubSubHubbub webhooks, Archive Miner, predictive analytics, competitor tracking.

---

## 1. Backend Architecture

### Module Structure

```
backend/app/youtube/
  __init__.py
  router.py        # APIRouter prefix=/api/youtube tags=["youtube"]
  service.py       # Google OAuth + Data API + Analytics API calls
  schemas.py       # Pydantic response models
backend/app/repositories/youtube_repo.py
backend/app/ai/retention_analyzer.py
```

### Config (`backend/app/config.py`)

Three new optional fields added to `Settings`:

```python
google_client_id: str = ""
google_client_secret: str = ""
google_redirect_uri: str = ""   # must match /auth/youtube/callback
```

Also add to `backend/.env.example`. The `google_redirect_uri` value (e.g. `http://localhost:8000/api/youtube/callback`) must be registered as an authorized redirect URI in the Google Cloud Console OAuth 2.0 credentials for the project.

### Google OAuth Flow

Mirrors the Instagram OAuth flow in `instagram/service.py` and `instagram/router.py`:

1. `GET /api/youtube/connect` — mint signed JWT `state`, return Google OAuth URL.
   - Scopes: `youtube.readonly`, `yt-analytics.readonly`, `https://www.googleapis.com/auth/youtube.force-ssl` (required for caption content download, not covered by `youtube.readonly` alone)
   - Dialog host: `https://accounts.google.com/o/oauth2/v2/auth`
   - **Implementation note:** `create_signed_oauth_state` and `verify_oauth_state` currently live in `instagram/service.py`. Extract both to `auth/service.py` (or a new `app/oauth.py`) so the YouTube router can import them without depending on the Instagram module.
2. Google redirects → `/auth/youtube/callback?code=&state=`
3. `GET /api/youtube/callback` — verify state (CSRF), POST code to `https://oauth2.googleapis.com/token`, store encrypted refresh token, fetch channel + 50 latest videos, kick off background analytics sync.
4. `POST /api/youtube/disconnect` — delete channel/token rows. Idempotent.
5. `POST /api/youtube/refresh` — re-sync channel + videos using stored refresh token.

Token storage: refresh token encrypted via existing `crypto.py` (`encrypt_token` / `decrypt_token`), same `jwt_secret_key`.

### ClickHouse Migrations

Six new files, numbered `026`–`031`, all using `IF NOT EXISTS` and `ReplacingMergeTree`:

| File | Table | Engine key | Purpose |
|------|-------|-----------|---------|
| `026_create_youtube_tokens.sql` | `youtube_tokens` | `updated_at` | encrypted refresh token per user |
| `027_create_youtube_channels.sql` | `youtube_channels` | `fetched_at` | channel snapshot |
| `028_create_youtube_videos.sql` | `youtube_videos` | `fetched_at` | video metadata + rolling counts |
| `029_create_youtube_daily_metrics.sql` | `youtube_daily_metrics` | `end_time` | analytics time-series |
| `030_create_youtube_retention_curves.sql` | `youtube_retention_curves` | `fetched_at` | `audienceWatchRatio` per video |
| `031_create_youtube_retention_annotations.sql` | `youtube_retention_annotations` | `generated_at` | LLM drop-off explanations |

**Key schema decisions:**
- `youtube_videos.video_format` — derived field `LowCardinality(String)`: `SHORT` (duration ≤60s), `LONG_FORM`, `LIVE`, `PREMIERE`. YouTube Data API doesn't tag Shorts explicitly; derive from duration + `liveBroadcastContent`.
- `youtube_retention_curves` ORDER BY `(user_id, yt_channel_id, video_id, elapsed_video_time_ratio)` — one row per data point per video.
- `youtube_retention_annotations` ORDER BY `(user_id, video_id, timestamp_seconds)` — one annotation per detected cliff.

### API Endpoints

```
GET  /api/youtube/connect                         ConnectResponse (oauth_url, state)
GET  /api/youtube/callback                        YoutubeCallbackResponse
GET  /api/youtube/channel                         YoutubeChannel
GET  /api/youtube/videos?page=&page_size=         YoutubeVideoListResponse
POST /api/youtube/refresh                         YoutubeCallbackResponse
POST /api/youtube/disconnect                      {success, yt_channel_id}
POST /api/youtube/insights/sync                   SyncResponse (background task)
GET  /api/youtube/insights/overview?days=         YoutubeOverviewResponse
GET  /api/youtube/insights/retention/{video_id}   RetentionResponse
```

All protected routes depend on `auth.dependencies.get_current_user`. SQL queries go in `app/models/queries.py`.

---

## 2. AI Retention Analyzer

**File:** `backend/app/ai/retention_analyzer.py`

### Pipeline

Called as a `BackgroundTasks` task from `GET /api/youtube/insights/retention/{video_id}` on first request. Subsequent requests return cached annotations from ClickHouse.

1. Load retention curve from `youtube_retention_curves` (already stored).
2. Check skip conditions:
   - Video has < 1,000 views → skip LLM, return empty annotations.
   - Annotations exist and `generated_at` > retention curve `fetched_at` → return cached.
3. Download captions via YouTube Data API `captions.list` + `captions.download`. Auto-generated captions used as fallback. If no captions available → store single annotation: `"No transcript — drop-off detected at {mm:ss}."` per cliff.
4. Parse VTT/SRT into `list[tuple[float, float, str]]` (start_sec, end_sec, text).
5. Detect drop-off cliffs: `audience_watch_ratio` drops > 8% within a 10-second sliding window. Collect up to 5 worst cliffs, sorted by drop magnitude.
6. For each cliff, extract transcript ±30s around the timestamp.
7. Call LLM via existing `backend/app/ai/client.py` (Claude, model from settings). Prompt:

```
You are a YouTube retention analyst.
At {mm:ss} in "{video_title}", {drop_pct:.1f}% of viewers left within 10 seconds.
Transcript around this moment:
---
{transcript_excerpt}
---
In 1–2 sentences: why did viewers likely leave, and one actionable fix.
```

8. Store each annotation in `youtube_retention_annotations` (ReplacingMergeTree deduplicates on `(user_id, video_id, timestamp_seconds)`).
9. Each LLM call logged to `ai_quota_usage` under `feature="retention_annotation"`. Does NOT count against user's monthly cap (same pattern as `digest_auto`).

### Cache Invalidation

Annotations regenerate only when `youtube_retention_curves.fetched_at` > `youtube_retention_annotations.generated_at` for that video. A manual `/insights/sync` triggers a fresh retention fetch and thus re-annotation.

---

## 3. Frontend Architecture

### New Routes (`App.tsx`)

```tsx
<Route path="/youtube/connect"          element={<ProtectedRoute><YoutubeConnectPage /></ProtectedRoute>} />
<Route path="/auth/youtube/callback"    element={<ProtectedRoute><YoutubeCallbackPage /></ProtectedRoute>} />
<Route path="/youtube"                  element={<ProtectedRoute><YoutubeDashboardPage /></ProtectedRoute>} />
<Route path="/youtube/retention"        element={<ProtectedRoute><YoutubeRetentionPage /></ProtectedRoute>} />
```

### New Files

```
frontend/src/
  pages/
    YoutubeConnectPage.tsx
    YoutubeCallbackPage.tsx
    YoutubeDashboardPage.tsx
    YoutubeRetentionPage.tsx
  components/youtube/
    YoutubeDashboardLayout.tsx
    SmartRetentionChart.tsx
    VideoCard.tsx
  api/
    youtubeClient.ts         # typed wrappers, same axios instance
    youtubeTypes.ts          # YoutubeChannel, YoutubeVideo, RetentionResponse, etc.
```

### `YoutubeDashboardLayout`

New component — not a fork of `DashboardLayout`, shares the same design tokens from `index.css`.

| Element | Instagram | YouTube |
|---------|-----------|---------|
| Logo chip | `bg-ig` gradient | `bg-[#dc2626]` + inline YouTube SVG |
| Active nav pill | `from-lavender to-pink/40 ring-violet/20` | `from-red-100 to-red-50 ring-red/20` |
| Disconnect button | "Disconnect Instagram" | "Disconnect YouTube" |
| Connection banner | violet/lavender | red-50 bg, red/20 border |
| Header controls | days + compare-to + sync | sync only (no period comparator in Phase 1) |

Sidebar NAV:
```ts
const YT_NAV = [
  { label: "Overview",         icon: LayoutDashboard,    to: "/youtube" },
  { label: "Retention Studio", icon: ChartNoAxesColumn,  to: "/youtube/retention" },
]
```

### `YoutubeDashboardPage`

- Three `.glass .card-hairline` stat cards: Total Views, Watch Hours, Subscribers Net — each with `.num` formatted value, delta chip, and `<Sparkline>`.
- `ComposedChart` (Recharts): daily views as `<Area>` — `stroke="#dc2626"` fill `rgba(220,38,38,0.15)`. `<GlassTooltip>`. Grid lines `stroke="#e5e7eb"`.
- Top 5 videos grid: `<VideoCard>` components (thumbnail 16:9, title 2-line truncate, views + duration `.chip`).
- Falls back to mock data via `safeGet` returning `null`. A 404 from `/youtube/channel` routes to `/youtube/connect`.

### `YoutubeRetentionPage`

Two-column layout (320px fixed left / flex-1 right):

**Left — video selector:**
- Search input (filters by title client-side).
- `<VideoCard>` list with `ring-2 ring-[#dc2626]` on active item.
- Virtualize if > 50 videos (windowed list).

**Right — `<SmartRetentionChart>`:**
- Recharts `ComposedChart`:
  - `<Area>` — `audienceWatchRatio` (red-500 stroke, 15% fill).
  - `<Line>` — `relativeRetentionPerformance` benchmark (gray-400, `strokeDasharray="4 4"`).
  - `<ReferenceLine>` per cliff — vertical, `stroke="#dc2626"`.
  - `<ReferenceArea>` per cliff — ±5s window, `fill="rgba(220,38,38,0.08)"`.
- Annotation cards: `.glass` cards below chart, one per cliff. Each shows timestamp + LLM text + drop percentage chip.
- Loading state while annotations generate: `<Loader2>` spinner + "Analyzing with AI…" — never a blank chart frame.
- Empty state (no video selected): centered YouTube SVG + "Select a video from the list."
- `aria-label` on chart container: `"Retention curve for {video_title}. Highest drop-off at {timestamp}."`.

---

## 4. UI/UX Design Decisions

### Design System Additions

One new token in `src/index.css` `@theme inline`:
```css
--color-yt: #dc2626;
```

Exposes `bg-yt`, `text-yt`, `ring-yt` utilities automatically via Tailwind v4 dynamic scale.

### Animation

- Video list items: Framer Motion `staggerChildren` 30ms per item, `y: 8 → 0` + `opacity: 0 → 1`, 200ms ease-out.
- Annotation cards: `initial={{ opacity: 0, y: 8 }}` → `animate={{ opacity: 1, y: 0 }}`, 200ms ease-out, staggered per card.
- No entrance animation on chart data lines (respects `prefers-reduced-motion`).
- All animations respect `@media (prefers-reduced-motion: reduce)` via Framer Motion's `useReducedMotion`.

### Accessibility

- Contrast: `#dc2626` on white = 4.56:1 (passes AA). Dark text on red chip backgrounds use `text-white` (7:1+).
- All icon-only buttons: `aria-label`.
- Chart container: `role="img"` + `aria-label` with key insight summary.
- Keyboard nav: video list items are `<button>` elements with visible focus ring.
- `<ReferenceLine>` annotations: text labels on the chart axis, not color-only.

### Responsive

- Retention page: below `md` breakpoint, left panel collapses to a full-width searchable `<select>` above the chart.
- Stat cards: `grid-cols-1 sm:grid-cols-3`.
- Video grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`.

---

## 5. Error Handling

| Scenario | Behavior |
|----------|----------|
| Google OAuth error | Redirect to `/youtube/connect?error=…` with inline error message |
| YouTube API quota exceeded | 429 → surface "API quota reached, sync tomorrow" banner |
| No captions for video | Annotations stored as "No transcript — drop-off detected at {mm:ss}" |
| Video < 1,000 views | Skip LLM, return empty annotations array (not an error) |
| LLM failure | Log, store fallback annotation: "AI analysis unavailable for this drop-off." |
| ClickHouse query failure | `safeGet` returns `null`, page renders mock fallback data |

---

## 6. Out of Scope (Phase 2+)

- Competitor channel tracking
- PubSubHubbub webhooks (Golden Hour alerts, title change tracking)
- Outlier detection
- Archive Miner / content revival
- Predictive 30-day view projection
- Revenue / RPM dashboard (requires `yt-analytics-monetary.readonly`)
- Cross-platform IG ↔ YT funnel analysis
- Period comparator in YouTube header (add in Phase 2 alongside more metrics)
