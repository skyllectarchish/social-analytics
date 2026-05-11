# Analytics & Insights API

This section details the endpoints that power the Analytics Dashboard. These endpoints serve time-series performance data, demographic breakdowns, media-level insights, and pre-computed dashboard aggregates.

All routes are mounted under the prefix `/api/instagram` (the insights endpoints sit beside the core Instagram endpoints) and every endpoint requires an authenticated user (Bearer JWT). Endpoints that need a connected IG account raise `404 InstagramNotConnectedError` if the user has not yet completed OAuth.

---

## 1. Trigger Insights Sync (Background Task)
Kicks off an asynchronous background job to fetch all missing insights data from the Meta Graph API and store it in ClickHouse. This includes account time-series metrics, demographics, and per-post insights for media that hasn't been synced recently.

* **URL:** `/api/instagram/insights/sync`
* **Method:** `POST`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
Returns **immediately**, indicating the sync has been queued. The numeric counters are always `0` / `false` in the immediate response because the actual work happens in a FastAPI background task after the response is sent. Inspect server logs (or repeat `/dashboard` / `/overview` polling) to confirm completion.

```json
{
  "success": true,
  "account_metrics_synced": 0,
  "media_insights_synced": 0,
  "demographics_synced": false,
  "message": "Sync started in background"
}
```

> **Frontend Integration Note:** Because this runs in the background, poll `/api/instagram/insights/dashboard` or `/overview` periodically to detect when new data has populated. There is currently no completion webhook or job-status endpoint.

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`: no Instagram account connected.

---

## 2. Dashboard Aggregates (Hero Cards)
Returns pre-computed summary statistics for the dashboard hero section. This endpoint does the heavy lifting (aggregation queries in ClickHouse) so the frontend doesn't have to compute totals client-side.

* **URL:** `/api/instagram/insights/dashboard`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `days` (integer, optional): The lookback period in days. Default `30`, minimum `1`, maximum `90`.
* `top_n` (integer, optional): Number of top-performing posts to return. Default `5`, minimum `1`, maximum `20`.

### Example Request
`GET /api/instagram/insights/dashboard?days=30&top_n=3`

### Response (200 OK)
```json
{
  "period_days": 30,
  "total_views": 150000,
  "total_reach": 125000,
  "total_interactions": 4500,
  "total_accounts_engaged": 3200,
  "net_follower_growth": 450,
  "top_posts": [
    {
      "ig_media_id": "18000000000000001",
      "media_type": "VIDEO",
      "permalink": "https://www.instagram.com/reel/xyz123/",
      "caption": "Check out this new reel! #viral",
      "views": 45000,
      "interactions": 1200
    },
    {
      "ig_media_id": "18000000000000002",
      "media_type": "IMAGE",
      "permalink": "https://www.instagram.com/p/abc456/",
      "caption": "Photo dump 📸",
      "views": 22000,
      "interactions": 850
    }
  ]
}
```

`net_follower_growth` is the signed net change in followers over the period (positive = gained followers, negative = lost followers). The response does not return separate follow/unfollow counts — the underlying `follows_and_unfollows` time series can be requested from `/overview` if a breakdown is needed.

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`.
* **422 Unprocessable Entity** — `days` or `top_n` out of range.

---

## 3. Account Overview (Time-Series Data)
Returns daily time-series data for high-level account performance metrics. Ideal for plotting line or bar charts over time.

* **URL:** `/api/instagram/insights/overview`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `days` (integer, optional): The lookback period in days. Default `30`, minimum `1`, maximum `90`.

### Example Request
`GET /api/instagram/insights/overview?days=7`

### Response (200 OK)
Returns one `{metric_name, data}` series per metric, where `data` is an array of `{end_time, value}` points sorted chronologically. Metrics that haven't been synced (or are unavailable for this account) come back with an empty `data` array — the keys are always present in the response.

