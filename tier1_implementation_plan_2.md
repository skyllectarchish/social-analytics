# Tier 1 Implementation Plan — Part 2
## Features 4–5 + API Docs + Master Checklist

---

## Phase 4: Feature 4 — Reels Retention & Drop-Off Analysis
> **Effort: ~5 days** | **Dependencies: Phase 0 Task 0.2 (reels_skip_rate in sync)**

### Task 4.1 — Add SQL Queries

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

```python
GET_REELS_RETENTION = """
SELECT
    m.ig_media_id,
    m.permalink,
    substring(m.caption, 1, 100) AS caption_preview,
    m.timestamp,
    round(metrics.avg_watch_time, 2) AS avg_watch_time,
    round(metrics.total_view_time, 0) AS total_view_time,
    metrics.reach,
    metrics.views,
    round(metrics.skip_rate, 2) AS skip_rate,
    round(if(metrics.views > 0,
        metrics.total_view_time / metrics.views / 1000, 0
    ), 2) AS estimated_avg_duration_sec,
    round(if(metrics.skip_rate > 0, 100 - metrics.skip_rate, 100), 1) AS hook_strength_pct,
    round(if(metrics.reach > 0 AND metrics.avg_watch_time > 0,
        greatest((metrics.total_view_time / 1000) / (metrics.avg_watch_time * metrics.reach) - 1, 0),
        0
    ), 3) AS estimated_replay_rate
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.media_product_type = 'REELS'
  AND m.timestamp >= {since:DateTime}
ORDER BY hook_strength_pct DESC
LIMIT {limit:UInt32}
"""

GET_REELS_RETENTION_TREND = """
SELECT
    toStartOfWeek(m.timestamp) AS week_start,
    count(DISTINCT m.ig_media_id) AS reels_count,
    round(avg(if(metrics.skip_rate > 0, 100 - metrics.skip_rate, 100)), 1) AS avg_hook_strength_pct,
    round(avg(metrics.avg_watch_time), 2) AS avg_watch_time_sec,
    round(avg(metrics.reach), 0) AS avg_reach,
    round(avg(metrics.views), 0) AS avg_views
FROM instagram_media m FINAL
INNER JOIN (
    """ + PIVOTED_MEDIA_METRICS + """
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.media_product_type = 'REELS'
  AND m.timestamp >= {since:DateTime}
GROUP BY week_start
ORDER BY week_start ASC
"""
```

### Task 4.2 — Add Pydantic Schemas

**File:** [schemas.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/schemas.py) — Append

```python
class ReelRetentionItem(BaseModel):
    """Retention metrics for a single Reel."""
    ig_media_id: str
    permalink: str
    caption_preview: str
    timestamp: str
    avg_watch_time: float
    total_view_time: float
    reach: float
    views: float
    skip_rate: float
    estimated_avg_duration_sec: float
    hook_strength_pct: float
    estimated_replay_rate: float


class ReelsRetentionResponse(BaseModel):
    """Response for GET /insights/reels-retention."""
    period_days: int
    reels: list[ReelRetentionItem]


class ReelsTrendPoint(BaseModel):
    """Weekly aggregated Reels retention trend."""
    week_start: str
    reels_count: int
    avg_hook_strength_pct: float
    avg_watch_time_sec: float
    avg_reach: float
    avg_views: float


class ReelsTrendResponse(BaseModel):
    """Response for GET /insights/reels-retention/trend."""
    period_days: int
    trend: list[ReelsTrendPoint]
```

### Task 4.3 — Add Repository Methods

**File:** [insights_repo.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/insights_repo.py) — Append

```python
from ..models.queries import GET_REELS_RETENTION, GET_REELS_RETENTION_TREND

def find_reels_retention(
    client: Client,
    user_id: str,
    since: datetime,
    limit: int = 50,
) -> list[tuple]:
    """Fetch per-Reel retention metrics."""
    return client.query(
        GET_REELS_RETENTION,
        parameters={"user_id": user_id, "since": since, "limit": limit},
    ).result_rows


def find_reels_retention_trend(
    client: Client,
    user_id: str,
    since: datetime,
) -> list[tuple]:
    """Fetch weekly Reels retention trend."""
    return client.query(
        GET_REELS_RETENTION_TREND,
        parameters={"user_id": user_id, "since": since},
    ).result_rows
```

