# YouTube Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube as a second social platform — Google OAuth, channel/video sync to ClickHouse, basic metrics dashboard, and AI-annotated retention curves — all under a separate `/youtube` root, mirroring the Instagram module architecture exactly.

**Architecture:** New `backend/app/youtube/` module (router + service + schemas) parallels `backend/app/instagram/`. Shared OAuth state helpers extracted to `backend/app/oauth_state.py`. Six ClickHouse migrations (026–031) add YouTube tables. Frontend adds `YoutubeDashboardLayout` + four pages under `/youtube`.

**Tech Stack:** FastAPI, ClickHouse (ReplacingMergeTree), httpx (Google/YouTube APIs), React 19 + TypeScript, Tailwind v4, Recharts, Framer Motion, Lucide React, existing `ai/client.py` (Ollama) for LLM annotations.

**Branch:** `feat/youtube-integration`

---

## File Map

**Create (backend):**
- `backend/app/oauth_state.py` — shared JWT state mint/verify (extracted from instagram/service.py)
- `backend/app/youtube/__init__.py`
- `backend/app/youtube/router.py`
- `backend/app/youtube/service.py`
- `backend/app/youtube/schemas.py`
- `backend/app/repositories/youtube_repo.py`
- `backend/app/ai/retention_analyzer.py`
- `backend/migrations/026_create_youtube_tokens.sql`
- `backend/migrations/027_create_youtube_channels.sql`
- `backend/migrations/028_create_youtube_videos.sql`
- `backend/migrations/029_create_youtube_daily_metrics.sql`
- `backend/migrations/030_create_youtube_retention_curves.sql`
- `backend/migrations/031_create_youtube_retention_annotations.sql`

**Modify (backend):**
- `backend/app/config.py` — add `google_client_id`, `google_client_secret`, `google_redirect_uri`
- `backend/app/constants.py` — add YouTube API constants
- `backend/app/models/queries.py` — add YouTube SQL queries
- `backend/app/instagram/service.py` — import `create_signed_oauth_state`/`verify_oauth_state` from `oauth_state`
- `backend/app/main.py` — register YouTube router
- `backend/.env.example` — document Google credentials

**Create (frontend):**
- `frontend/src/api/youtubeTypes.ts`
- `frontend/src/components/youtube/YoutubeDashboardLayout.tsx`
- `frontend/src/components/youtube/VideoCard.tsx`
- `frontend/src/components/youtube/SmartRetentionChart.tsx`
- `frontend/src/pages/YoutubeConnectPage.tsx`
- `frontend/src/pages/YoutubeCallbackPage.tsx`
- `frontend/src/pages/YoutubeDashboardPage.tsx`
- `frontend/src/pages/YoutubeRetentionPage.tsx`

**Modify (frontend):**
- `frontend/src/index.css` — add `--color-yt` token
- `frontend/src/App.tsx` — add four YouTube routes

---

## Task 1: Extract shared OAuth state + add YouTube color token

**Files:**
- Create: `backend/app/oauth_state.py`
- Modify: `backend/app/instagram/service.py`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create `backend/app/oauth_state.py`**

```python
"""Shared OAuth CSRF state helpers used by both Instagram and YouTube flows."""

import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from .config import settings
from .exceptions import OAuthError


def create_signed_oauth_state(user_id: str, purpose: str) -> str:
    """Mint a signed, short-lived JWT state token bound to the logged-in user."""
    payload = {
        "uid": user_id,
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(tz=timezone.utc)
        + timedelta(seconds=settings.oauth_state_ttl_seconds),
        "purpose": purpose,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_oauth_state(state: str, expected_user_id: str, purpose: str) -> None:
    """Verify a state token on /callback. Raises OAuthError on any failure."""
    try:
        payload = jwt.decode(
            state, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError:
        raise OAuthError("Invalid or expired OAuth state token")
    if payload.get("purpose") != purpose or payload.get("uid") != expected_user_id:
        raise OAuthError("OAuth state user mismatch")
```

- [ ] **Step 2: Update `backend/app/instagram/service.py` to import from `oauth_state`**

Remove the `create_signed_oauth_state` and `verify_oauth_state` function bodies from `instagram/service.py` and replace with imports. Remove `secrets` import if it was only used for those functions.

At the top of `backend/app/instagram/service.py`, replace:
```python
import secrets
```
with nothing (remove it), and replace the two function definitions with imports:

```python
from ..oauth_state import create_signed_oauth_state as _create_state
from ..oauth_state import verify_oauth_state as _verify_state


def create_signed_oauth_state(user_id: str) -> str:
    return _create_state(user_id, purpose="ig_oauth_state")


def verify_oauth_state(state: str, expected_user_id: str) -> None:
    _verify_state(state, expected_user_id, purpose="ig_oauth_state")
```

- [ ] **Step 3: Add YouTube color token to `frontend/src/index.css`**

In the `@theme inline` block, after `--color-lavender: #ede9fe;`, add:

```css
  --color-yt: #dc2626;
```

- [ ] **Step 4: Verify the server still starts**

```bash
cd backend && uvicorn app.main:app --reload
```
Expected: no import errors, `GET /api/health` returns `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/oauth_state.py backend/app/instagram/service.py frontend/src/index.css
git commit -m "refactor: extract shared OAuth state helpers; add YouTube color token"
```

---

## Task 2: Config + constants + env

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/constants.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add Google fields to `backend/app/config.py`**

Inside the `Settings` class, after the `meta_system_ig_user_id` field:

```python
    # Google / YouTube
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""   # must match /auth/youtube/callback registered in Google Cloud Console
```

- [ ] **Step 2: Add YouTube constants to `backend/app/constants.py`**

Append to the bottom of `backend/app/constants.py`:

```python
# --- YouTube API ---

YOUTUBE_DATA_API_BASE: str = "https://www.googleapis.com/youtube/v3"
YOUTUBE_ANALYTICS_API_BASE: str = "https://youtubeanalytics.googleapis.com/v2"
YOUTUBE_OAUTH_DIALOG_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
YOUTUBE_TOKEN_EXCHANGE_URL: str = "https://oauth2.googleapis.com/token"

YOUTUBE_REQUIRED_SCOPES: list[str] = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",  # caption download
]

YOUTUBE_DEFAULT_VIDEO_FETCH_LIMIT: int = 50
YOUTUBE_ANALYTICS_OVERVIEW_METRICS: str = (
    "views,estimatedMinutesWatched,subscribersGained,subscribersLost"
)
```

- [ ] **Step 3: Add Google credentials to `backend/.env.example`**

After the `META_SYSTEM_IG_USER_ID=` line, add:

```
# Google / YouTube
# Create OAuth 2.0 credentials at https://console.cloud.google.com/apis/credentials
# Enable: YouTube Data API v3, YouTube Analytics API v2
# Register GOOGLE_REDIRECT_URI as an authorized redirect URI in the credential.
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/youtube/callback
```

- [ ] **Step 4: Verify config loads**

