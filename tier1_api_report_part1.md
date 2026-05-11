# Tier 1 Features — Facebook Graph API Research Report (Part 1)

> Comprehensive analysis of which Meta Graph API endpoints are needed, what data you already collect, and what modifications are required to implement Tier 1 features from the Instagram Analytics Feature Research document.

---

## Executive Summary

**Your current API version:** `v21.0` (via `GRAPH_BASE_URL` in [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py))
**Latest available API version:** `v25.0`

> [!IMPORTANT]
> All 5 Tier 1 features can be built **primarily from data you already collect**. No new Graph API endpoints are required — only new ClickHouse queries, minor schema additions, and new backend computation endpoints. Two features benefit from fetching **one additional field** (`video_duration`) that you don't currently store.

### Tier 1 Features at a Glance

| # | Feature | New API Calls? | New DB Columns? | Effort |
|---|---------|---------------|-----------------|--------|
| 1 | Content-Format Performance Breakdown | ❌ None | ❌ None | ~3 days |
| 2 | Best Time to Post (Personalized) | ❌ None | ❌ None | ~4 days |
| 3 | Save Rate & Share Rate Metrics | ❌ None | ❌ None | ~2 days |
| 4 | Reels Retention & Drop-Off Analysis | ⚠️ 1 new field | ✅ `video_duration` | ~5 days |
| 5 | Follower Quality Score | ❌ None | ❌ None | ~3 days |

---

## Current Data Inventory

Before diving into each feature, here's what your system already collects:

### Data You Already Store in ClickHouse

#### `instagram_media` table
```
ig_media_id, media_type, media_product_type, media_url, thumbnail_url,
permalink, caption, timestamp, like_count, comments_count
```
- `media_type`: `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`
- `media_product_type`: `FEED`, `REELS`, `STORY`

#### `media_insights` table
```
ig_media_id, metric_name, metric_value, fetched_at
```
Metrics collected per media type:

| Metric | FEED | REELS | STORY |
|--------|------|-------|-------|
| `likes` | ✅ | ✅ | ❌ |
| `comments` | ✅ | ✅ | ❌ |
| `saved` | ✅ | ✅ | ❌ |
| `shares` | ✅ | ✅ | ✅ |
| `reach` | ✅ | ✅ | ✅ |
| `views` | ✅ | ✅ | ✅ |
| `total_interactions` | ✅ | ✅ | ✅ |
| `profile_visits` | ✅ | ❌ | ❌ |
| `reposts` | ✅ | ✅ | ✅ |
| `ig_reels_avg_watch_time` | ❌ | ✅ | ❌ |
| `ig_reels_video_view_total_time` | ❌ | ✅ | ❌ |
| `replies` | ❌ | ❌ | ✅ |
| `navigation` | ❌ | ❌ | ✅ |

#### `account_insights` table
```
metric_name, metric_value, end_time (daily time-series)
```
Metrics: `reach`, `views`, `follows_and_unfollows`, `total_interactions`, `accounts_engaged`

#### `demographic_insights` table
```
metric_name, dimension_key, dimension_value, metric_value, timeframe
```
Metrics: `follower_demographics`, `engaged_audience_demographics`
Breakdowns: `age`, `gender`, `city`, `country`

---

## Feature 1: Content-Format Performance Breakdown

### What It Does
Shows creators how each content format (Reels vs Images vs Carousels) performs on key metrics — answering "do my Reels outperform my Carousels?"

### Graph API Requirements

> [!TIP]
> **No new API calls needed.** This is 100% computed from existing ClickHouse data.

You already store:
- `media_product_type` in `instagram_media` → distinguishes `FEED`, `REELS`, `STORY`
- `media_type` in `instagram_media` → distinguishes `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`
- All per-media metrics in `media_insights` → `likes`, `comments`, `saved`, `shares`, `reach`, `views`, `total_interactions`

### Implementation: New ClickHouse Queries