### Task 4.4 — Add Router Endpoints

**File:** [router.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/router.py) — Append

```python
@router.get("/insights/reels-retention", response_model=ReelsRetentionResponse)
def get_reels_retention(
    days: int = Query(90, ge=7, le=365),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Return per-Reel retention, hook strength, and replay metrics."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_reels_retention(client, user_id, since, limit)

    reels = [
        ReelRetentionItem(
            ig_media_id=r[0], permalink=r[1], caption_preview=r[2] or "",
            timestamp=str(r[3]), avg_watch_time=float(r[4]),
            total_view_time=float(r[5]), reach=float(r[6]), views=float(r[7]),
            skip_rate=float(r[8]), estimated_avg_duration_sec=float(r[9]),
            hook_strength_pct=float(r[10]), estimated_replay_rate=float(r[11]),
        )
        for r in rows
    ]
    return ReelsRetentionResponse(period_days=days, reels=reels)


@router.get("/insights/reels-retention/trend", response_model=ReelsTrendResponse)
def get_reels_retention_trend(
    days: int = Query(180, ge=30, le=730),
    current_user: User = Depends(get_current_user),
):
    """Return weekly Reels hook strength trend over time."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_reels_retention_trend(client, user_id, since)

    trend = [
        ReelsTrendPoint(
            week_start=str(r[0]), reels_count=int(r[1]),
            avg_hook_strength_pct=float(r[2]), avg_watch_time_sec=float(r[3]),
            avg_reach=float(r[4]), avg_views=float(r[5]),
        )
        for r in rows
    ]
    return ReelsTrendResponse(period_days=days, trend=trend)
```

### Task 4.5 — Test

```bash
curl http://localhost:8000/api/instagram/insights/reels-retention?days=90&limit=10 \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:8000/api/instagram/insights/reels-retention/trend?days=180 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Phase 5: Feature 5 — Follower Quality Score
> **Effort: ~3 days** | **Dependencies: None (uses existing demographic data)**

### Task 5.1 — Add SQL Queries

**File:** [queries.py](file:///c:/laragon/www/social-analytics/backend/app/models/queries.py) — Append

```python
GET_FOLLOWER_QUALITY_BY_COHORT = """
SELECT
    f.dimension_key,
    f.dimension_value,
    f.metric_value AS follower_count,
    coalesce(e.metric_value, 0) AS engaged_count,
    round(if(f.metric_value > 0,
        coalesce(e.metric_value, 0) / f.metric_value * 100, 0
    ), 1) AS engagement_rate_pct,
    multiIf(
        engagement_rate_pct >= 50, 'HIGH',
        engagement_rate_pct >= 20, 'MEDIUM',
        engagement_rate_pct >= 5,  'LOW',
        'DORMANT'
    ) AS quality_tier
FROM demographic_insights f FINAL
LEFT JOIN demographic_insights e FINAL
    ON f.user_id = e.user_id
    AND f.ig_user_id = e.ig_user_id
    AND f.dimension_key = e.dimension_key
    AND f.dimension_value = e.dimension_value
    AND e.metric_name = 'engaged_audience_demographics'
WHERE f.user_id = {user_id:UUID}
  AND f.ig_user_id = {ig_user_id:String}
  AND f.metric_name = 'follower_demographics'
  AND f.dimension_key = {breakdown:String}
ORDER BY f.metric_value DESC
"""