```bash
cd backend && python -c "from app.config import settings; print(settings.google_client_id)"
```
Expected: prints empty string (no error).

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/constants.py backend/.env.example
git commit -m "feat: add Google OAuth config fields and YouTube API constants"
```

---

## Task 3: ClickHouse migrations 026–031

**Files:** Six new SQL files in `backend/migrations/`

- [ ] **Step 1: Create `backend/migrations/026_create_youtube_tokens.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_tokens (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    refresh_token String,
    connected_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, yt_channel_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 2: Create `backend/migrations/027_create_youtube_channels.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_channels (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    title String DEFAULT '',
    description String DEFAULT '',
    thumbnail_url String DEFAULT '',
    subscriber_count UInt64 DEFAULT 0,
    video_count UInt64 DEFAULT 0,
    view_count UInt64 DEFAULT 0,
    hidden_subscriber_count UInt8 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 3: Create `backend/migrations/028_create_youtube_videos.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_videos (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    video_id String,
    title String DEFAULT '',
    description String DEFAULT '',
    thumbnail_url String DEFAULT '',
    published_at DateTime,
    duration_seconds UInt32 DEFAULT 0,
    video_format LowCardinality(String) DEFAULT '',
    view_count UInt64 DEFAULT 0,
    like_count UInt64 DEFAULT 0,
    comment_count UInt64 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id, video_id)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 4: Create `backend/migrations/029_create_youtube_daily_metrics.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_daily_metrics (
    user_id UUID,
    yt_channel_id String,
    metric_name LowCardinality(String),
    metric_value Float64 DEFAULT 0,
    end_time DateTime
) ENGINE = ReplacingMergeTree(end_time)
ORDER BY (user_id, yt_channel_id, metric_name, end_time)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 5: Create `backend/migrations/030_create_youtube_retention_curves.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_retention_curves (
    user_id UUID,
    yt_channel_id String,
    video_id String,
    elapsed_video_time_ratio Float32,
    audience_watch_ratio Float32 DEFAULT 0,
    relative_retention_performance Float32 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id, video_id, elapsed_video_time_ratio)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 6: Create `backend/migrations/031_create_youtube_retention_annotations.sql`**

```sql
CREATE TABLE IF NOT EXISTS youtube_retention_annotations (
    user_id UUID,
    video_id String,
    timestamp_seconds UInt32,
    annotation_text String DEFAULT '',
    drop_pct Float32 DEFAULT 0,
    model LowCardinality(String) DEFAULT '',
    generated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(generated_at)
ORDER BY (user_id, video_id, timestamp_seconds)
SETTINGS index_granularity = 8192;
```

- [ ] **Step 7: Apply migrations**

```bash
cd backend && python run_migrations.py
```
Expected: each migration runs without error. Re-running is safe (all use `IF NOT EXISTS`).

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/
git commit -m "feat: add ClickHouse migrations 026-031 for YouTube tables"
```

---

## Task 4: YouTube SQL queries

**Files:**
- Modify: `backend/app/models/queries.py`

- [ ] **Step 1: Append YouTube queries to `backend/app/models/queries.py`**

```python
# --- YouTube Tokens ---

GET_YOUTUBE_TOKEN = """
SELECT yt_channel_id, refresh_token
FROM youtube_tokens FINAL
WHERE user_id = {user_id:UUID}
ORDER BY updated_at DESC
LIMIT 1
"""

# --- YouTube Channels ---

GET_YOUTUBE_CHANNEL = """
SELECT yt_channel_id, title, description, thumbnail_url,
       subscriber_count, video_count, view_count, hidden_subscriber_count, fetched_at
FROM youtube_channels FINAL
WHERE user_id = {user_id:UUID}
ORDER BY fetched_at DESC
LIMIT 1
"""

# --- YouTube Videos ---

COUNT_YOUTUBE_VIDEOS = """
SELECT count()
FROM youtube_videos FINAL
WHERE user_id = {user_id:UUID}
  AND yt_channel_id = {yt_channel_id:String}
"""

GET_YOUTUBE_VIDEOS_PAGE = """
SELECT video_id, title, thumbnail_url, published_at,
       duration_seconds, video_format, view_count, like_count, comment_count
FROM youtube_videos FINAL
WHERE user_id = {user_id:UUID}
  AND yt_channel_id = {yt_channel_id:String}
ORDER BY published_at DESC
LIMIT {limit:UInt32}
OFFSET {offset:UInt32}
"""

# --- YouTube Daily Metrics ---

GET_YOUTUBE_DAILY_METRICS = """
SELECT metric_name, metric_value, end_time
FROM youtube_daily_metrics FINAL
WHERE user_id = {user_id:UUID}
  AND yt_channel_id = {yt_channel_id:String}
  AND metric_name IN {metrics:Array(String)}
  AND end_time >= {since:DateTime}
ORDER BY metric_name, end_time ASC
"""

# --- YouTube Retention ---

GET_YOUTUBE_RETENTION_CURVE = """
SELECT elapsed_video_time_ratio, audience_watch_ratio,
       relative_retention_performance, fetched_at
FROM youtube_retention_curves FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY elapsed_video_time_ratio ASC
"""

GET_YOUTUBE_RETENTION_ANNOTATIONS = """
SELECT timestamp_seconds, annotation_text, drop_pct, model, generated_at
FROM youtube_retention_annotations FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY timestamp_seconds ASC
"""

GET_YOUTUBE_LATEST_RETENTION_FETCH = """
SELECT max(fetched_at)
FROM youtube_retention_curves FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
"""

GET_YOUTUBE_LATEST_ANNOTATION_GENERATED = """
SELECT max(generated_at)
FROM youtube_retention_annotations FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
"""
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/queries.py
git commit -m "feat: add YouTube SQL queries to models/queries.py"
```

---

## Task 5: YouTube repository

**Files:**
- Create: `backend/app/repositories/youtube_repo.py`

- [ ] **Step 1: Create `backend/app/repositories/youtube_repo.py`**

```python
"""YouTube repository — all ClickHouse operations for YouTube tables."""

import logging
import uuid
from datetime import datetime, timezone

from clickhouse_connect.driver.client import Client

from ..models.queries import (
    COUNT_YOUTUBE_VIDEOS,
    GET_YOUTUBE_CHANNEL,
    GET_YOUTUBE_DAILY_METRICS,
    GET_YOUTUBE_LATEST_ANNOTATION_GENERATED,
    GET_YOUTUBE_LATEST_RETENTION_FETCH,
    GET_YOUTUBE_RETENTION_ANNOTATIONS,
    GET_YOUTUBE_RETENTION_CURVE,
    GET_YOUTUBE_TOKEN,
    GET_YOUTUBE_VIDEOS_PAGE,
)

logger = logging.getLogger(__name__)


# --- Tokens ---

def find_token(client: Client, user_id: str) -> dict | None:
    rows = client.query(GET_YOUTUBE_TOKEN, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    return {"yt_channel_id": rows[0][0], "refresh_token": rows[0][1]}


def upsert_token(client: Client, user_id: str, yt_channel_id: str, encrypted_refresh_token: str) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_tokens",
        [[str(uuid.uuid4()), user_id, yt_channel_id, encrypted_refresh_token, now, now]],
        column_names=["id", "user_id", "yt_channel_id", "refresh_token", "connected_at", "updated_at"],
    )


def delete_token(client: Client, user_id: str) -> None:
    client.command(
        "ALTER TABLE youtube_tokens DELETE WHERE user_id = {uid:UUID}",
        parameters={"uid": user_id},
        settings={"mutations_sync": 2},
    )


# --- Channels ---

def find_channel(client: Client, user_id: str) -> dict | None:
    rows = client.query(GET_YOUTUBE_CHANNEL, parameters={"user_id": user_id}).result_rows
    if not rows:
        return None
    r = rows[0]
    return {
        "yt_channel_id": r[0], "title": r[1], "description": r[2],
        "thumbnail_url": r[3], "subscriber_count": int(r[4]),
        "video_count": int(r[5]), "view_count": int(r[6]),
        "hidden_subscriber_count": bool(r[7]), "fetched_at": str(r[8]),
    }


def upsert_channel(client: Client, user_id: str, channel_data: dict) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    client.insert(
        "youtube_channels",
        [[
            str(uuid.uuid4()), user_id,
            channel_data["yt_channel_id"], channel_data.get("title", ""),
            channel_data.get("description", ""), channel_data.get("thumbnail_url", ""),
            int(channel_data.get("subscriber_count", 0)), int(channel_data.get("video_count", 0)),
            int(channel_data.get("view_count", 0)),
            int(bool(channel_data.get("hidden_subscriber_count", False))), now,
        ]],
        column_names=[
            "id", "user_id", "yt_channel_id", "title", "description", "thumbnail_url",
            "subscriber_count", "video_count", "view_count", "hidden_subscriber_count", "fetched_at",
        ],
    )


# --- Videos ---

def count_videos(client: Client, user_id: str, yt_channel_id: str) -> int:
    rows = client.query(COUNT_YOUTUBE_VIDEOS, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
    }).result_rows
    return int(rows[0][0]) if rows else 0


def find_videos_page(client: Client, user_id: str, yt_channel_id: str, limit: int, offset: int) -> list[dict]:
    rows = client.query(GET_YOUTUBE_VIDEOS_PAGE, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
        "limit": limit, "offset": offset,
    }).result_rows
    return [
        {
            "video_id": r[0], "title": r[1], "thumbnail_url": r[2],
            "published_at": str(r[3]), "duration_seconds": int(r[4]),
            "video_format": r[5], "view_count": int(r[6]),
            "like_count": int(r[7]), "comment_count": int(r[8]),
        }
        for r in rows
    ]


def bulk_insert_videos(client: Client, user_id: str, yt_channel_id: str, videos: list[dict]) -> None:
    if not videos:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()), user_id, yt_channel_id,
            v["video_id"], v.get("title", ""), v.get("description", ""),
            v.get("thumbnail_url", ""), v.get("published_at", now),
            int(v.get("duration_seconds", 0)), v.get("video_format", "LONG_FORM"),
            int(v.get("view_count", 0)), int(v.get("like_count", 0)),
            int(v.get("comment_count", 0)), now,
        ]
        for v in videos
    ]
    client.insert(
        "youtube_videos", rows,
        column_names=[
            "id", "user_id", "yt_channel_id", "video_id", "title", "description",
            "thumbnail_url", "published_at", "duration_seconds", "video_format",
            "view_count", "like_count", "comment_count", "fetched_at",
        ],
    )


# --- Daily metrics ---

def bulk_insert_daily_metrics(client: Client, user_id: str, yt_channel_id: str, rows: list[dict]) -> None:
    if not rows:
        return
    data = [
        [user_id, yt_channel_id, r["metric_name"], float(r["metric_value"]), r["end_time"]]
        for r in rows
    ]
    client.insert(
        "youtube_daily_metrics", data,
        column_names=["user_id", "yt_channel_id", "metric_name", "metric_value", "end_time"],
    )