```sql
-- FORMAT BREAKDOWN: Average metrics per media_product_type
SELECT
    m.media_product_type,
    m.media_type,
    count() AS post_count,
    avg(mi_reach.metric_value) AS avg_reach,
    avg(mi_views.metric_value) AS avg_views,
    avg(mi_likes.metric_value) AS avg_likes,
    avg(mi_saved.metric_value) AS avg_saves,
    avg(mi_shares.metric_value) AS avg_shares,
    avg(mi_interactions.metric_value) AS avg_interactions,
    -- Engagement rate = total_interactions / reach
    avgIf(
        mi_interactions.metric_value / mi_reach.metric_value,
        mi_reach.metric_value > 0
    ) AS avg_engagement_rate,
    -- Save rate = saved / reach (algorithm signal)
    avgIf(
        mi_saved.metric_value / mi_reach.metric_value,
        mi_reach.metric_value > 0
    ) AS avg_save_rate,
    -- Share rate = shares / reach (virality signal)
    avgIf(
        mi_shares.metric_value / mi_reach.metric_value,
        mi_reach.metric_value > 0
    ) AS avg_share_rate
FROM instagram_media m FINAL
LEFT JOIN media_insights mi_reach FINAL
    ON m.ig_media_id = mi_reach.ig_media_id AND m.user_id = mi_reach.user_id
    AND mi_reach.metric_name = 'reach'
LEFT JOIN media_insights mi_views FINAL
    ON m.ig_media_id = mi_views.ig_media_id AND m.user_id = mi_views.user_id
    AND mi_views.metric_name = 'views'
LEFT JOIN media_insights mi_likes FINAL
    ON m.ig_media_id = mi_likes.ig_media_id AND m.user_id = mi_likes.user_id
    AND mi_likes.metric_name = 'likes'
LEFT JOIN media_insights mi_saved FINAL
    ON m.ig_media_id = mi_saved.ig_media_id AND m.user_id = mi_saved.user_id
    AND mi_saved.metric_name = 'saved'
LEFT JOIN media_insights mi_shares FINAL
    ON m.ig_media_id = mi_shares.ig_media_id AND m.user_id = mi_shares.user_id
    AND mi_shares.metric_name = 'shares'
LEFT JOIN media_insights mi_interactions FINAL
    ON m.ig_media_id = mi_interactions.ig_media_id AND m.user_id = mi_interactions.user_id
    AND mi_interactions.metric_name = 'total_interactions'
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type != ''
GROUP BY m.media_product_type, m.media_type
ORDER BY avg_reach DESC
```

> [!NOTE]
> A more efficient approach: pivot via `sumIf`/`avgIf` on a single self-join of `media_insights`, grouping by `ig_media_id` first, then joining to `instagram_media` once. This avoids 6 separate LEFT JOINs.

### Optimized Single-Query Approach

```sql
SELECT
    m.media_product_type,
    m.media_type,
    count(DISTINCT m.ig_media_id) AS post_count,
    avg(metrics.reach) AS avg_reach,
    avg(metrics.views) AS avg_views,
    avg(metrics.likes) AS avg_likes,
    avg(metrics.saved) AS avg_saves,
    avg(metrics.shares) AS avg_shares,
    avg(metrics.total_interactions) AS avg_interactions,
    avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) AS avg_engagement_rate,
    avgIf(metrics.saved / metrics.reach, metrics.reach > 0) AS avg_save_rate,
    avgIf(metrics.shares / metrics.reach, metrics.reach > 0) AS avg_share_rate
FROM instagram_media m FINAL
INNER JOIN (
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'views') AS views,
        sumIf(metric_value, metric_name = 'likes') AS likes,
        sumIf(metric_value, metric_name = 'saved') AS saved,
        sumIf(metric_value, metric_name = 'shares') AS shares,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
GROUP BY m.media_product_type, m.media_type
ORDER BY avg_reach DESC
```

### New Backend Endpoint

```
GET /api/instagram/insights/format-breakdown?days=90
```

### Schema Changes Required
None — all data already exists in `instagram_media` + `media_insights`.

### API Modifications Required
None.

---

## Feature 2: Best Time to Post (Personalized)

### What It Does
Generates a personalized engagement-by-hour heatmap based on when the creator's posts perform best, cross-tabulated by format.

### Graph API Requirements

> [!TIP]
> **No new API calls needed.** Computed entirely from `instagram_media.timestamp` + `media_insights` metrics.

The post timestamp is already stored in `instagram_media.timestamp`. Combined with per-post engagement metrics from `media_insights`, you can compute:

1. **Engagement by hour-of-day** (0–23)
2. **Engagement by day-of-week** (Mon–Sun)
3. **Cross-tabulation with format** (best Reel time vs best Carousel time)

### Implementation: New ClickHouse Queries

```sql
-- BEST TIME: Engagement heatmap by day-of-week × hour-of-day
SELECT
    toDayOfWeek(m.timestamp) AS day_of_week,   -- 1=Monday ... 7=Sunday
    toHour(m.timestamp) AS hour_of_day,
    count(DISTINCT m.ig_media_id) AS sample_size,
    avg(metrics.total_interactions) AS avg_interactions,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) AS avg_engagement_rate
FROM instagram_media m FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
GROUP BY day_of_week, hour_of_day
HAVING sample_size >= {min_sample:UInt32}  -- confidence threshold
ORDER BY avg_engagement_rate DESC
```

```sql
-- BEST TIME BY FORMAT: Split by media_product_type
SELECT
    m.media_product_type,
    toDayOfWeek(m.timestamp) AS day_of_week,
    toHour(m.timestamp) AS hour_of_day,
    count(DISTINCT m.ig_media_id) AS sample_size,
    avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) AS avg_engagement_rate
FROM instagram_media m FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
GROUP BY m.media_product_type, day_of_week, hour_of_day
HAVING sample_size >= 2
ORDER BY m.media_product_type, avg_engagement_rate DESC
```