GET_FOLLOWER_QUALITY_SUMMARY = """
SELECT
    count() AS total_cohorts,
    sum(follower_count) AS total_followers_tracked,
    sum(engaged_count) AS total_engaged_tracked,
    round(if(total_followers_tracked > 0,
        total_engaged_tracked / total_followers_tracked * 100, 0
    ), 1) AS overall_quality_pct,
    countIf(quality_tier = 'HIGH') AS high_quality_cohorts,
    countIf(quality_tier = 'MEDIUM') AS medium_quality_cohorts,
    countIf(quality_tier = 'LOW') AS low_quality_cohorts,
    countIf(quality_tier = 'DORMANT') AS dormant_cohorts
FROM (
    SELECT
        f.dimension_value,
        f.metric_value AS follower_count,
        coalesce(e.metric_value, 0) AS engaged_count,
        if(f.metric_value > 0, coalesce(e.metric_value, 0) / f.metric_value * 100, 0) AS rate,
        multiIf(rate >= 50, 'HIGH', rate >= 20, 'MEDIUM', rate >= 5, 'LOW', 'DORMANT') AS quality_tier
    FROM demographic_insights f FINAL
    LEFT JOIN demographic_insights e FINAL
        ON f.user_id = e.user_id AND f.ig_user_id = e.ig_user_id
        AND f.dimension_key = e.dimension_key AND f.dimension_value = e.dimension_value
        AND e.metric_name = 'engaged_audience_demographics'
    WHERE f.user_id = {user_id:UUID}
      AND f.ig_user_id = {ig_user_id:String}
      AND f.metric_name = 'follower_demographics'
      AND f.dimension_key = {breakdown:String}
)
"""

GET_FOLLOWER_SPIKES = """
SELECT
    ai.end_time AS spike_date,
    toInt64(ai.metric_value) AS follows_change,
    toInt64(coalesce(ei.metric_value, 0)) AS interactions,
    round(if(abs(ai.metric_value) > 0,
        coalesce(ei.metric_value, 0) / abs(ai.metric_value), 0
    ), 2) AS interaction_per_follow_ratio,
    if(ai.metric_value > {spike_threshold:Int64}
       AND interaction_per_follow_ratio < 1.0, 1, 0) AS is_suspicious
FROM account_insights ai FINAL
LEFT JOIN account_insights ei FINAL
    ON ai.user_id = ei.user_id AND ai.ig_user_id = ei.ig_user_id
    AND ai.end_time = ei.end_time AND ei.metric_name = 'total_interactions'
WHERE ai.user_id = {user_id:UUID}
  AND ai.ig_user_id = {ig_user_id:String}
  AND ai.metric_name = 'follows_and_unfollows'
  AND ai.end_time >= {since:DateTime}
  AND abs(ai.metric_value) > 0
ORDER BY abs(ai.metric_value) DESC
LIMIT 30
"""
```

### Task 5.2 — Add Pydantic Schemas

**File:** [schemas.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/schemas.py) — Append

```python
class FollowerQualityCohort(BaseModel):
    """Quality score for a single demographic cohort."""
    dimension_key: str       # "age", "gender", "city", "country"
    dimension_value: str     # "25-34", "F", "Mumbai", "IN"
    follower_count: int
    engaged_count: int
    engagement_rate_pct: float
    quality_tier: str        # HIGH, MEDIUM, LOW, DORMANT


class FollowerQualityResponse(BaseModel):
    """Response for GET /insights/follower-quality."""
    breakdown: str
    cohorts: list[FollowerQualityCohort]


class FollowerQualitySummary(BaseModel):
    """Response for GET /insights/follower-quality/summary."""
    breakdown: str
    total_cohorts: int
    total_followers_tracked: int
    total_engaged_tracked: int
    overall_quality_pct: float
    high_quality_cohorts: int
    medium_quality_cohorts: int
    low_quality_cohorts: int
    dormant_cohorts: int


class FollowerSpike(BaseModel):
    """A single follower growth spike event."""
    spike_date: str
    follows_change: int
    interactions: int
    interaction_per_follow_ratio: float
    is_suspicious: bool


class FollowerSpikesResponse(BaseModel):
    """Response for GET /insights/follower-quality/spikes."""
    period_days: int
    spike_threshold: int
    spikes: list[FollowerSpike]
```

### Task 5.3 — Add Repository Methods

**File:** [insights_repo.py](file:///c:/laragon/www/social-analytics/backend/app/repositories/insights_repo.py) — Append

```python
from ..models.queries import (
    GET_FOLLOWER_QUALITY_BY_COHORT,
    GET_FOLLOWER_QUALITY_SUMMARY,
    GET_FOLLOWER_SPIKES,
)

