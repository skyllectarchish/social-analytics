# Tier 1 Implementation Plan — Part 1
## Foundation Layer + Features 1–3

---

## Phase 0: Foundation — Data Sync Modifications
> **Effort: ~0.5 days** | **Must be done before any feature work**

### Task 0.1 — Add `saves,shares` to Account-Level Batch Sync

**File:** [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py)

**Action:** No constant change needed — the batch request URL is built inline in `service.py`.

**File:** [service.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/service.py) — Line 387

```diff
-rel_url = f"{ig_user_id}/insights?metric=follows_and_unfollows,total_interactions,accounts_engaged&period=day&metric_type=total_value&since={int(current_dt.timestamp())}&until={int(next_dt.timestamp())}"
+rel_url = f"{ig_user_id}/insights?metric=follows_and_unfollows,total_interactions,accounts_engaged,saves,shares&period=day&metric_type=total_value&since={int(current_dt.timestamp())}&until={int(next_dt.timestamp())}"
```

**Also update** the result-parsing block (lines 408–416) to handle the new metric names:

```diff
 for entry in data:
     total = entry.get("total_value", {}).get("value", 0)
     name = entry.get("name", "")
     if name == "follows_and_unfollows":
         all_follows_values.append({"value": total, "end_time": end_time_iso})
     elif name == "total_interactions":
         all_total_interactions_values.append({"value": total, "end_time": end_time_iso})
     elif name == "accounts_engaged":
         all_accounts_engaged_values.append({"value": total, "end_time": end_time_iso})
+    elif name == "saves":
+        all_saves_values.append({"value": total, "end_time": end_time_iso})
+    elif name == "shares":
+        all_shares_values.append({"value": total, "end_time": end_time_iso})
```

**Initialize** the new lists at line ~378:
```diff
 all_follows_values = []
 all_total_interactions_values = []
 all_accounts_engaged_values = []
+all_saves_values = []
+all_shares_values = []
```

**Append** results at line ~422:
```diff
 if all_accounts_engaged_values:
     results.append({"name": "accounts_engaged", "values": all_accounts_engaged_values})
+if all_saves_values:
+    results.append({"name": "saves", "values": all_saves_values})
+if all_shares_values:
+    results.append({"name": "shares", "values": all_shares_values})
```

**Verification:** Trigger a sync via `POST /api/instagram/insights/sync`, then query:
```sql
SELECT DISTINCT metric_name FROM account_insights FINAL
WHERE user_id = '{user_id}' ORDER BY metric_name
```
Expected: should now include `saves` and `shares`.

---

### Task 0.2 — Add `reels_skip_rate` to Reels Metrics