> [!WARNING]
> **Timezone consideration:** `instagram_media.timestamp` is stored as UTC `DateTime`. For "best time to post" to be useful, you need the creator's local timezone. Consider adding a `timezone` field to `instagram_profiles` or `users` table and converting with `toTimezone(m.timestamp, {tz:String})`.

### New Backend Endpoint

```
GET /api/instagram/insights/best-time?days=90&min_sample=3&format=ALL
```

### Schema Changes Required
- **Optional but recommended:** Add `timezone String DEFAULT 'UTC'` to `users` or `instagram_profiles` table

### API Modifications Required
None.

---

## Feature 3: Save Rate & Share Rate as First-Class Metrics

### What It Does
Surfaces `saved/reach`, `shares/reach`, and a composite "Algorithm Score" as headline dashboard metrics instead of burying them inside post detail views.

### Graph API Requirements

> [!TIP]
> **No new API calls needed.** `saved` and `shares` are already fetched via your `MEDIA_FEED_METRICS` and `MEDIA_REELS_METRICS` constants.

Your current constants already include these:

```python
# constants.py (existing)
MEDIA_FEED_METRICS = "likes,comments,saved,shares,reach,views,total_interactions,profile_visits,reposts"
MEDIA_REELS_METRICS = "likes,comments,saved,shares,reach,views,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reposts"
```

Both `saved` and `shares` are collected and stored in `media_insights`. You just need to surface them.

### Account-Level Save/Share Metrics

The Meta Graph API also exposes **account-level** `saves` and `shares` metrics with `total_value` metric_type:

| Metric | Period | metric_type | Breakdowns |
|--------|--------|-------------|------------|
| `saves` | `day` | `total_value` | `media_product_type` |
| `shares` | `day` | `total_value` | `media_product_type` |

> [!IMPORTANT]
> **You are NOT currently fetching account-level `saves` and `shares`.** Your `ACCOUNT_TIME_SERIES_METRICS` is only `"reach"` and `ACCOUNT_TOTAL_VALUE_METRICS` is only `"views"`. To get daily aggregate save/share counts at the account level, you need to add them.

### Required Modification to `constants.py`

```diff
-ACCOUNT_TOTAL_VALUE_METRICS: str = "views"
+ACCOUNT_TOTAL_VALUE_METRICS: str = "views,saves,shares"
```

Or, since `saves` and `shares` only support `total_value` (not `time_series`), add them to the batch request in `service.py` line 387:

```diff
-rel_url = f"{ig_user_id}/insights?metric=follows_and_unfollows,total_interactions,accounts_engaged&period=day&metric_type=total_value&since=..."
+rel_url = f"{ig_user_id}/insights?metric=follows_and_unfollows,total_interactions,accounts_engaged,saves,shares&period=day&metric_type=total_value&since=..."
```

### Implementation: New ClickHouse Queries

```sql
-- SAVE/SHARE RATE per post (for dashboard tiles)
SELECT
    m.ig_media_id,
    m.media_product_type,
    m.permalink,
    m.caption,
    metrics.saved,
    metrics.shares,
    metrics.reach,
    if(metrics.reach > 0, metrics.saved / metrics.reach, 0) AS save_rate,
    if(metrics.reach > 0, metrics.shares / metrics.reach, 0) AS share_rate,
    -- Composite Algorithm Score (weighted blend)
    if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35 + metrics.likes * 0.15 + metrics.comments * 0.10) / metrics.reach,
        0
    ) AS algorithm_score
FROM instagram_media m FINAL
INNER JOIN (
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'saved') AS saved,
        sumIf(metric_value, metric_name = 'shares') AS shares,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'likes') AS likes,
        sumIf(metric_value, metric_name = 'comments') AS comments
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
ORDER BY algorithm_score DESC
```

```sql
-- ACCOUNT-LEVEL aggregate save/share rate
SELECT
    sumIf(metric_value, metric_name = 'saves') AS total_saves,
    sumIf(metric_value, metric_name = 'shares') AS total_shares,
    sumIf(metric_value, metric_name = 'reach') AS total_reach,
    if(total_reach > 0, total_saves / total_reach, 0) AS account_save_rate,
    if(total_reach > 0, total_shares / total_reach, 0) AS account_share_rate
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND end_time >= {since:DateTime}
```

### New Backend Endpoints

```
GET /api/instagram/insights/algorithm-metrics?days=30
GET /api/instagram/insights/algorithm-metrics/posts?days=30&sort_by=algorithm_score&limit=20
```

### Schema Changes Required
None for DB schema. Add `saves` and `shares` to account-level sync constants.

### API Modifications Required

| File | Change |
|------|--------|
| [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py) | Add `saves,shares` to batch request metrics |
| [service.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/service.py#L387) | Update batch URL at line 387 to include `saves,shares` |

---

*Continued in Part 2 → Features 4 (Reels Retention) and 5 (Follower Quality Score), plus the full modification checklist and implementation plan.*