def find_daily_metrics(client: Client, user_id: str, yt_channel_id: str, metrics: list[str], since: datetime) -> list[dict]:
    rows = client.query(GET_YOUTUBE_DAILY_METRICS, parameters={
        "user_id": user_id, "yt_channel_id": yt_channel_id,
        "metrics": metrics, "since": since,
    }).result_rows
    return [
        {"metric_name": r[0], "metric_value": float(r[1]), "end_time": r[2]}
        for r in rows
    ]


# --- Retention curves ---

def bulk_insert_retention_curve(client: Client, user_id: str, yt_channel_id: str, video_id: str, points: list[dict]) -> None:
    if not points:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = [
        [
            user_id, yt_channel_id, video_id,
            float(p["elapsed_video_time_ratio"]), float(p["audience_watch_ratio"]),
            float(p.get("relative_retention_performance", 0.0)), now,
        ]
        for p in points
    ]
    client.insert(
        "youtube_retention_curves", data,
        column_names=[
            "user_id", "yt_channel_id", "video_id", "elapsed_video_time_ratio",
            "audience_watch_ratio", "relative_retention_performance", "fetched_at",
        ],
    )


def find_retention_curve(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YOUTUBE_RETENTION_CURVE, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    return [
        {
            "elapsed_video_time_ratio": float(r[0]), "audience_watch_ratio": float(r[1]),
            "relative_retention_performance": float(r[2]), "fetched_at": r[3],
        }
        for r in rows
    ]


# --- Retention annotations ---

def bulk_insert_retention_annotations(client: Client, user_id: str, video_id: str, annotations: list[dict]) -> None:
    if not annotations:
        return
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    data = [
        [
            user_id, video_id, int(a["timestamp_seconds"]),
            a.get("annotation_text", ""), float(a.get("drop_pct", 0.0)),
            a.get("model", ""), now,
        ]
        for a in annotations
    ]
    client.insert(
        "youtube_retention_annotations", data,
        column_names=["user_id", "video_id", "timestamp_seconds", "annotation_text", "drop_pct", "model", "generated_at"],
    )


def find_retention_annotations(client: Client, user_id: str, video_id: str) -> list[dict]:
    rows = client.query(GET_YOUTUBE_RETENTION_ANNOTATIONS, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    return [
        {
            "timestamp_seconds": int(r[0]), "annotation_text": r[1],
            "drop_pct": float(r[2]), "model": r[3], "generated_at": str(r[4]),
        }
        for r in rows
    ]


def annotations_are_fresh(client: Client, user_id: str, video_id: str) -> bool:
    """True when annotations exist and were generated after the last retention curve fetch."""
    curve_rows = client.query(GET_YOUTUBE_LATEST_RETENTION_FETCH, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    ann_rows = client.query(GET_YOUTUBE_LATEST_ANNOTATION_GENERATED, parameters={
        "user_id": user_id, "video_id": video_id,
    }).result_rows
    if not curve_rows or not ann_rows:
        return False
    curve_at = curve_rows[0][0]
    ann_at = ann_rows[0][0]
    if not curve_at or not ann_at:
        return False
    return ann_at >= curve_at
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/repositories/youtube_repo.py
git commit -m "feat: add YouTube repository (ClickHouse CRUD)"
```

---

## Task 6: YouTube schemas

**Files:**
- Create: `backend/app/youtube/__init__.py`
- Create: `backend/app/youtube/schemas.py`

- [ ] **Step 1: Create `backend/app/youtube/__init__.py`** (empty)

- [ ] **Step 2: Create `backend/app/youtube/schemas.py`**

```python
"""YouTube Pydantic schemas — request/response models for /api/youtube endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class YoutubeConnectResponse(BaseModel):
    oauth_url: str
    state: str


class YoutubeChannel(BaseModel):
    yt_channel_id: str
    title: str
    description: str
    thumbnail_url: str
    subscriber_count: int
    video_count: int
    view_count: int
    hidden_subscriber_count: bool


class YoutubeCallbackResponse(BaseModel):
    success: bool
    channel: YoutubeChannel


class YoutubeVideo(BaseModel):
    video_id: str
    title: str
    thumbnail_url: str
    published_at: str
    duration_seconds: int
    video_format: str
    view_count: int
    like_count: int
    comment_count: int


class YoutubeVideoListResponse(BaseModel):
    items: list[YoutubeVideo]
    total: int


class YoutubeMetricPoint(BaseModel):
    date: str
    value: float


class YoutubeMetricSeries(BaseModel):
    metric_name: str
    data: list[YoutubeMetricPoint]


class YoutubeOverviewResponse(BaseModel):
    period_days: int
    views: YoutubeMetricSeries
    watch_minutes: YoutubeMetricSeries
    subscribers_gained: YoutubeMetricSeries
    subscribers_lost: YoutubeMetricSeries


class RetentionCurvePoint(BaseModel):
    elapsed_ratio: float
    watch_ratio: float
    relative_performance: float


class RetentionAnnotation(BaseModel):
    timestamp_seconds: int
    annotation_text: str
    drop_pct: float


class RetentionResponse(BaseModel):
    video_id: str
    curve: list[RetentionCurvePoint]
    annotations: list[RetentionAnnotation]
    annotations_pending: bool


class YoutubeSyncResponse(BaseModel):
    success: bool
    message: str
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/youtube/
git commit -m "feat: add YouTube module scaffold and Pydantic schemas"
```

---

## Task 7: YouTube service (Google OAuth + API calls)

**Files:**
- Create: `backend/app/youtube/service.py`

- [ ] **Step 1: Create `backend/app/youtube/service.py`**

```python
"""YouTube API client — async HTTP operations only."""

import logging
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from ..config import settings
from ..constants import (
    HTTP_TIMEOUT_SECONDS,
    YOUTUBE_DATA_API_BASE,
    YOUTUBE_ANALYTICS_API_BASE,
    YOUTUBE_OAUTH_DIALOG_URL,
    YOUTUBE_TOKEN_EXCHANGE_URL,
    YOUTUBE_REQUIRED_SCOPES,
)
from ..exceptions import OAuthError

logger = logging.getLogger(__name__)


class YouTubeAPIError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def get_oauth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": " ".join(YOUTUBE_REQUIRED_SCOPES),
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{YOUTUBE_OAUTH_DIALOG_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> tuple[str, str]:
    """Returns (access_token, refresh_token)."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                YOUTUBE_TOKEN_EXCHANGE_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                    "code": code,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            return body["access_token"], body["refresh_token"]
        except (KeyError, httpx.HTTPStatusError, httpx.HTTPError) as exc:
            logger.error("YouTube token exchange failed: %s", exc)
            raise OAuthError("Failed to exchange YouTube authorization code")


async def refresh_access_token(refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        try:
            resp = await client.post(
                YOUTUBE_TOKEN_EXCHANGE_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
            )
            resp.raise_for_status()
            return resp.json()["access_token"]
        except (KeyError, httpx.HTTPStatusError, httpx.HTTPError) as exc:
            logger.error("YouTube token refresh failed: %s", exc)
            raise OAuthError("Failed to refresh YouTube access token")


async def fetch_channel(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/channels",
            params={"part": "snippet,statistics", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            raise YouTubeAPIError("No YouTube channel found for this account")
        item = items[0]
        stats = item.get("statistics", {})
        snippet = item.get("snippet", {})
        return {
            "yt_channel_id": item["id"],
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "thumbnail_url": snippet.get("thumbnails", {}).get("default", {}).get("url", ""),
            "subscriber_count": int(stats.get("subscriberCount", 0)),
            "video_count": int(stats.get("videoCount", 0)),
            "view_count": int(stats.get("viewCount", 0)),
            "hidden_subscriber_count": stats.get("hiddenSubscriberCount", False),
        }


def _parse_iso_duration(iso: str) -> int:
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    return int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)


def _derive_format(duration_seconds: int, live_broadcast_content: str) -> str:
    if live_broadcast_content in ("live", "upcoming"):
        return "LIVE"
    if duration_seconds <= 60:
        return "SHORT"
    return "LONG_FORM"


async def fetch_latest_videos(channel_id: str, access_token: str, max_results: int = 50) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        search_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/search",
            params={
                "part": "id", "channelId": channel_id, "type": "video",
                "order": "date", "maxResults": max_results,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        search_resp.raise_for_status()
        video_ids = [
            item["id"]["videoId"]
            for item in search_resp.json().get("items", [])
            if item.get("id", {}).get("videoId")
        ]
        if not video_ids:
            return []

        videos_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/videos",
            params={"part": "snippet,statistics,contentDetails", "id": ",".join(video_ids)},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        videos_resp.raise_for_status()

        results = []
        for item in videos_resp.json().get("items", []):
            snippet = item.get("snippet", {})
            stats = item.get("statistics", {})
            content = item.get("contentDetails", {})
            duration_s = _parse_iso_duration(content.get("duration", ""))
            lbc = snippet.get("liveBroadcastContent", "none")
            try:
                published_at = datetime.fromisoformat(
                    snippet.get("publishedAt", "").replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except (ValueError, AttributeError):
                published_at = datetime.now(timezone.utc).replace(tzinfo=None)
            results.append({
                "video_id": item["id"],
                "title": snippet.get("title", ""),
                "description": snippet.get("description", "")[:500],
                "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                "published_at": published_at,
                "duration_seconds": duration_s,
                "video_format": _derive_format(duration_s, lbc),
                "view_count": int(stats.get("viewCount", 0)),
                "like_count": int(stats.get("likeCount", 0)),
                "comment_count": int(stats.get("commentCount", 0)),
            })
        return results


async def fetch_analytics_overview(
    channel_id: str,
    access_token: str,
    start_date: str,
    end_date: str,
) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_ANALYTICS_API_BASE}/reports",
            params={
                "ids": f"channel=={channel_id}",
                "startDate": start_date,
                "endDate": end_date,
                "metrics": "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
                "dimensions": "day",
                "sort": "day",
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        col_names = [c["name"] for c in data.get("columnHeaders", [])]
        rows = []
        for row in data.get("rows", []):
            row_dict = dict(zip(col_names, row))
            try:
                end_time = datetime.strptime(row_dict["day"], "%Y-%m-%d").replace(hour=12)
            except (KeyError, ValueError):
                continue
            for metric in ["views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost"]:
                if metric in row_dict:
                    rows.append({
                        "metric_name": metric,
                        "metric_value": float(row_dict[metric]),
                        "end_time": end_time,
                    })
        return rows


async def fetch_retention_curve(channel_id: str, video_id: str, access_token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(
            f"{YOUTUBE_ANALYTICS_API_BASE}/reports",
            params={
                "ids": f"channel=={channel_id}",
                "metrics": "audienceWatchRatio,relativeRetentionPerformance",
                "dimensions": "elapsedVideoTimeRatio",
                "filters": f"video=={video_id}",
                "startDate": "2020-01-01",
                "endDate": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        col_names = [c["name"] for c in data.get("columnHeaders", [])]
        return [
            {
                "elapsed_video_time_ratio": float(dict(zip(col_names, row)).get("elapsedVideoTimeRatio", 0)),
                "audience_watch_ratio": float(dict(zip(col_names, row)).get("audienceWatchRatio", 0)),
                "relative_retention_performance": float(dict(zip(col_names, row)).get("relativeRetentionPerformance", 0)),
            }
            for row in data.get("rows", [])
        ]


async def fetch_captions(video_id: str, access_token: str) -> str | None:
    """Returns VTT caption text, or None if unavailable."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        list_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/captions",
            params={"part": "snippet", "videoId": video_id},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if list_resp.status_code != 200:
            return None
        items = list_resp.json().get("items", [])
        if not items:
            return None
        manual = [i for i in items if i["snippet"]["trackKind"] != "asr"]
        caption_id = (manual or items)[0]["id"]
        dl_resp = await client.get(
            f"{YOUTUBE_DATA_API_BASE}/captions/{caption_id}",
            params={"tfmt": "vtt"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        return dl_resp.text if dl_resp.status_code == 200 else None
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/youtube/service.py
git commit -m "feat: add YouTube service (Google OAuth + Data/Analytics API calls)"
```

---

## Task 8: YouTube router

**Files:**
- Create: `backend/app/youtube/router.py`

- [ ] **Step 1: Create `backend/app/youtube/router.py`**

```python
"""YouTube routes — OAuth flow, channel, videos, insights, retention."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from ..auth.dependencies import get_current_user
from ..config import settings
from ..constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from ..crypto import decrypt_token, encrypt_token
from ..database import get_client
from ..exceptions import OAuthError
from ..models.user import User
from ..oauth_state import create_signed_oauth_state, verify_oauth_state
from ..repositories import youtube_repo
from . import service
from .schemas import (
    RetentionAnnotation,
    RetentionCurvePoint,
    RetentionResponse,
    YoutubeCallbackResponse,
    YoutubeChannel,
    YoutubeConnectResponse,
    YoutubeOverviewResponse,
    YoutubeMetricPoint,
    YoutubeMetricSeries,
    YoutubeSyncResponse,
    YoutubeVideo,
    YoutubeVideoListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/youtube", tags=["youtube"])

_YT_PURPOSE = "yt_oauth_state"


def _channel_not_connected() -> HTTPException:
    return HTTPException(status_code=404, detail="YouTube channel not connected")


@router.get("/connect", response_model=YoutubeConnectResponse)
def connect(current_user: User = Depends(get_current_user)):
    state = create_signed_oauth_state(str(current_user.id), purpose=_YT_PURPOSE)
    oauth_url = service.get_oauth_url(state)
    return YoutubeConnectResponse(oauth_url=oauth_url, state=state)


@router.get("/callback", response_model=YoutubeCallbackResponse)
async def callback(
    background_tasks: BackgroundTasks,
    code: str = Query(...),
    state: str = Query(...),
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    verify_oauth_state(state, user_id, purpose=_YT_PURPOSE)

    client = get_client()
    existing = youtube_repo.find_channel(client, user_id)

    try:
        access_token, refresh_token = await service.exchange_code_for_tokens(code)
    except OAuthError:
        if existing:
            return YoutubeCallbackResponse(
                success=True,
                channel=YoutubeChannel(**existing),
            )
        raise

    encrypted_refresh = encrypt_token(refresh_token, settings.jwt_secret_key)
    channel_data = await service.fetch_channel(access_token)
    videos = await service.fetch_latest_videos(channel_data["yt_channel_id"], access_token)

    youtube_repo.upsert_token(client, user_id, channel_data["yt_channel_id"], encrypted_refresh)
    youtube_repo.upsert_channel(client, user_id, channel_data)
    youtube_repo.bulk_insert_videos(client, user_id, channel_data["yt_channel_id"], videos)

    background_tasks.add_task(_run_analytics_sync, user_id, channel_data["yt_channel_id"], refresh_token, 30)

    logger.info("YouTube connected for user %s (channel: %s)", user_id, channel_data["yt_channel_id"])
    return YoutubeCallbackResponse(success=True, channel=YoutubeChannel(**channel_data))


@router.get("/channel", response_model=YoutubeChannel)
def get_channel(current_user: User = Depends(get_current_user)):
    client = get_client()
    channel = youtube_repo.find_channel(client, str(current_user.id))
    if channel is None:
        raise _channel_not_connected()
    return YoutubeChannel(**channel)


@router.get("/videos", response_model=YoutubeVideoListResponse)
def get_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    yt_channel_id = token_data["yt_channel_id"]
    total = youtube_repo.count_videos(client, user_id, yt_channel_id)
    offset = (page - 1) * page_size
    items = youtube_repo.find_videos_page(client, user_id, yt_channel_id, page_size, offset)
    return YoutubeVideoListResponse(
        items=[YoutubeVideo(**v) for v in items],
        total=total,
    )


@router.post("/refresh", response_model=YoutubeCallbackResponse)
async def refresh(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh_token)
    channel_data = await service.fetch_channel(access_token)
    videos = await service.fetch_latest_videos(channel_data["yt_channel_id"], access_token)
    youtube_repo.upsert_channel(client, user_id, channel_data)
    youtube_repo.bulk_insert_videos(client, user_id, channel_data["yt_channel_id"], videos)
    logger.info("YouTube refreshed for user %s", user_id)
    return YoutubeCallbackResponse(success=True, channel=YoutubeChannel(**channel_data))


@router.post("/disconnect")
def disconnect(current_user: User = Depends(get_current_user)):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    yt_channel_id = token_data["yt_channel_id"] if token_data else ""
    youtube_repo.delete_token(client, user_id)
    logger.info("YouTube disconnected for user %s", user_id)
    return {"success": True, "yt_channel_id": yt_channel_id}


async def _run_analytics_sync(user_id: str, yt_channel_id: str, refresh_token: str, lookback_days: int = 30) -> None:
    """Background task: sync daily analytics metrics."""
    client = get_client()
    try:
        access_token = await service.refresh_access_token(refresh_token)
        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        end_date = now.strftime("%Y-%m-%d")
        rows = await service.fetch_analytics_overview(yt_channel_id, access_token, start_date, end_date)
        youtube_repo.bulk_insert_daily_metrics(client, user_id, yt_channel_id, rows)
        logger.info("YouTube analytics sync: %d rows for user %s", len(rows), user_id)
    except Exception:
        logger.exception("YouTube analytics sync failed for user %s", user_id)


@router.post("/insights/sync", response_model=YoutubeSyncResponse)
async def sync_insights(
    background_tasks: BackgroundTasks,
    lookback_days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    background_tasks.add_task(
        _run_analytics_sync, user_id, token_data["yt_channel_id"], refresh_token, lookback_days,
    )
    return YoutubeSyncResponse(success=True, message="Sync started in background")


@router.get("/insights/overview", response_model=YoutubeOverviewResponse)
def get_overview(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()
    yt_channel_id = token_data["yt_channel_id"]
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    metrics = ["views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost"]
    rows = youtube_repo.find_daily_metrics(client, user_id, yt_channel_id, metrics, since)

    grouped: dict[str, list[YoutubeMetricPoint]] = {m: [] for m in metrics}
    for row in rows:
        name = row["metric_name"]
        if name in grouped:
            grouped[name].append(YoutubeMetricPoint(
                date=row["end_time"].strftime("%Y-%m-%d") if hasattr(row["end_time"], "strftime") else str(row["end_time"])[:10],
                value=row["metric_value"],
            ))

    def series(name: str) -> YoutubeMetricSeries:
        return YoutubeMetricSeries(metric_name=name, data=grouped[name])

    return YoutubeOverviewResponse(
        period_days=days,
        views=series("views"),
        watch_minutes=series("estimatedMinutesWatched"),
        subscribers_gained=series("subscribersGained"),
        subscribers_lost=series("subscribersLost"),
    )


@router.get("/insights/retention/{video_id}", response_model=RetentionResponse)
async def get_retention(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    from ..ai.retention_analyzer import analyze_retention

    client = get_client()
    user_id = str(current_user.id)
    token_data = youtube_repo.find_token(client, user_id)
    if token_data is None:
        raise _channel_not_connected()

    yt_channel_id = token_data["yt_channel_id"]
    refresh_token = decrypt_token(token_data["refresh_token"], settings.jwt_secret_key)
    access_token = await service.refresh_access_token(refresh_token)

    # Fetch + store fresh retention curve
    points = await service.fetch_retention_curve(yt_channel_id, video_id, access_token)
    if points:
        youtube_repo.bulk_insert_retention_curve(client, user_id, yt_channel_id, video_id, points)

    curve = youtube_repo.find_retention_curve(client, user_id, video_id)
    annotations_raw = youtube_repo.find_retention_annotations(client, user_id, video_id)
    annotations_fresh = youtube_repo.annotations_are_fresh(client, user_id, video_id)
    annotations_pending = False

    if not annotations_fresh and curve:
        # Look up video metadata for the analyzer
        videos_page = youtube_repo.find_videos_page(client, user_id, yt_channel_id, 200, 0)
        video_meta = next((v for v in videos_page if v["video_id"] == video_id), None)
        title = video_meta["title"] if video_meta else ""
        duration = video_meta["duration_seconds"] if video_meta else 0

        # Only annotate if >1000 views
        view_count = video_meta["view_count"] if video_meta else 0
        if view_count >= 1000:
            caption_text = await service.fetch_captions(video_id, access_token)
            background_tasks.add_task(
                analyze_retention, user_id, video_id, title, duration, caption_text,
            )
            annotations_pending = True

    return RetentionResponse(
        video_id=video_id,
        curve=[RetentionCurvePoint(
            elapsed_ratio=p["elapsed_video_time_ratio"],
            watch_ratio=p["audience_watch_ratio"],
            relative_performance=p["relative_retention_performance"],
        ) for p in curve],
        annotations=[RetentionAnnotation(**a) for a in annotations_raw],
        annotations_pending=annotations_pending,
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/youtube/router.py
git commit -m "feat: add YouTube router (OAuth, channel, videos, insights, retention)"
```

---

## Task 9: AI retention analyzer

**Files:**
- Create: `backend/app/ai/retention_analyzer.py`

- [ ] **Step 1: Create `backend/app/ai/retention_analyzer.py`**

```python
"""AI-annotated retention curve analysis. Runs as a BackgroundTask — never raises."""

import logging
import re

from ..database import get_client
from ..repositories import youtube_repo
from . import client as ai_client
from . import quota

logger = logging.getLogger(__name__)

_DROP_THRESHOLD_PCT = 8.0
_CLIFF_WINDOW_POINTS = 10
_MAX_CLIFFS = 5
_MIN_VIEWS_FOR_AI = 1000


def _parse_vtt(vtt_text: str) -> list[tuple[float, float, str]]:
    segments = []
    lines = vtt_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if "-->" in line:
            try:
                start_str, end_str = line.split("-->")
                start_s = _vtt_ts_to_sec(start_str.strip())
                end_s = _vtt_ts_to_sec(end_str.strip())
                i += 1
                text_parts = []
                while i < len(lines) and lines[i].strip():
                    text_parts.append(re.sub(r"<[^>]+>", "", lines[i].strip()))
                    i += 1
                if text_parts:
                    segments.append((start_s, end_s, " ".join(text_parts)))
            except (ValueError, IndexError):
                i += 1
        else:
            i += 1
    return segments


def _vtt_ts_to_sec(ts: str) -> float:
    ts = ts.split(".")[0]
    parts = ts.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return float(ts)


def _extract_window(segments: list[tuple[float, float, str]], center: float, window: float = 30.0) -> str:
    return " ".join(
        text for start, end, text in segments
        if start >= center - window and end <= center + window
    )


def _detect_cliffs(curve: list[dict]) -> list[dict]:
    n = len(curve)
    candidates = []
    for i in range(n - _CLIFF_WINDOW_POINTS):
        drop = (curve[i]["audience_watch_ratio"] - curve[i + _CLIFF_WINDOW_POINTS]["audience_watch_ratio"]) * 100
        if drop >= _DROP_THRESHOLD_PCT:
            candidates.append({"elapsed_ratio": curve[i]["elapsed_video_time_ratio"], "drop_pct": drop})
    candidates.sort(key=lambda c: -c["drop_pct"])
    seen, result = set(), []
    for c in candidates:
        bucket = int(c["elapsed_ratio"] * 20)
        if bucket not in seen:
            seen.add(bucket)
            result.append(c)
        if len(result) >= _MAX_CLIFFS:
            break
    return sorted(result, key=lambda c: c["elapsed_ratio"])


async def analyze_retention(
    user_id: str,
    video_id: str,
    video_title: str,
    duration_seconds: int,
    caption_text: str | None,
) -> None:
    client = get_client()
    try:
        if youtube_repo.annotations_are_fresh(client, user_id, video_id):
            return

        curve = youtube_repo.find_retention_curve(client, user_id, video_id)
        if not curve:
            return

        cliffs = _detect_cliffs(curve)
        if not cliffs:
            return

        segments = _parse_vtt(caption_text) if caption_text else []
        annotations = []
        model = ai_client._model_for_feature()

        for cliff in cliffs:
            timestamp_s = int(cliff["elapsed_ratio"] * max(duration_seconds, 1))
            mm, ss = timestamp_s // 60, timestamp_s % 60
            drop_pct = cliff["drop_pct"]

            excerpt = _extract_window(segments, timestamp_s) if segments else ""
            if excerpt:
                prompt = (
                    f'You are a YouTube retention analyst.\n'
                    f'At {mm}:{ss:02d} in "{video_title}", {drop_pct:.1f}% of viewers '
                    f'left within 10 seconds.\nTranscript:\n---\n{excerpt}\n---\n'
                    f'In 1-2 sentences: why did viewers likely leave, and one actionable fix.'
                )
            else:
                prompt = (
                    f'You are a YouTube retention analyst.\n'
                    f'At {mm}:{ss:02d} in "{video_title}", {drop_pct:.1f}% of viewers '
                    f'left within 10 seconds. No transcript available.\n'
                    f'Suggest one likely reason and one fix based only on the timing.'
                )

            try:
                result = await ai_client.synthesize(
                    model=model,
                    system=None,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=150,
                )
                quota.record_call(client, user_id=user_id, feature="retention_annotation", result=result)
                annotation_text = result.text.strip()
            except Exception as exc:
                logger.warning("retention_analyzer: LLM failed for %s@%ds: %s", video_id, timestamp_s, exc)
                annotation_text = "AI analysis unavailable for this drop-off."

            annotations.append({
                "timestamp_seconds": timestamp_s,
                "annotation_text": annotation_text,
                "drop_pct": drop_pct,
                "model": model,
            })

        youtube_repo.bulk_insert_retention_annotations(client, user_id, video_id, annotations)
        logger.info("retention_analyzer: stored %d annotations for %s", len(annotations), video_id)
    except Exception:
        logger.exception("retention_analyzer: unexpected failure for video %s", video_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/ai/retention_analyzer.py
git commit -m "feat: add AI retention analyzer (cliff detection + LLM annotation)"
```

---

## Task 10: Register YouTube router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add YouTube router import and registration**

In `backend/app/main.py`, after the existing instagram import:

```python
from .youtube.router import router as youtube_router
```

After `app.include_router(instagram_router)`:

```python
app.include_router(youtube_router)
```

- [ ] **Step 2: Verify all endpoints load**

```bash
cd backend && uvicorn app.main:app --reload
```

Visit `http://127.0.0.1:8000/docs` — confirm `/api/youtube/*` endpoints appear.

- [ ] **Step 3: Smoke test connect endpoint**

```bash
curl -H "Authorization: Bearer <your_jwt>" http://127.0.0.1:8000/api/youtube/connect
```
Expected: `{"oauth_url":"https://accounts.google.com/...","state":"..."}` (even with empty `google_client_id`, the URL will be malformed but the endpoint should not 500).

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register YouTube router in FastAPI app"
```

---

## Task 11: Frontend types

**Files:**
- Create: `frontend/src/api/youtubeTypes.ts`

- [ ] **Step 1: Create `frontend/src/api/youtubeTypes.ts`**

```typescript
// YouTube API response types — mirror the FastAPI Pydantic schemas.

export interface YoutubeConnectResponse {
  oauth_url: string;
  state: string;
}

export interface YoutubeChannel {
  yt_channel_id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  hidden_subscriber_count: boolean;
}

export interface YoutubeCallbackResponse {
  success: boolean;
  channel: YoutubeChannel;
}

export interface YoutubeVideo {
  video_id: string;
  title: string;
  thumbnail_url: string;
  published_at: string;
  duration_seconds: number;
  video_format: string;
  view_count: number;
  like_count: number;
  comment_count: number;
}

export interface YoutubeVideoListResponse {
  items: YoutubeVideo[];
  total: number;
}

export interface YoutubeMetricPoint {
  date: string;
  value: number;
}

export interface YoutubeMetricSeries {
  metric_name: string;
  data: YoutubeMetricPoint[];
}

export interface YoutubeOverviewResponse {
  period_days: number;
  views: YoutubeMetricSeries;
  watch_minutes: YoutubeMetricSeries;
  subscribers_gained: YoutubeMetricSeries;
  subscribers_lost: YoutubeMetricSeries;
}

export interface RetentionCurvePoint {
  elapsed_ratio: number;
  watch_ratio: number;
  relative_performance: number;
}

export interface RetentionAnnotation {
  timestamp_seconds: number;
  annotation_text: string;
  drop_pct: number;
}

export interface RetentionResponse {
  video_id: string;
  curve: RetentionCurvePoint[];
  annotations: RetentionAnnotation[];
  annotations_pending: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/youtubeTypes.ts
git commit -m "feat: add YouTube frontend API types"
```

---

## Task 12: YoutubeDashboardLayout

**Files:**
- Create: `frontend/src/components/youtube/YoutubeDashboardLayout.tsx`

- [ ] **Step 1: Create `frontend/src/components/youtube/YoutubeDashboardLayout.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  ChartNoAxesColumn,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Sparkles,
  Unplug,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import axios from "axios";
import { useAuth } from "../../hooks/useAuth";
import api, { safeGet } from "../../api/client";
import type { YoutubeChannel } from "../../api/youtubeTypes";
import { avatar } from "../../data/mock";

const YT_NAV: { label: string; icon: LucideIcon; to: string }[] = [
  { label: "Overview", icon: LayoutDashboard, to: "/youtube" },
  { label: "Retention Studio", icon: ChartNoAxesColumn, to: "/youtube/retention" },
];

// Inline YouTube SVG — lucide-react 0.469 lacks a YouTube icon.
function YTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
    </svg>
  );
}

function SidebarInner({
  username,
  active,
  connected,
  onDisconnect,
  variant = "desktop",
}: {
  username: string;
  active: string;
  connected: boolean | null;
  onDisconnect: () => void;
  variant?: "desktop" | "mobile";
}) {
  return (
    <div className="flex h-full w-64 flex-col gap-1 p-4">
      <div className="flex items-center justify-between px-2 pb-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#dc2626] text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">InfluenceIQ</span>
        </Link>
      </div>

      <div className="glass mb-3 flex items-center gap-3 rounded-2xl p-3">
        <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
        <div className="min-w-0 text-xs">
          <div className="truncate font-semibold">@{username}</div>
          <div className="text-foreground/55">Creator · YouTube</div>
        </div>
      </div>

      {connected && (
        <button
          onClick={onDisconnect}
          className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground/55 transition hover:bg-white/60 hover:text-red-500"
        >
          <Unplug className="h-3.5 w-3.5" /> Disconnect YouTube
        </button>
      )}

      <nav className="space-y-1">
        {YT_NAV.map((item) => {
          const isActive = item.label === active;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                isActive ? "font-semibold text-red-700" : "text-foreground/70 hover:bg-white/60"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`yt-sidebar-active-${variant}`}
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-100 to-red-50 shadow-sm ring-1 ring-red-600/20"
                  transition={{ type: "spring", duration: 0.45, bounce: 0 }}
                />
              )}
              <item.icon className="relative h-4 w-4" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="card-hairline p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-red-600">
            <YTIcon className="h-3.5 w-3.5" /> YouTube
          </div>
          <p className="mt-2 text-xs text-foreground/55">
            Data pulled from YouTube Analytics API. Sync daily for fresh metrics.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function YoutubeDashboardLayout({
  children,
  active = "Overview",
  onSync,
  syncing,
  fill = false,
}: {
  children: ReactNode;
  active?: string;
  onSync: () => void;
  syncing: boolean;
  fill?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const username = user?.username ?? "creator";

  async function disconnectYoutube() {
    if (!window.confirm("Disconnect this YouTube channel? You'll need to reconnect to see analytics again.")) return;
    try {
      await api.post("/youtube/disconnect");
    } catch { /* idempotent */ }
    setConnected(false);
    setMobileOpen(false);
    navigate("/youtube/connect");
  }

  useEffect(() => {
    api.get<YoutubeChannel>("/youtube/channel")
      .then(() => setConnected(true))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setConnected(false);
      });
  }, []);

  return (
    <div className="aurora-scene min-h-dvh" style={{ backgroundColor: "#F5F6FA" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #fecaca, transparent 60%)", animation: "drift 22s ease-in-out infinite" }} />
        <div className="absolute top-20 -right-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #fed7aa, transparent 60%)", animation: "drift 28s ease-in-out infinite reverse" }} />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #dbeafe, transparent 60%)", animation: "drift 32s ease-in-out infinite" }} />
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden md:block">
        <SidebarInner username={username} active={active} connected={connected} onDisconnect={disconnectYoutube} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgba(10,14,39,0.3)] backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="glass-strong absolute inset-y-0 left-0">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-foreground/60 hover:bg-black/5">
              <X className="h-5 w-5" />
            </button>
            <SidebarInner username={username} active={active} connected={connected} onDisconnect={disconnectYoutube} variant="mobile" />
          </div>
        </div>
      )}

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 border-b border-black/5 bg-white/60 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <button className="md:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onSync} disabled={syncing} className="chip cursor-pointer disabled:opacity-60">
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
              </button>
              <button className="chip !bg-[#dc2626] !text-white">
                <YTIcon className="h-3.5 w-3.5" /> YouTube
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-black/5" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </button>
              <button onClick={logout} title="Sign out" aria-label="Sign out">
                <img src={avatar(47)} className="h-9 w-9 rounded-full ring-2 ring-white" alt="" />
              </button>
            </div>
          </div>
        </header>

        {(() => {
          const banner = connected === false ? (
            <div className="mb-6 flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-red-600/20 bg-red-50/60 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#dc2626] text-white">
                <YTIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Connect your YouTube Channel</div>
                <div className="text-xs text-foreground/60">Link a channel to see retention curves and analytics.</div>
              </div>
              <Link to="/youtube/connect" className="btn-glow !px-4 !py-2 !bg-[#dc2626] !shadow-[0_0_16px_rgba(220,38,38,0.3)] text-sm">
                Connect
              </Link>
            </div>
          ) : null;

          return fill ? (
            <main className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden px-4 py-4 md:px-6">
              {banner}
              <div className="min-h-0 flex-1">{children}</div>
            </main>
          ) : (
            <main className="px-4 py-6 md:px-6 md:py-8">
              {banner}
              {children}
            </main>
          );
        })()}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/youtube/
git commit -m "feat: add YoutubeDashboardLayout component"
```

---

## Task 13: YoutubeConnectPage + YoutubeCallbackPage

**Files:**
- Create: `frontend/src/pages/YoutubeConnectPage.tsx`
- Create: `frontend/src/pages/YoutubeCallbackPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/YoutubeConnectPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { YoutubeConnectResponse } from "../api/youtubeTypes";
import { useAuth } from "../hooks/useAuth";

function YTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
    </svg>
  );
}

export default function YoutubeConnectPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.get<YoutubeConnectResponse>("/youtube/connect");
      sessionStorage.setItem("yt_oauth_state", data.state);
      window.location.href = data.oauth_url;
    } catch (err) {
      setError(errorMessage(err, "Could not start the YouTube connection"));
      setBusy(false);
    }
  }

  const benefits = [
    "Retention curves saved beyond YouTube Studio limits",
    "AI drop-off explanations per video",
    "Daily metrics in one dashboard with Instagram",
  ];

  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="card-hairline p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dc2626] text-white">
            <YTIcon className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Connect your YouTube Channel
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-foreground/65">
            {user?.username ? `Hi ${user.username} — ` : ""}link your channel via Google OAuth to unlock analytics you can't get in YouTube Studio.
          </p>

          <ul className="mt-5 space-y-2 text-left">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-foreground/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]" />
                {b}
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={connect}
            disabled={busy}
            className="btn-glow mt-6 w-full disabled:opacity-60"
            style={{ background: "#dc2626", boxShadow: "0 0 20px rgba(220,38,38,0.35)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <YTIcon className="h-4 w-4" />}
            {busy ? "Redirecting…" : "Connect with Google"}
          </button>

          <button
            onClick={() => navigate("/dashboard")}
            className="mt-3 text-sm font-medium text-foreground/60 hover:text-foreground"
          >
            I'll do this later →
          </button>
        </div>

        <button
          onClick={logout}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-foreground/55 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/pages/YoutubeCallbackPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import api, { errorMessage } from "../api/client";
import type { YoutubeCallbackResponse } from "../api/youtubeTypes";

type Status = "working" | "ok" | "error";

export default function YoutubeCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Finishing the YouTube connection…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state") || sessionStorage.getItem("yt_oauth_state") || "";
    const oauthError = params.get("error_description") || params.get("error");

    if (oauthError) { setStatus("error"); setMessage(oauthError); return; }
    if (!code) { setStatus("error"); setMessage("Missing authorization code from Google."); return; }

    api
      .get<YoutubeCallbackResponse>("/youtube/callback", { params: { code, state } })
      .then(() => {
        sessionStorage.removeItem("yt_oauth_state");
        setStatus("ok");
        setMessage("Channel connected! Taking you to your dashboard…");
        setTimeout(() => navigate("/youtube", { replace: true }), 900);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(errorMessage(err, "Could not complete the YouTube connection"));
      });
  }, [params, navigate]);

  return (
    <div className="aurora-scene grain relative grid min-h-dvh place-items-center px-4">
      <div className="card-hairline w-full max-w-sm p-8 text-center">
        {status === "working" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#dc2626]" />}
        {status === "ok" && <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />}
        {status === "error" && <XCircle className="mx-auto h-10 w-10 text-red-500" />}
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {status === "ok" ? "All set" : status === "error" ? "Connection failed" : "Connecting…"}
        </h1>
        <p className="mt-2 text-sm text-foreground/65">{message}</p>
        {status === "error" && (
          <Link to="/youtube/connect" className="btn-glow mt-6 inline-flex">Try again</Link>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/YoutubeConnectPage.tsx frontend/src/pages/YoutubeCallbackPage.tsx
git commit -m "feat: add YoutubeConnectPage and YoutubeCallbackPage"
```

---

## Task 14: VideoCard + SmartRetentionChart components

**Files:**
- Create: `frontend/src/components/youtube/VideoCard.tsx`
- Create: `frontend/src/components/youtube/SmartRetentionChart.tsx`

- [ ] **Step 1: Create `frontend/src/components/youtube/VideoCard.tsx`**

```tsx
import type { YoutubeVideo } from "../../api/youtubeTypes";

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export default function VideoCard({
  video,
  active,
  onClick,
}: {
  video: YoutubeVideo;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-2 text-left transition hover:bg-white/70 ${
        active
          ? "border-[#dc2626]/40 bg-red-50 ring-2 ring-[#dc2626]/30"
          : "border-black/5 bg-white/40"
      }`}
      aria-pressed={active}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-lavender">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-lavender" />
        )}
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
          {fmtDuration(video.duration_seconds)}
        </span>
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white capitalize">
          {video.video_format.replace("_", " ")}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug">{video.title}</p>
      <div className="mt-1 flex gap-2">
        <span className="chip !px-1.5 !py-0.5 !text-[10px]">{fmt(video.view_count)} views</span>
        <span className="chip !px-1.5 !py-0.5 !text-[10px]">{fmt(video.like_count)} likes</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/youtube/SmartRetentionChart.tsx`**

```tsx
import { Loader2 } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import type { RetentionAnnotation, RetentionCurvePoint } from "../../api/youtubeTypes";
import GlassTooltip from "../charts/GlassTooltip";

function fmtPct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function fmtTimestamp(elapsed: number, durationSeconds: number) {
  const s = Math.round(elapsed * durationSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SmartRetentionChart({
  curve,
  annotations,
  annotationsPending,
  durationSeconds,
}: {
  curve: RetentionCurvePoint[];
  annotations: RetentionAnnotation[];
  annotationsPending: boolean;
  durationSeconds: number;
}) {
  if (!curve.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-foreground/50">
        No retention data available for this video.
      </div>
    );
  }

  const chartData = curve.map((p) => ({
    elapsed: p.elapsed_ratio,
    watch: p.watch_ratio * 100,
    benchmark: p.relative_performance * 100,
  }));

  // Map annotation timestamp_seconds → elapsed_ratio for reference lines
  const cliffElapsed = annotations.map((a) => ({
    elapsed: durationSeconds > 0 ? a.timestamp_seconds / durationSeconds : 0,
    annotation: a,
  }));

  return (
    <div
      role="img"
      aria-label={`Retention curve. ${annotations.length} drop-off${annotations.length !== 1 ? "s" : ""} annotated.`}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="elapsed"
            tickFormatter={(v) => fmtTimestamp(v, durationSeconds)}
            tick={{ fontSize: 11 }}
            label={{ value: "Video position", position: "insideBottom", offset: -4, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v) => `${Math.round(v)}%`}
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
          />
          <Tooltip content={<GlassTooltip />} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
          <Area
            type="monotone"
            dataKey="watch"
            name="Retention"
            stroke="#dc2626"
            fill="rgba(220,38,38,0.12)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            name="YT Average"
            stroke="#9ca3af"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            dot={false}
          />
          {cliffElapsed.map(({ elapsed }) => (
            <ReferenceLine
              key={elapsed}
              x={elapsed}
              stroke="#dc2626"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Annotation cards */}
      {annotations.length > 0 && (
        <div className="mt-4 space-y-2">
          {annotations.map((a, i) => {
            const s = a.timestamp_seconds;
            const mm = Math.floor(s / 60);
            const ss = s % 60;
            return (
              <motion.div
                key={a.timestamp_seconds}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05, ease: "easeOut" }}
                className="glass rounded-xl border border-red-100 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="chip !bg-red-50 !text-red-700 !text-[10px]">
                    {mm}:{ss.toString().padStart(2, "0")}
                  </span>
                  <span className="chip !bg-red-50 !text-red-700 !text-[10px]">
                    −{a.drop_pct.toFixed(1)}% viewers
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-foreground/75">{a.annotation_text}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {annotationsPending && (
        <div className="mt-3 flex items-center gap-2 text-xs text-foreground/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing with AI — check back in a moment…
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/youtube/
git commit -m "feat: add VideoCard and SmartRetentionChart components"
```

---

## Task 15: YoutubeDashboardPage

**Files:**
- Create: `frontend/src/pages/YoutubeDashboardPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/YoutubeDashboardPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Eye, Clock, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api, { safeGet } from "../api/client";
import type { YoutubeOverviewResponse, YoutubeVideoListResponse, YoutubeVideo } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import GlassTooltip from "../components/charts/GlassTooltip";
import Sparkline from "../components/charts/Sparkline";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

export default function YoutubeDashboardPage() {
  const [days] = useState(30);
  const [syncing, setSyncing] = useState(false);
  const [overview, setOverview] = useState<YoutubeOverviewResponse | null>(null);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);

  const load = useCallback(async () => {
    const [ov, vl] = await Promise.all([
      safeGet<YoutubeOverviewResponse>("/youtube/insights/overview", { days }),
      safeGet<YoutubeVideoListResponse>("/youtube/videos", { page: 1, page_size: 5 }),
    ]);
    setOverview(ov);
    setVideos(vl?.items ?? []);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      await api.post("/youtube/insights/sync");
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const totalViews = overview?.views.data.reduce((s, p) => s + p.value, 0) ?? 0;
  const totalMinutes = overview?.watch_minutes.data.reduce((s, p) => s + p.value, 0) ?? 0;
  const totalSubs = (overview?.subscribers_gained.data.reduce((s, p) => s + p.value, 0) ?? 0)
    - (overview?.subscribers_lost.data.reduce((s, p) => s + p.value, 0) ?? 0);

  const viewsSpark = (overview?.views.data ?? []).map((p) => ({ v: p.value }));
  const watchSpark = (overview?.watch_minutes.data ?? []).map((p) => ({ v: p.value }));
  const subsSpark = (overview?.subscribers_gained.data ?? []).map((p, i) => ({
    v: p.value - (overview?.subscribers_lost.data[i]?.value ?? 0),
  }));

  const chartData = (overview?.views.data ?? []).map((p) => ({
    date: p.date.slice(5),
    views: p.value,
  }));

  const stats = [
    { label: "Total Views", value: fmt(totalViews), icon: Eye, spark: viewsSpark },
    { label: "Watch Hours", value: fmt(Math.round(totalMinutes / 60)), icon: Clock, spark: watchSpark },
    { label: "Net Subscribers", value: (totalSubs >= 0 ? "+" : "") + fmt(totalSubs), icon: TrendingUp, spark: subsSpark },
  ];

  return (
    <YoutubeDashboardLayout active="Overview" onSync={sync} syncing={syncing}>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">YouTube Overview</h1>

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card-hairline p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/55">
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="num mt-2 text-2xl font-semibold">{s.value}</div>
            <div className="mt-2 h-10">
              <Sparkline data={s.spark} color="#dc2626" />
            </div>
          </div>
        ))}
      </div>

      {/* Daily views chart */}
      <div className="card-hairline mb-6 p-4">
        <div className="mb-3 text-sm font-medium">Daily Views — last {days} days</div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
              <Tooltip content={<GlassTooltip />} />
              <Area type="monotone" dataKey="views" stroke="#dc2626" fill="rgba(220,38,38,0.12)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-foreground/40">
            No data yet — sync to pull analytics from YouTube.
          </div>
        )}
      </div>

      {/* Top videos */}
      {videos.length > 0 && (
        <div className="card-hairline p-4">
          <div className="mb-3 text-sm font-medium">Recent Videos</div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {videos.map((v) => (
              <a key={v.video_id} href={`/youtube/retention`} className="group block rounded-xl overflow-hidden border border-black/5 bg-white/40 hover:bg-white/70 transition">
                <div className="relative aspect-video bg-lavender">
                  {v.thumbnail_url && (
                    <img src={v.thumbnail_url} alt={v.title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-2 text-xs font-medium leading-snug">{v.title}</p>
                  <p className="mt-1 text-[10px] text-foreground/50">{fmt(v.view_count)} views</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubeDashboardPage.tsx
git commit -m "feat: add YoutubeDashboardPage (overview metrics + chart + top videos)"
```

---

## Task 16: YoutubeRetentionPage

**Files:**
- Create: `frontend/src/pages/YoutubeRetentionPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/YoutubeRetentionPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import api, { safeGet } from "../api/client";
import type { RetentionResponse, YoutubeVideo, YoutubeVideoListResponse } from "../api/youtubeTypes";
import YoutubeDashboardLayout from "../components/youtube/YoutubeDashboardLayout";
import VideoCard from "../components/youtube/VideoCard";
import SmartRetentionChart from "../components/youtube/SmartRetentionChart";

export default function YoutubeRetentionPage() {
  const [syncing, setSyncing] = useState(false);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<YoutubeVideo | null>(null);
  const [retention, setRetention] = useState<RetentionResponse | null>(null);
  const [loadingRetention, setLoadingRetention] = useState(false);

  useEffect(() => {
    safeGet<YoutubeVideoListResponse>("/youtube/videos", { page: 1, page_size: 50 }).then((r) => {
      setVideos(r?.items ?? []);
    });
  }, []);

  const selectVideo = useCallback(async (video: YoutubeVideo) => {
    setSelected(video);
    setRetention(null);
    setLoadingRetention(true);
    try {
      const { data } = await api.get<RetentionResponse>(`/youtube/insights/retention/${video.video_id}`);
      setRetention(data);
    } catch {
      setRetention(null);
    } finally {
      setLoadingRetention(false);
    }
  }, []);

  async function sync() {
    setSyncing(true);
    try { await api.post("/youtube/insights/sync"); } finally { setSyncing(false); }
  }

  const filtered = videos.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <YoutubeDashboardLayout active="Retention Studio" onSync={sync} syncing={syncing}>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight">Retention Studio</h1>

      <div className="flex gap-4 min-h-[600px]">
        {/* Left — video selector */}
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <input
            type="search"
            placeholder="Search videos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="chip w-full bg-white/60 text-sm outline-none placeholder:text-foreground/40"
            aria-label="Search videos"
          />
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-foreground/40">
                {videos.length === 0 ? "No videos synced yet." : "No matches."}
              </p>
            )}
            {filtered.map((v, i) => (
              <motion.div
                key={v.video_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: i * 0.03, ease: "easeOut" }}
              >
                <VideoCard
                  video={v}
                  active={selected?.video_id === v.video_id}
                  onClick={() => selectVideo(v)}
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right — chart */}
        <div className="flex-1 card-hairline p-5">
          {!selected && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-foreground/40">
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8ZM9.8 15.5V8.5l6.3 3.5-6.3 3.5Z" />
              </svg>
              <p className="text-sm">Select a video from the list to see its retention curve</p>
            </div>
          )}

          {selected && loadingRetention && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#dc2626] border-t-transparent" />
                <p className="mt-3 text-sm text-foreground/50">Loading retention data…</p>
              </div>
            </div>
          )}

          {selected && !loadingRetention && retention && (
            <div>
              <div className="mb-4">
                <h2 className="font-medium leading-snug line-clamp-2">{selected.title}</h2>
                <p className="mt-0.5 text-xs text-foreground/50">
                  {selected.video_format.replace("_", " ")} · {Math.round(selected.duration_seconds / 60)} min
                </p>
              </div>
              <SmartRetentionChart
                curve={retention.curve}
                annotations={retention.annotations}
                annotationsPending={retention.annotations_pending}
                durationSeconds={selected.duration_seconds}
              />
            </div>
          )}

          {selected && !loadingRetention && !retention && (
            <div className="flex h-full items-center justify-center text-sm text-foreground/40">
              No retention data found for this video. It may have fewer than 1,000 views.
            </div>
          )}
        </div>
      </div>
    </YoutubeDashboardLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/YoutubeRetentionPage.tsx
git commit -m "feat: add YoutubeRetentionPage (video selector + SmartRetentionChart)"
```

---

## Task 17: Register YouTube routes in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add YouTube imports to `frontend/src/App.tsx`**

After the existing page imports, add:

```tsx
import YoutubeConnectPage from "./pages/YoutubeConnectPage";
import YoutubeCallbackPage from "./pages/YoutubeCallbackPage";
import YoutubeDashboardPage from "./pages/YoutubeDashboardPage";
import YoutubeRetentionPage from "./pages/YoutubeRetentionPage";
```

- [ ] **Step 2: Add YouTube routes inside `<Routes>` in `AppRoutes()`**

After the existing `/dashboard/copilot` route, before the `<Route path="*">`:

```tsx
<Route path="/youtube/connect" element={<ProtectedRoute><YoutubeConnectPage /></ProtectedRoute>} />
<Route path="/auth/youtube/callback" element={<ProtectedRoute><YoutubeCallbackPage /></ProtectedRoute>} />
<Route path="/youtube" element={<ProtectedRoute><YoutubeDashboardPage /></ProtectedRoute>} />
<Route path="/youtube/retention" element={<ProtectedRoute><YoutubeRetentionPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Verify TypeScript build passes**

```bash
cd frontend && npm run build
```
Expected: exit 0, no TypeScript errors.

- [ ] **Step 4: Manual smoke test**

```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:5173/youtube/connect` — connect page loads with YouTube icon and red button. Navigate to `http://localhost:5173/youtube` — dashboard renders (stat cards show zeros or mock state, no crashes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: register YouTube routes in App.tsx"
```

---

## Task 18: End-to-end verification

No automated test suite exists. Run these manual checks in order.

- [ ] **Step 1: Apply migrations and confirm tables exist**

```bash
cd backend && python run_migrations.py
```

In your ClickHouse console or client:
```sql
SHOW TABLES LIKE 'youtube%';
```
Expected: 6 tables — `youtube_channels`, `youtube_daily_metrics`, `youtube_retention_annotations`, `youtube_retention_curves`, `youtube_tokens`, `youtube_videos`.

- [ ] **Step 2: Confirm OAuth URL builds correctly**

Set `GOOGLE_CLIENT_ID=test123` in `.env`, restart backend:
```bash
curl -H "Authorization: Bearer <your_jwt>" http://127.0.0.1:8000/api/youtube/connect
```
Expected response contains `oauth_url` starting with `https://accounts.google.com/o/oauth2/v2/auth?client_id=test123...`.

- [ ] **Step 3: Confirm 404 for unconnected channel**

```bash
curl -H "Authorization: Bearer <your_jwt>" http://127.0.0.1:8000/api/youtube/channel
```
Expected: `{"detail":"YouTube channel not connected"}` (status 404).

- [ ] **Step 4: Confirm frontend routes load without crash**

With `npm run dev`, visit each route and confirm no console errors:
- `http://localhost:5173/youtube/connect` — connect page with red YouTube icon
- `http://localhost:5173/youtube` — dashboard (connect banner shows if not connected)
- `http://localhost:5173/youtube/retention` — retention page (empty video list + select prompt)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: YouTube integration Phase 1 complete (foundation + AI retention)"
```