```json
{
  "views": {
    "metric_name": "views",
    "data": [
      { "end_time": "2026-05-01T00:00:00", "value": 5000 },
      { "end_time": "2026-05-02T00:00:00", "value": 6200 }
    ]
  },
  "reach": {
    "metric_name": "reach",
    "data": [
      { "end_time": "2026-05-01T00:00:00", "value": 4100 },
      { "end_time": "2026-05-02T00:00:00", "value": 5050 }
    ]
  },
  "follows_and_unfollows": {
    "metric_name": "follows_and_unfollows",
    "data": [
      { "end_time": "2026-05-01T00:00:00", "value": 12 },
      { "end_time": "2026-05-02T00:00:00", "value": -3 }
    ]
  },
  "total_interactions": {
    "metric_name": "total_interactions",
    "data": []
  },
  "accounts_engaged": {
    "metric_name": "accounts_engaged",
    "data": []
  }
}
```

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`.
* **422 Unprocessable Entity** — `days` out of range.

---

## 4. Audience Demographics
Returns demographic breakdowns of the creator's audience for a single dimension.

* **URL:** `/api/instagram/insights/demographics`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters (Both Required)
* `metric`: Must be either `follower_demographics` or `engaged_audience_demographics`.
* `breakdown`: Must be one of `age`, `gender`, `city`, or `country`.

### Example Request
`GET /api/instagram/insights/demographics?metric=follower_demographics&breakdown=age`

### Response (200 OK)
```json
{
  "metric_name": "follower_demographics",
  "breakdown": "age",
  "data": [
    { "dimension_value": "13-17", "value": 450 },
    { "dimension_value": "18-24", "value": 5200 },
    { "dimension_value": "25-34", "value": 6100 },
    { "dimension_value": "35-44", "value": 2100 }
  ]
}
```

If no data is stored yet for the requested breakdown (e.g., before the first sync completes, or for very small accounts that fall below Meta's privacy threshold), `data` is `[]`.

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`.
* **422 Unprocessable Entity** — `metric` or `breakdown` value not in the allowed set.

---

## 5. Media Insights (Per-Post)
Retrieves detailed performance metrics for a specific media item from local storage.

* **URL:** `/api/instagram/insights/media/{media_id}`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Path Parameters
* `media_id` (string): The Instagram media ID (e.g., `18000000000000001`).

### Example Request
`GET /api/instagram/insights/media/18000000000000001`

### Response (200 OK)
Returns the list of metrics available for that post type — the exact set depends on whether the post is a Feed image, a Reel, a Carousel, or a Story. Reels include `ig_reels_avg_watch_time` (seconds) and `ig_reels_video_view_total_time` (seconds); Feed posts include `profile_visits` and `reposts`; Stories include `replies` and `navigation`. If no insights have been synced for this media yet, `insights` is `[]`.

```json
{
  "ig_media_id": "18000000000000001",
  "insights": [
    { "metric_name": "likes", "value": 4500 },
    { "metric_name": "comments", "value": 120 },
    { "metric_name": "shares", "value": 350 },
    { "metric_name": "saved", "value": 850 },
    { "metric_name": "reach", "value": 38000 },
    { "metric_name": "views", "value": 45000 },
    { "metric_name": "total_interactions", "value": 5820 },
    { "metric_name": "ig_reels_avg_watch_time", "value": 4.5 },
    { "metric_name": "ig_reels_video_view_total_time", "value": 202500.0 }
  ]
}
```

`value` is a float in the schema — most counters are whole numbers but watch-time metrics carry fractional seconds.

> **Note:** This endpoint reads from local storage only. To populate the data, run `/insights/sync` first. The endpoint does **not** check Instagram connectivity — an unknown `media_id` simply returns an empty `insights` array.

---

## 6. Live Stories
Fetches currently active stories directly from the Meta Graph API, then batch-fetches their insights. Because Stories expire after 24 hours, this endpoint always queries live and never relies on the sync cache.

* **URL:** `/api/instagram/stories`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Example Request
`GET /api/instagram/stories`

### Response (200 OK)
Returns the active stories along with their current live insights. If there are no active stories, `stories` is `[]`.

```json
{
  "stories": [
    {
      "ig_media_id": "18000000000000003",
      "media_type": "STORY",
      "media_url": "https://scontent.cdninstagram.com/...jpg",
      "thumbnail_url": "",
      "permalink": "https://www.instagram.com/stories/creator_ig_handle/18000000000000003/",
      "timestamp": "2026-05-08 09:00:00",
      "insights": [
        { "metric_name": "reach", "value": 1200 },
        { "metric_name": "views", "value": 1350 },
        { "metric_name": "shares", "value": 12 },
        { "metric_name": "replies", "value": 5 },
        { "metric_name": "total_interactions", "value": 17 }
      ]
    }
  ]
}
```

### Error Responses
* **404 Not Found** — `InstagramNotConnectedError`: user has not connected an Instagram account.
* **502 Bad Gateway** — Upstream Meta Graph API request failed (typical when the long-lived token has expired — re-run the OAuth flow).