**File:** [constants.py](file:///c:/laragon/www/social-analytics/backend/app/constants.py) — Line 63

```diff
 MEDIA_REELS_METRICS: str = (
     "likes,comments,saved,shares,reach,views,total_interactions,"
-    "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reposts"
+    "ig_reels_avg_watch_time,ig_reels_video_view_total_time,reposts,"
+    "reels_skip_rate"
 )
```

**Verification:** Trigger sync, then:
```sql
SELECT DISTINCT metric_name FROM media_insights FINAL
WHERE user_id = '{user_id}'
  AND ig_media_id IN (SELECT ig_media_id FROM instagram_media FINAL WHERE media_product_type = 'REELS' LIMIT 1)
```
Expected: should now include `reels_skip_rate`.

---

### Task 0.3 — Create Shared Metrics Subquery Helper

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

Add a reusable CTE-style subquery that pivots `media_insights` into per-media columns. This avoids repeating the same `sumIf` pattern in every feature query:

```python
# Pivoted media metrics — used as subquery across Tier 1 features
PIVOTED_MEDIA_METRICS = """
    SELECT ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'views') AS views,
        sumIf(metric_value, metric_name = 'likes') AS likes,
        sumIf(metric_value, metric_name = 'comments') AS comments,
        sumIf(metric_value, metric_name = 'saved') AS saved,
        sumIf(metric_value, metric_name = 'shares') AS shares,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions,
        sumIf(metric_value, metric_name = 'ig_reels_avg_watch_time') AS avg_watch_time,
        sumIf(metric_value, metric_name = 'ig_reels_video_view_total_time') AS total_view_time,
        sumIf(metric_value, metric_name = 'reels_skip_rate') AS skip_rate
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
"""
```

---

## Phase 1: Feature 1 — Content-Format Performance Breakdown
> **Effort: ~3 days** | **Dependencies: Phase 0 complete**

### Task 1.1 — Add SQL Queries

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

```python
GET_FORMAT_BREAKDOWN = """
SELECT
    m.media_product_type,
    m.media_type,
    count(DISTINCT m.ig_media_id) AS post_count,
    round(avg(metrics.reach), 1) AS avg_reach,
    round(avg(metrics.views), 1) AS avg_views,
    round(avg(metrics.likes), 1) AS avg_likes,
    round(avg(metrics.saved), 1) AS avg_saves,
    round(avg(metrics.shares), 1) AS avg_shares,
    round(avg(metrics.total_interactions), 1) AS avg_interactions,
    round(avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_engagement_rate_pct,
    round(avgIf(metrics.saved / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_save_rate_pct,
    round(avgIf(metrics.shares / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_share_rate_pct,
    -- Variance (consistency) of engagement rate
    round(varPopIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) * 10000, 2) AS engagement_rate_variance
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type != ''
GROUP BY m.media_product_type, m.media_type
ORDER BY avg_reach DESC
"""
```

### Task 1.2 — Add Pydantic Response Schemas

**File:** [schemas.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/schemas.py) — Append

```python
class FormatBreakdownItem(BaseModel):
    """Performance metrics for a single content format."""
    media_product_type: str        # FEED, REELS, STORY
    media_type: str                # IMAGE, VIDEO, CAROUSEL_ALBUM
    post_count: int
    avg_reach: float
    avg_views: float
    avg_likes: float
    avg_saves: float
    avg_shares: float
    avg_interactions: float
    avg_engagement_rate_pct: float
    avg_save_rate_pct: float
    avg_share_rate_pct: float
    engagement_rate_variance: float


class FormatBreakdownResponse(BaseModel):
    """Response for GET /api/instagram/insights/format-breakdown."""
    period_days: int
    formats: list[FormatBreakdownItem]
```

### Task 1.3 — Add Repository Method

**File:** [insights_repo.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/insights_repo.py) — Append

```python
from ..models.queries import GET_FORMAT_BREAKDOWN

def find_format_breakdown(
    client: Client,
    user_id: str,
    since: datetime,
) -> list[tuple]:
    """Fetch format performance breakdown."""
    rows = client.query(
        GET_FORMAT_BREAKDOWN,
        parameters={"user_id": user_id, "since": since},
    )
    return rows.result_rows
```

### Task 1.4 — Add Router Endpoint

**File:** [router.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/router.py) — Append

```python
@router.get("/insights/format-breakdown", response_model=FormatBreakdownResponse)
def get_format_breakdown(
    days: int = Query(90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
):
    """Return content format performance comparison."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_format_breakdown(client, user_id, since)

    formats = [
        FormatBreakdownItem(
            media_product_type=r[0], media_type=r[1], post_count=int(r[2]),
            avg_reach=float(r[3]), avg_views=float(r[4]), avg_likes=float(r[5]),
            avg_saves=float(r[6]), avg_shares=float(r[7]), avg_interactions=float(r[8]),
            avg_engagement_rate_pct=float(r[9]), avg_save_rate_pct=float(r[10]),
            avg_share_rate_pct=float(r[11]), engagement_rate_variance=float(r[12]),
        )
        for r in rows
    ]
    return FormatBreakdownResponse(period_days=days, formats=formats)
```

### Task 1.5 — Test

```bash
# Trigger sync first
curl -X POST http://localhost:8000/api/instagram/insights/sync -H "Authorization: Bearer $TOKEN"

# Wait ~30s, then:
curl http://localhost:8000/api/instagram/insights/format-breakdown?days=90 -H "Authorization: Bearer $TOKEN"
```

Expected response shape:
```json
{
  "period_days": 90,
  "formats": [
    {
      "media_product_type": "REELS",
      "media_type": "VIDEO",
      "post_count": 24,
      "avg_reach": 12500.0,
      "avg_engagement_rate_pct": 4.2,
      "avg_save_rate_pct": 2.1,
      "avg_share_rate_pct": 1.8
    }
  ]
}
```

---

## Phase 2: Feature 3 — Save Rate & Share Rate Metrics
> **Effort: ~2 days** | **Dependencies: Phase 0 (saves/shares in sync)**

### Task 2.1 — Add SQL Queries

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

```python
GET_ALGORITHM_METRICS_SUMMARY = """
SELECT
    count(DISTINCT m.ig_media_id) AS total_posts,
    round(avg(metrics.saved), 1) AS avg_saves_per_post,
    round(avg(metrics.shares), 1) AS avg_shares_per_post,
    round(avgIf(metrics.saved / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_save_rate_pct,
    round(avgIf(metrics.shares / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_share_rate_pct,
    round(avgIf(
        (metrics.shares * 0.4 + metrics.saved * 0.35 + metrics.likes * 0.15 + metrics.comments * 0.10) / metrics.reach,
        metrics.reach > 0
    ) * 100, 2) AS avg_algorithm_score_pct
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
"""

GET_ALGORITHM_METRICS_PER_POST = """
SELECT
    m.ig_media_id,
    m.media_product_type,
    m.media_type,
    m.permalink,
    substring(m.caption, 1, 100) AS caption_preview,
    m.timestamp,
    metrics.saved,
    metrics.shares,
    metrics.reach,
    round(if(metrics.reach > 0, metrics.saved / metrics.reach * 100, 0), 2) AS save_rate_pct,
    round(if(metrics.reach > 0, metrics.shares / metrics.reach * 100, 0), 2) AS share_rate_pct,
    round(if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35 + metrics.likes * 0.15 + metrics.comments * 0.10)
        / metrics.reach * 100, 0
    ), 2) AS algorithm_score_pct
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
ORDER BY algorithm_score_pct DESC
LIMIT {limit:UInt32}
"""
```

### Task 2.2 — Add Pydantic Schemas

**File:** [schemas.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/schemas.py) — Append

```python
class AlgorithmMetricsSummary(BaseModel):
    """Account-level save/share/algorithm summary."""
    period_days: int
    total_posts: int
    avg_saves_per_post: float
    avg_shares_per_post: float
    avg_save_rate_pct: float
    avg_share_rate_pct: float
    avg_algorithm_score_pct: float


class AlgorithmMetricsPost(BaseModel):
    """Per-post algorithm metrics."""
    ig_media_id: str
    media_product_type: str
    media_type: str
    permalink: str
    caption_preview: str
    timestamp: str
    saved: float
    shares: float
    reach: float
    save_rate_pct: float
    share_rate_pct: float
    algorithm_score_pct: float


class AlgorithmMetricsPostsResponse(BaseModel):
    """Response for algorithm-metrics/posts endpoint."""
    period_days: int
    posts: list[AlgorithmMetricsPost]
```

### Task 2.3 — Add Repository Methods & Router Endpoints

Follow the same pattern as Task 1.3/1.4:
- `insights_repo.find_algorithm_summary(client, user_id, since)`
- `insights_repo.find_algorithm_posts(client, user_id, since, limit)`
- `GET /api/instagram/insights/algorithm-metrics?days=30`
- `GET /api/instagram/insights/algorithm-metrics/posts?days=30&limit=20`

---

## Phase 3: Feature 2 — Best Time to Post
> **Effort: ~4 days** | **Dependencies: Phase 0 complete**

### Task 3.1 — Add SQL Queries

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

```python
GET_BEST_TIME_HEATMAP = """
SELECT
    toDayOfWeek(m.timestamp) AS day_of_week,
    toHour(m.timestamp) AS hour_of_day,
    count(DISTINCT m.ig_media_id) AS sample_size,
    round(avg(metrics.total_interactions), 1) AS avg_interactions,
    round(avg(metrics.reach), 1) AS avg_reach,
    round(avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_engagement_rate_pct
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
GROUP BY day_of_week, hour_of_day
HAVING sample_size >= {min_sample:UInt32}
ORDER BY avg_engagement_rate_pct DESC
"""

GET_BEST_TIME_BY_FORMAT = """
SELECT
    m.media_product_type,
    toDayOfWeek(m.timestamp) AS day_of_week,
    toHour(m.timestamp) AS hour_of_day,
    count(DISTINCT m.ig_media_id) AS sample_size,
    round(avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_engagement_rate_pct
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
GROUP BY m.media_product_type, day_of_week, hour_of_day
HAVING sample_size >= 2
ORDER BY m.media_product_type, avg_engagement_rate_pct DESC
"""
```

### Task 3.2 — Add Pydantic Schemas

```python
class BestTimeSlot(BaseModel):
    """A single day/hour slot with engagement data."""
    day_of_week: int            # 1=Mon ... 7=Sun
    day_name: str               # "Monday", "Tuesday", etc.
    hour_of_day: int            # 0-23
    sample_size: int
    avg_interactions: float
    avg_reach: float
    avg_engagement_rate_pct: float


class BestTimeByFormatSlot(BaseModel):
    """Best time slot broken down by content format."""
    media_product_type: str
    day_of_week: int
    day_name: str
    hour_of_day: int
    sample_size: int
    avg_engagement_rate_pct: float


class BestTimeResponse(BaseModel):
    """Response for best-time endpoint."""
    period_days: int
    min_sample_size: int
    top_slots: list[BestTimeSlot]
    by_format: list[BestTimeByFormatSlot]
```

### Task 3.3 — Add Router Endpoint

```python
DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
             5: "Friday", 6: "Saturday", 7: "Sunday"}

@router.get("/insights/best-time", response_model=BestTimeResponse)
def get_best_time(
    days: int = Query(90, ge=30, le=365),
    min_sample: int = Query(3, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    """Return personalized best-time-to-post heatmap."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    heatmap_rows = client.query(
        GET_BEST_TIME_HEATMAP,
        parameters={"user_id": user_id, "since": since, "min_sample": min_sample},
    ).result_rows

    format_rows = client.query(
        GET_BEST_TIME_BY_FORMAT,
        parameters={"user_id": user_id, "since": since},
    ).result_rows

    top_slots = [
        BestTimeSlot(
            day_of_week=int(r[0]), day_name=DAY_NAMES.get(int(r[0]), ""),
            hour_of_day=int(r[1]), sample_size=int(r[2]),
            avg_interactions=float(r[3]), avg_reach=float(r[4]),
            avg_engagement_rate_pct=float(r[5]),
        )
        for r in heatmap_rows
    ]

    by_format = [
        BestTimeByFormatSlot(
            media_product_type=r[0], day_of_week=int(r[1]),
            day_name=DAY_NAMES.get(int(r[1]), ""),
            hour_of_day=int(r[2]), sample_size=int(r[3]),
            avg_engagement_rate_pct=float(r[4]),
        )
        for r in format_rows
    ]

    return BestTimeResponse(
        period_days=days, min_sample_size=min_sample,
        top_slots=top_slots, by_format=by_format,
    )
```

### Task 3.4 — Optional: Add Timezone Support

**Migration:** `008_add_timezone_to_profiles.sql`
```sql
ALTER TABLE instagram_profiles ADD COLUMN IF NOT EXISTS timezone String DEFAULT 'UTC';
```

**Update queries** to use `toTimezone(m.timestamp, {tz:String})` instead of raw `m.timestamp`.

---

## Completion Checklist — Plan 1

| # | Task | Status |
|---|------|--------|
| 0.1 | Add `saves,shares` to batch sync in `service.py` | ⬜ |
| 0.2 | Add `reels_skip_rate` to `MEDIA_REELS_METRICS` | ⬜ |
| 0.3 | Add `PIVOTED_MEDIA_METRICS` helper to `queries.py` | ⬜ |
| 1.1 | Add `GET_FORMAT_BREAKDOWN` query | ⬜ |
| 1.2 | Add `FormatBreakdown*` schemas | ⬜ |
| 1.3 | Add `find_format_breakdown` repo method | ⬜ |
| 1.4 | Add `/insights/format-breakdown` endpoint | ⬜ |
| 1.5 | Test format breakdown endpoint | ⬜ |
| 2.1 | Add algorithm metrics queries | ⬜ |
| 2.2 | Add `AlgorithmMetrics*` schemas | ⬜ |
| 2.3 | Add algorithm metrics repo + endpoints | ⬜ |
| 3.1 | Add best-time queries | ⬜ |
| 3.2 | Add `BestTime*` schemas | ⬜ |
| 3.3 | Add `/insights/best-time` endpoint | ⬜ |
| 3.4 | Optional: add timezone support | ⬜ |