def find_follower_quality(
    client: Client, user_id: str, ig_user_id: str, breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_BY_COHORT,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows

def find_follower_quality_summary(
    client: Client, user_id: str, ig_user_id: str, breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_SUMMARY,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows

def find_follower_spikes(
    client: Client, user_id: str, ig_user_id: str,
    since: datetime, spike_threshold: int,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_SPIKES,
        parameters={
            "user_id": user_id, "ig_user_id": ig_user_id,
            "since": since, "spike_threshold": spike_threshold,
        },
    ).result_rows
```

### Task 5.4 — Add Router Endpoints

**File:** [router.py](file:///c:/laragon/www/social-analytics/backend/app/instagram/router.py) — Append

```python
@router.get("/insights/follower-quality", response_model=FollowerQualityResponse)
def get_follower_quality(
    breakdown: Literal["age", "gender", "city", "country"] = Query("age"),
    current_user: User = Depends(get_current_user),
):
    """Return per-cohort follower quality scores."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    rows = insights_repo.find_follower_quality(
        client, user_id, ig_profile.ig_user_id, breakdown,
    )
    cohorts = [
        FollowerQualityCohort(
            dimension_key=r[0], dimension_value=r[1],
            follower_count=int(r[2]), engaged_count=int(r[3]),
            engagement_rate_pct=float(r[4]), quality_tier=r[5],
        )
        for r in rows
    ]
    return FollowerQualityResponse(breakdown=breakdown, cohorts=cohorts)


@router.get("/insights/follower-quality/summary", response_model=FollowerQualitySummary)
def get_follower_quality_summary(
    breakdown: Literal["age", "gender", "city", "country"] = Query("age"),
    current_user: User = Depends(get_current_user),
):
    """Return overall follower quality summary."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    rows = insights_repo.find_follower_quality_summary(
        client, user_id, ig_profile.ig_user_id, breakdown,
    )
    r = rows[0] if rows else (0, 0, 0, 0, 0, 0, 0, 0)
    return FollowerQualitySummary(
        breakdown=breakdown,
        total_cohorts=int(r[0]), total_followers_tracked=int(r[1]),
        total_engaged_tracked=int(r[2]), overall_quality_pct=float(r[3]),
        high_quality_cohorts=int(r[4]), medium_quality_cohorts=int(r[5]),
        low_quality_cohorts=int(r[6]), dormant_cohorts=int(r[7]),
    )


@router.get("/insights/follower-quality/spikes", response_model=FollowerSpikesResponse)
def get_follower_spikes(
    days: int = Query(90, ge=7, le=365),
    threshold: int = Query(50, ge=5, le=10000),
    current_user: User = Depends(get_current_user),
):
    """Return follower growth spikes flagged for suspicious activity."""
    client = get_client()
    user_id = str(current_user.id)
    ig_profile = instagram_repo.find_profile(client, user_id)
    if ig_profile is None:
        raise InstagramNotConnectedError()

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    rows = insights_repo.find_follower_spikes(
        client, user_id, ig_profile.ig_user_id, since, threshold,
    )
    spikes = [
        FollowerSpike(
            spike_date=str(r[0]), follows_change=int(r[1]),
            interactions=int(r[2]), interaction_per_follow_ratio=float(r[3]),
            is_suspicious=bool(r[4]),
        )
        for r in rows
    ]
    return FollowerSpikesResponse(
        period_days=days, spike_threshold=threshold, spikes=spikes,
    )
```

### Task 5.5 — Test

```bash
curl "http://localhost:8000/api/instagram/insights/follower-quality?breakdown=age" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8000/api/instagram/insights/follower-quality/summary?breakdown=age" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8000/api/instagram/insights/follower-quality/spikes?days=90&threshold=50" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Phase 7: Drill-Down APIs (for FE interactive charts)
> **Effort: ~2 days** | **Dependencies: Phases 1 and 3 complete**

These endpoints power the drill-down interactions in the frontend charts.

### Task 7.1 — Format Breakdown Drill-Down

When a user clicks a format bar in the Content Lab chart, show posts filtered by that format.

**New endpoint:** `GET /api/instagram/insights/format-breakdown/posts?format=REELS&days=90&limit=20`

**Add to queries.py:**
```python
GET_FORMAT_BREAKDOWN_POSTS = """
SELECT
    m.ig_media_id, m.media_product_type, m.media_type,
    m.permalink, m.thumbnail_url,
    substring(m.caption, 1, 100) AS caption_preview,
    m.timestamp,
    metrics.reach, metrics.likes, metrics.saved, metrics.shares,
    round(if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35 + metrics.likes * 0.15 + metrics.comments * 0.10)
        / metrics.reach * 100, 0), 2) AS algorithm_score_pct
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type = {format:String}
ORDER BY algorithm_score_pct DESC
LIMIT {limit:UInt32}
"""
```

**Add to schemas.py:**
```python
class FormatBreakdownPost(BaseModel):
    ig_media_id: str
    media_product_type: str
    media_type: str
    permalink: str
    thumbnail_url: str | None
    caption_preview: str
    timestamp: str
    reach: float
    likes: float
    saved: float
    shares: float
    algorithm_score_pct: float

class FormatBreakdownPostsResponse(BaseModel):
    format: str
    period_days: int
    posts: list[FormatBreakdownPost]
```

**Add to router.py:** `GET /insights/format-breakdown/posts`

### Task 7.2 — Best Time Drill-Down

When a user clicks a heatmap cell, show posts from that day/hour slot.

**New endpoint:** `GET /api/instagram/insights/best-time/posts?day=3&hour=14&days=90`

**Add to queries.py:**
```python
GET_BEST_TIME_POSTS = """
SELECT
    m.ig_media_id, m.media_product_type, m.permalink, m.thumbnail_url,
    substring(m.caption, 1, 100) AS caption_preview, m.timestamp,
    metrics.reach, metrics.total_interactions,
    round(if(metrics.reach > 0, metrics.total_interactions / metrics.reach * 100, 0), 2) AS engagement_rate_pct
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.timestamp >= {since:DateTime}
  AND toDayOfWeek(m.timestamp) = {day_of_week:UInt8}
  AND toHour(m.timestamp) = {hour_of_day:UInt8}
ORDER BY engagement_rate_pct DESC
LIMIT 20
"""
```

**Add to schemas.py:**
```python
class BestTimePost(BaseModel):
    ig_media_id: str
    media_product_type: str
    permalink: str
    thumbnail_url: str | None
    caption_preview: str
    timestamp: str
    reach: float
    total_interactions: float
    engagement_rate_pct: float

class BestTimePostsResponse(BaseModel):
    day_of_week: int
    hour_of_day: int
    period_days: int
    posts: list[BestTimePost]
```

**Add to router.py:** `GET /insights/best-time/posts`

---

## Phase 6: Update API Documentation

**File:** Create `backend/API_DOCUMENTATION/tier1_insights.md`

Document all 11 endpoints:

| # | Endpoint | Method | Description |
|---|----------|--------|-------------|
| 1 | `/api/instagram/insights/format-breakdown` | GET | Content format performance comparison |
| 2 | `/api/instagram/insights/format-breakdown/posts` | GET | Drill-down: posts for a specific format |
| 3 | `/api/instagram/insights/algorithm-metrics` | GET | Account-level save/share/algorithm summary |
| 4 | `/api/instagram/insights/algorithm-metrics/posts` | GET | Per-post algorithm scores ranked |
| 5 | `/api/instagram/insights/best-time` | GET | Personalized best-time heatmap |
| 6 | `/api/instagram/insights/best-time/posts` | GET | Drill-down: posts from a specific time slot |
| 7 | `/api/instagram/insights/reels-retention` | GET | Per-Reel retention & hook metrics |
| 8 | `/api/instagram/insights/reels-retention/trend` | GET | Weekly Reels hook strength trend |
| 9 | `/api/instagram/insights/follower-quality` | GET | Per-cohort follower quality scores |
| 10 | `/api/instagram/insights/follower-quality/summary` | GET | Overall follower quality score |
| 11 | `/api/instagram/insights/follower-quality/spikes` | GET | Suspicious follower growth spikes |

---

## Master Checklist — All Phases

### Phase 0: Foundation
| Task | File | Description | Status |
|------|------|-------------|--------|
| 0.1 | `service.py` | Add `saves,shares` to batch sync URL + parsing | ⬜ |
| 0.2 | `constants.py` | Add `reels_skip_rate` to `MEDIA_REELS_METRICS` | ⬜ |
| 0.3 | `queries.py` | Add `PIVOTED_MEDIA_METRICS` shared helper | ⬜ |

### Phase 1: Format Breakdown
| Task | File | Description | Status |
|------|------|-------------|--------|
| 1.1 | `queries.py` | Add `GET_FORMAT_BREAKDOWN` query | ⬜ |
| 1.2 | `schemas.py` | Add `FormatBreakdownItem`, `FormatBreakdownResponse` | ⬜ |
| 1.3 | `insights_repo.py` | Add `find_format_breakdown()` | ⬜ |
| 1.4 | `router.py` | Add `GET /insights/format-breakdown` | ⬜ |
| 1.5 | — | Test endpoint | ⬜ |

### Phase 2: Save/Share Rate
| Task | File | Description | Status |
|------|------|-------------|--------|
| 2.1 | `queries.py` | Add `GET_ALGORITHM_METRICS_*` queries | ⬜ |
| 2.2 | `schemas.py` | Add `AlgorithmMetrics*` schemas | ⬜ |
| 2.3 | `insights_repo.py` + `router.py` | Add repo methods + 2 endpoints | ⬜ |
| 2.4 | — | Test endpoints | ⬜ |

### Phase 3: Best Time to Post
| Task | File | Description | Status |
|------|------|-------------|--------|
| 3.1 | `queries.py` | Add `GET_BEST_TIME_*` queries | ⬜ |
| 3.2 | `schemas.py` | Add `BestTime*` schemas | ⬜ |
| 3.3 | `router.py` | Add `GET /insights/best-time` | ⬜ |
| 3.4 | migration | Optional: add `timezone` column | ⬜ |
| 3.5 | — | Test endpoint | ⬜ |

### Phase 4: Reels Retention
| Task | File | Description | Status |
|------|------|-------------|--------|
| 4.1 | `queries.py` | Add `GET_REELS_RETENTION*` queries | ⬜ |
| 4.2 | `schemas.py` | Add `ReelRetention*`, `ReelsTrend*` schemas | ⬜ |
| 4.3 | `insights_repo.py` | Add `find_reels_retention*()` methods | ⬜ |
| 4.4 | `router.py` | Add 2 reels-retention endpoints | ⬜ |
| 4.5 | — | Test endpoints | ⬜ |

### Phase 5: Follower Quality
| Task | File | Description | Status |
|------|------|-------------|--------|
| 5.1 | `queries.py` | Add `GET_FOLLOWER_QUALITY_*` + `GET_FOLLOWER_SPIKES` | ⬜ |
| 5.2 | `schemas.py` | Add `FollowerQuality*`, `FollowerSpike*` schemas | ⬜ |
| 5.3 | `insights_repo.py` | Add 3 follower quality repo methods | ⬜ |
| 5.4 | `router.py` | Add 3 follower quality endpoints | ⬜ |
| 5.5 | — | Test endpoints | ⬜ |

### Phase 7: Drill-Down APIs
| Task | File | Description | Status |
|------|------|-------------|--------|
| 7.1 | `queries.py` + `schemas.py` + `router.py` | Format breakdown drill-down endpoint | ⬜ |
| 7.2 | `queries.py` + `schemas.py` + `router.py` | Best-time drill-down endpoint | ⬜ |

### Phase 6: Documentation
| Task | File | Description | Status |
|------|------|-------------|--------|
| 6.1 | `API_DOCUMENTATION/tier1_insights.md` | Document all 11 endpoints | ⬜ |

---

## File Change Summary

| File | Lines Added (est.) | Changes |
|------|-------------------|---------|
| `constants.py` | ~3 | Add `reels_skip_rate` |
| `service.py` | ~15 | Add `saves,shares` to batch sync |
| `queries.py` | ~150 | 1 shared helper + 10 queries (incl. 2 drill-down) |
| `schemas.py` | ~150 | 16 Pydantic models (incl. 4 drill-down) |
| `insights_repo.py` | ~75 | 9 repository methods (incl. 2 drill-down) |
| `router.py` | ~220 | 11 endpoint handlers (incl. 2 drill-down) |
| **Total** | **~615 lines** | Across 6 existing files |

No new files required — everything fits cleanly into the existing module structure.
