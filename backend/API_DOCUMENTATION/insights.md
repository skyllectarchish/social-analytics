# Analytics & Insights API

This section details the endpoints that power the Analytics Dashboard. These endpoints serve time-series performance data, demographic breakdowns, media-level insights, and pre-computed dashboard aggregates.

---

## 1. Trigger Insights Sync (Background Task)
Kicks off an asynchronous background job to fetch all missing insights data from the Meta Graph API and store it in the ClickHouse database. This includes account time-series metrics, demographics, and per-post insights.

* **URL:** `/api/instagram/insights/sync`
* **Method:** `POST`
* **Requires Auth:** Yes (Bearer Token)

### Response (200 OK)
Returns immediately, indicating the sync has started in the background.

```json
{
  "success": true,
  "account_metrics_synced": 0,
  "media_insights_synced": 0,
  "demographics_synced": false,
  "message": "Sync started in background"
}
```
> **Frontend Integration Note:** Because this runs in the background, you should periodically poll the `/api/instagram/insights/dashboard` or `/overview` endpoints to see when the data populates.

---

## 2. Dashboard Aggregates (Hero Cards)
Returns pre-computed summary statistics for the dashboard hero section. This endpoint does the heavy lifting so the frontend doesn't have to compute totals.

* **URL:** `/api/instagram/insights/dashboard`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `days` (integer, optional): The lookback period in days. Default is `30`, Max is `90`.
* `top_n` (integer, optional): Number of top-performing posts to return. Default is `5`.

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
  "new_follows": 0,
  "unfollows": 0,
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

---

## 3. Account Overview (Time-Series Data)
Returns daily time-series data for high-level account performance metrics. Ideal for plotting line or bar charts over time.

* **URL:** `/api/instagram/insights/overview`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Query Parameters
* `days` (integer, optional): The lookback period in days. Default is `30`, Max is `90`.

### Example Request
`GET /api/instagram/insights/overview?days=7`

### Response (200 OK)
Returns arrays of `{end_time, value}` objects for each major metric.

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

---

## 4. Audience Demographics
Returns demographic breakdowns of the creator's audience.

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

---

## 5. Media Insights (Per-Post)
Retrieves detailed performance metrics for a specific media item.

* **URL:** `/api/instagram/insights/media/{media_id}`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Path Parameters
* `media_id` (string): The Instagram media ID (e.g., `18000000000000001`).

### Example Request
`GET /api/instagram/insights/media/18000000000000001`

### Response (200 OK)
Returns a list of specific metrics available for that post type (Reels will have watch time, images will not).

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

---

## 6. Live Stories
Fetches currently active stories directly from the Meta Graph API. Since stories expire after 24 hours, this endpoint provides live data and is not entirely reliant on the sync process.

* **URL:** `/api/instagram/stories`
* **Method:** `GET`
* **Requires Auth:** Yes (Bearer Token)

### Example Request
`GET /api/instagram/stories`

### Response (200 OK)
Returns the active stories along with their current live insights.

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
