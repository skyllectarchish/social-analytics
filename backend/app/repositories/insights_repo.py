"""Insights repository — all ClickHouse operations for insights tables."""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from clickhouse_connect.driver.client import Client

from ..models.account_insight import AccountInsight
from ..models.demographic_insight import DemographicInsight
from ..models.media_insight import MediaInsight
from .safe_query import is_schema_missing as _is_schema_missing, log_schema_missing, safe_call

from ..models.queries import (
    GET_ACCOUNT_INSIGHTS,
    GET_DAILY_METRIC_SAMPLES,
    GET_DAILY_REACH_BY_POST_DAY,
    GET_ALGORITHM_METRICS_POSTS,
    GET_ALGORITHM_METRICS_SUMMARY,
    GET_BEST_TIME_BY_FORMAT,
    GET_BEST_TIME_POSTS,
    GET_BEST_TIME_TO_POST,
    GET_DAILY_FOLLOWS,
    GET_DEMOGRAPHIC_INSIGHTS,
    GET_FOLLOWER_QUALITY_BY_COHORT,
    GET_FOLLOWER_QUALITY_SUMMARY,
    GET_FOLLOWER_SPIKES,
    GET_FORMAT_BREAKDOWN,
    GET_FORMAT_BREAKDOWN_POSTS,
    GET_HASHTAG_COMBOS,
    GET_HASHTAG_TREND,
    GET_MEDIA_INSIGHTS,
    GET_MEDIA_NEEDING_SYNC,
    GET_MEDIA_SENTIMENT_DISTRIBUTION,
    GET_MEDIA_SENTIMENT_SAMPLES,
    GET_POSTS_FOR_ATTRIBUTION,
    GET_QUESTION_POSTS,
    GET_REELS_RETENTION,
    GET_REELS_RETENTION_TREND,
    GET_SELF_CONTENT_MIX,
    GET_SELF_LAST_25_POSTS,
    GET_SENTIMENT_SUMMARY,
    GET_SENTIMENT_TREND,
    GET_TOP_HASHTAGS,
    GET_TOPICS,
)

logger = logging.getLogger(__name__)


# --- Account Insights ---

def purge_account_insights_window(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
) -> None:
    """Synchronously delete account_insights rows in [since, now] for this user.

    Used by sync's purge mode to wipe stale rows whose end_time doesn't align with
    the new per-day storage convention (e.g. legacy 'views' snapshots stamped at
    end_time=now() that would inflate sumIf totals). ClickHouse ALTER ... DELETE
    is a mutation; mutations_sync=2 makes it block until the part is rewritten so
    the subsequent INSERT lands on a clean slate.
    """
    client.command(
        "ALTER TABLE account_insights DELETE "
        "WHERE user_id = {user_id:UUID} "
        "  AND ig_user_id = {ig_user_id:String} "
        "  AND end_time >= {since:DateTime}",
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "since": since},
        settings={"mutations_sync": 2},
    )
    logger.info(
        "Purged account_insights for user %s ig %s since %s", user_id, ig_user_id, since
    )


def bulk_upsert_account_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metric_rows: list[dict[str, Any]],
) -> int:
    """Batch-insert account insight time-series rows.

    Each item in metric_rows must have: metric_name, metric_value, end_time (datetime).
    Returns count of rows inserted.
    """
    if not metric_rows:
        return 0

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            r["metric_name"],
            r["metric_value"],
            "day",
            r["end_time"],
            now,
            now,
        ]
        for r in metric_rows
    ]

    client.insert(
        "account_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_user_id", "metric_name", "metric_value",
            "period", "end_time", "fetched_at", "updated_at",
        ],
    )
    logger.info("Upserted %d account insight rows for user %s", len(rows), user_id)
    return len(rows)


def find_account_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metrics: list[str],
    since: datetime,
) -> list[AccountInsight]:
    """Fetch account insight time-series rows for given metrics since a date."""
    rows = client.query(
        GET_ACCOUNT_INSIGHTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "metrics": metrics,
            "since": since,
        },
    )
    return [AccountInsight.from_row(r) for r in rows.result_rows]


def find_daily_metric_samples(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metrics: list[str],
    since: datetime,
    until: datetime,
) -> dict[str, list[float]]:
    """Return per-day metric values keyed by metric_name.

    Used as the sample set for Welch's t-test significance on dashboard count
    metrics. Each day in the window contributes one sample. Days with no data
    contribute zero samples (not zero values) so the variance reflects only
    days the platform recorded activity.
    """
    out: dict[str, list[float]] = {m: [] for m in metrics}
    rows = client.query(
        GET_DAILY_METRIC_SAMPLES,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "metrics": metrics,
            "since": since,
            "until": until,
        },
    ).result_rows
    for metric_name, _day, daily_value in rows:
        if metric_name in out:
            out[metric_name].append(float(daily_value or 0))
    return out


# --- Demographic Insights ---

def bulk_upsert_demographic_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    demo_rows: list[dict[str, Any]],
) -> None:
    """Batch-insert demographic insight rows.

    Each item must have: metric_name, dimension_key, dimension_value, metric_value, timeframe.
    """
    if not demo_rows:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_user_id,
            r["metric_name"],
            r["dimension_key"],
            r["dimension_value"],
            r["metric_value"],
            r.get("timeframe", "this_month"),
            now,
            now,
        ]
        for r in demo_rows
    ]

    client.insert(
        "demographic_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_user_id", "metric_name", "dimension_key",
            "dimension_value", "metric_value", "timeframe", "fetched_at", "updated_at",
        ],
    )
    logger.info("Upserted %d demographic rows for user %s", len(rows), user_id)


def find_demographic_insights(
    client: Client,
    user_id: str,
    ig_user_id: str,
    metric_name: str,
    dimension_key: str,
) -> list[DemographicInsight]:
    """Fetch demographic breakdown rows for a given metric and dimension."""
    rows = client.query(
        GET_DEMOGRAPHIC_INSIGHTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "metric_name": metric_name,
            "dimension_key": dimension_key,
        },
    )
    return [DemographicInsight.from_row(r) for r in rows.result_rows]


# --- Media Insights ---

def bulk_upsert_media_insights(
    client: Client,
    user_id: str,
    ig_media_id: str,
    metric_rows: list[dict[str, Any]],
) -> None:
    """Batch-insert per-media insight rows.

    Each item must have: metric_name, metric_value.
    """
    if not metric_rows:
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        [
            str(uuid.uuid4()),
            user_id,
            ig_media_id,
            r["metric_name"],
            float(r["metric_value"]),
            now,
            now,
        ]
        for r in metric_rows
    ]

    client.insert(
        "media_insights",
        rows,
        column_names=[
            "id", "user_id", "ig_media_id", "metric_name",
            "metric_value", "fetched_at", "updated_at",
        ],
    )


def find_media_insights(
    client: Client,
    user_id: str,
    ig_media_id: str,
) -> list[MediaInsight]:
    """Fetch all insight metrics for a given media item."""
    rows = client.query(
        GET_MEDIA_INSIGHTS,
        parameters={"user_id": user_id, "ig_media_id": ig_media_id},
    )
    return [MediaInsight.from_row(r) for r in rows.result_rows]


def find_media_needing_sync(
    client: Client,
    user_id: str,
    ig_user_id: str,
    stale_hours: int = 24,
) -> list[tuple[str, str]]:
    """Return (ig_media_id, media_product_type) for media whose insights are stale or never synced."""
    stale_threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=stale_hours)
    rows = client.query(
        GET_MEDIA_NEEDING_SYNC,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "stale_threshold": stale_threshold,
        },
    )
    return [(r[0], r[1]) for r in rows.result_rows]


# --- Feature 1: Content-Format Performance Breakdown ---

def _now_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def find_format_breakdown(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> list[dict]:
    """Return per-format aggregate performance metrics."""
    rows = client.query(
        GET_FORMAT_BREAKDOWN,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
        },
    )
    cols = [
        "media_product_type", "media_type", "post_count",
        "avg_reach", "avg_views", "avg_likes", "avg_saves", "avg_shares",
        "avg_interactions", "avg_engagement_rate", "avg_save_rate", "avg_share_rate",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


# --- Feature 2: Best Time to Post ---

def find_best_time_to_post(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    min_sample: int = 3,
    until: datetime | None = None,
) -> list[dict]:
    """Return engagement-by-hour heatmap rows."""
    rows = client.query(
        GET_BEST_TIME_TO_POST,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
            "min_sample": min_sample,
        },
    )
    cols = [
        "day_of_week", "hour_of_day", "sample_size",
        "avg_interactions", "avg_reach", "avg_engagement_rate",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


def find_best_time_by_format(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    min_sample: int = 3,
    until: datetime | None = None,
) -> list[dict]:
    """Heatmap rows split by media_product_type (FEED vs REELS)."""
    rows = client.query(
        GET_BEST_TIME_BY_FORMAT,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
            "min_sample": min_sample,
        },
    )
    cols = [
        "media_product_type", "day_of_week", "hour_of_day", "sample_size",
        "avg_interactions", "avg_reach", "avg_engagement_rate",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


# --- Feature 3: Algorithm Metrics ---

def find_algorithm_metrics_posts(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    limit: int = 20,
    until: datetime | None = None,
) -> list[dict]:
    """Return per-post save rate, share rate, and algorithm score."""
    rows = client.query(
        GET_ALGORITHM_METRICS_POSTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
            "limit": limit,
        },
    )
    cols = [
        "ig_media_id", "media_product_type", "media_type",
        "permalink", "thumbnail_url", "media_url", "caption", "timestamp",
        "saved", "shares", "reach", "likes", "comments",
        "save_rate", "share_rate", "algorithm_score",
    ]
    return [dict(zip(cols, r)) for r in rows.result_rows]


def find_algorithm_metrics_summary(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> dict:
    """Return account-level aggregate save/share rates."""
    rows = client.query(
        GET_ALGORITHM_METRICS_SUMMARY,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
        },
    )
    if not rows.result_rows:
        return {
            "total_saves": 0.0, "total_shares": 0.0, "total_reach": 0.0,
            "account_save_rate": 0.0, "account_share_rate": 0.0,
        }
    r = rows.result_rows[0]
    return {
        "total_saves": float(r[0]),
        "total_shares": float(r[1]),
        "total_reach": float(r[2]),
        "account_save_rate": float(r[3]),
        "account_share_rate": float(r[4]),
    }


# --- Feature 4: Reels Retention ---

def find_reels_retention(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    limit: int = 50,
    until: datetime | None = None,
) -> list[tuple]:
    return client.query(
        GET_REELS_RETENTION,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
            "limit": limit,
        },
    ).result_rows


def find_reels_retention_trend(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> list[tuple]:
    return client.query(
        GET_REELS_RETENTION_TREND,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "until": until or _now_utc_naive(),
        },
    ).result_rows


# --- Feature 5: Follower Quality Score ---

def find_follower_quality(
    client: Client,
    user_id: str,
    ig_user_id: str,
    breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_BY_COHORT,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows


def find_follower_quality_summary(
    client: Client,
    user_id: str,
    ig_user_id: str,
    breakdown: str,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_QUALITY_SUMMARY,
        parameters={"user_id": user_id, "ig_user_id": ig_user_id, "breakdown": breakdown},
    ).result_rows


def find_follower_spikes(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    spike_threshold: int,
) -> list[tuple]:
    return client.query(
        GET_FOLLOWER_SPIKES,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "spike_threshold": spike_threshold,
        },
    ).result_rows


# --- Phase 7: Drill-Down APIs ---

def find_format_breakdown_posts(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    format_type: str,
    limit: int = 20,
) -> list[tuple]:
    return client.query(
        GET_FORMAT_BREAKDOWN_POSTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "format": format_type,
            "limit": limit,
        },
    ).result_rows


def find_best_time_posts(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    day_of_week: int,
    hour_of_day: int,
) -> list[tuple]:
    return client.query(
        GET_BEST_TIME_POSTS,
        parameters={
            "user_id": user_id,
            "ig_user_id": ig_user_id,
            "since": since,
            "day_of_week": day_of_week,
            "hour_of_day": hour_of_day,
        },
    ).result_rows


# --- Tier 2 / F5: Audience Growth Drivers ---

def _safe_float(value) -> float:
    """Coerce a value to float, treating None / non-numeric as 0.0.

    `sumIf` in ClickHouse returns 0 for empty groups so post-join columns are
    usually numeric, but defensive coercion keeps this helper safe across
    schema partial-loads (e.g., a freshly-synced post with no insights yet).
    """
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _attribute_drivers_for_day(
    posts_by_day: dict[date, list[tuple]],
    day: date,
    daily_follows: int,
) -> list[dict]:
    """Compute attribution shares for a single day.

    Same model as `find_growth_drivers` but scoped to one day's window
    (post_day = day or day - 1). Returns one dict per candidate post sorted
    by `attributed_follows` desc. Empty list if no candidates or no positive
    follower change.
    """
    if daily_follows <= 0:
        return []
    candidates = posts_by_day.get(day, []) + posts_by_day.get(day - timedelta(days=1), [])
    if not candidates:
        return []

    # Coerce defensively — a freshly-synced post can have NULL reach until the
    # media-insights batch finishes. We don't want None > 0 to throw.
    weights = [
        _safe_float(p[7]) if _safe_float(p[7]) > 0 else _safe_float(p[6])
        for p in candidates
    ]
    total_weight = sum(weights)
    if total_weight <= 0:
        return []

    drivers: list[dict] = []
    for p, weight in zip(candidates, weights):
        ig_media_id = p[0]
        permalink, thumb, caption, ptype = p[2], p[3], p[4] or "", p[5]
        reach = _safe_float(p[6])
        non_follower_reach = _safe_float(p[7])
        share = weight / total_weight
        attributed = daily_follows * share
        nfr = non_follower_reach if non_follower_reach > 0 else reach
        drivers.append({
            "ig_media_id": ig_media_id,
            "media_product_type": ptype,
            "permalink": permalink,
            "thumbnail_url": thumb,
            "caption": caption,
            "reach": reach,
            "non_follower_reach": nfr,
            "attributed_follows": attributed,
            "conversion_rate_pct": (attributed / nfr * 100.0) if nfr > 0 else 0.0,
        })
    drivers.sort(key=lambda x: x["attributed_follows"], reverse=True)
    return drivers


def find_candidate_drivers_for_spikes(
    client: Client,
    user_id: str,
    ig_user_id: str,
    spikes: list[tuple[date, int]],
    per_spike_limit: int = 5,
) -> dict[str, list[dict]]:
    """Map each spike date → its candidate driver posts.

    Args:
        spikes: ``[(spike_date, daily_follows), ...]``.
        per_spike_limit: cap on drivers attached per spike (the FE only
            renders a short list).

    Returns: ``{spike_date_iso: [driver_dict, ...]}``. Spikes with no
    candidates or zero follower change return an empty list under their key.
    """
    if not spikes:
        return {}

    # Posts in a window that covers every spike's 24h-prior boundary.
    spike_dates = [d for d, _ in spikes]
    window_start = (min(spike_dates) - timedelta(days=1))
    since_dt = datetime.combine(window_start, datetime.min.time())

    post_rows = safe_call(
        lambda: client.query(
            GET_POSTS_FOR_ATTRIBUTION,
            parameters={
                "user_id": user_id,
                "ig_user_id": ig_user_id,
                "since": since_dt,
                "until": _now_utc_naive(),
            },
        ).result_rows,
        fallback=[],
        label="insights_repo.find_candidate_drivers_for_spikes",
    )
    # row layout matches find_growth_drivers (ig_media_id, post_day, permalink,
    # thumbnail_url, caption, media_product_type, reach, non_follower_reach)

    posts_by_day: dict[date, list[tuple]] = {}
    for row in post_rows:
        posts_by_day.setdefault(row[1], []).append(row)

    out: dict[str, list[dict]] = {}
    for spike_date, daily_follows in spikes:
        drivers = _attribute_drivers_for_day(
            posts_by_day, spike_date, daily_follows,
        )[:per_spike_limit]
        out[spike_date.isoformat()] = drivers
    return out


def find_growth_drivers(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    limit: int = 10,
    until: datetime | None = None,
) -> list[dict]:
    """Return top posts ranked by attributed follower acquisition.

    Attribution model: for each day with positive net follower growth, the
    posts published on that day or the day before split the day's follower
    gain in proportion to their `non_follower_reach` (falling back to total
    `reach` when the breakdown isn't synced yet).

    Returns [] when any required table is missing — the attribution panel
    just stays empty rather than 500-ing the Audience DNA page.
    """
    params = {
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": since,
        "until": until or _now_utc_naive(),
    }
    follow_rows = safe_call(
        lambda: client.query(GET_DAILY_FOLLOWS, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_growth_drivers.daily_follows",
    )
    post_rows = safe_call(
        lambda: client.query(GET_POSTS_FOR_ATTRIBUTION, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_growth_drivers.posts",
    )
    # row layout: ig_media_id, post_day, permalink, thumb, caption, media_product_type, reach, non_follower_reach

    posts_by_day: dict[date, list[tuple]] = {}
    for row in post_rows:
        posts_by_day.setdefault(row[1], []).append(row)

    attributions: dict[str, dict] = {}
    for day, daily_follows in follow_rows:
        if daily_follows is None or daily_follows <= 0:
            continue
        same_day = posts_by_day.get(day, [])
        prev_day = posts_by_day.get(day - timedelta(days=1), [])
        candidates = same_day + prev_day
        if not candidates:
            continue
        # Defensive float coercion — same rationale as _attribute_drivers_for_day.
        weights = [
            _safe_float(p[7]) if _safe_float(p[7]) > 0 else _safe_float(p[6])
            for p in candidates
        ]
        total_weight = sum(weights)
        if total_weight <= 0:
            continue
        for p, weight in zip(candidates, weights):
            ig_media_id = p[0]
            permalink, thumb, caption, ptype = p[2], p[3], p[4] or "", p[5]
            reach = _safe_float(p[6])
            non_follower_reach = _safe_float(p[7])
            share = weight / total_weight
            attributed = daily_follows * share
            agg = attributions.setdefault(ig_media_id, {
                "ig_media_id": ig_media_id,
                "media_product_type": ptype,
                "permalink": permalink,
                "thumbnail_url": thumb,
                "caption": caption,
                "reach": reach,
                "non_follower_reach": non_follower_reach if non_follower_reach > 0 else reach,
                "attributed_follows": 0.0,
            })
            agg["attributed_follows"] += attributed

    ranked = sorted(
        attributions.values(),
        key=lambda x: x["attributed_follows"],
        reverse=True,
    )[:limit]
    for r in ranked:
        nfr = r["non_follower_reach"]
        r["conversion_rate_pct"] = (
            (r["attributed_follows"] / nfr * 100) if nfr > 0 else 0.0
        )
    return ranked


def find_post_conversion(
    client: Client,
    user_id: str,
    ig_user_id: str,
    ig_media_id: str,
    lookback_days: int = 365,
) -> dict[str, Any] | None:
    """Compute the per-post follower-conversion rate for one media item.

    Re-runs the daily-attribution model used by `find_growth_drivers` and
    pulls just the requested ig_media_id's slice out — keeps the math
    consistent rather than introducing a second formula.

    Returns None when the media doesn't have eligible insights (e.g. STORY
    posts, or media older than the lookback window).
    """
    since = _now_utc_naive() - timedelta(days=lookback_days)
    drivers = find_growth_drivers(
        client, user_id, ig_user_id, since, limit=10000,
    )
    for d in drivers:
        if d["ig_media_id"] == ig_media_id:
            return {
                "non_follower_reach": d["non_follower_reach"],
                "attributed_follows": d["attributed_follows"],
                "conversion_rate_pct": d["conversion_rate_pct"],
            }
    return None


def find_growth_correlation(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> dict[str, Any]:
    """Daily pairs of (follower_change, non_follower_reach) + Pearson r.

    Used by the growth-drivers correlation scatter chart. Days are joined on
    date — a day with no posts contributes (follows, 0). A day with no
    follower-insight contributes nothing (filtered out by the inner join).

    Falls back to total reach when the non_follower_reach breakdown isn't
    populated yet; the response carries `uses_non_follower_reach` so the FE
    can render a "rough estimate" tag accordingly.
    """
    params = {
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": since,
        "until": until or _now_utc_naive(),
    }
    follow_rows = safe_call(
        lambda: client.query(GET_DAILY_FOLLOWS, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_growth_correlation.follows",
    )
    reach_rows = safe_call(
        lambda: client.query(GET_DAILY_REACH_BY_POST_DAY, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_growth_correlation.reach",
    )

    follow_by_day: dict[date, int] = {row[0]: int(row[1] or 0) for row in follow_rows}
    reach_by_day: dict[date, tuple[float, float]] = {}
    for day, daily_reach, daily_nfr in reach_rows:
        reach_by_day[day] = (float(daily_reach or 0), float(daily_nfr or 0))

    has_any_nfr = any(nfr > 0 for _, nfr in reach_by_day.values())
    points: list[dict[str, Any]] = []
    for day, follows in follow_by_day.items():
        total_reach, nfr = reach_by_day.get(day, (0.0, 0.0))
        x = nfr if has_any_nfr and nfr > 0 else total_reach
        points.append({
            "day": day.isoformat() if hasattr(day, "isoformat") else str(day),
            "follows": follows,
            "reach": x,
        })

    # Pearson r — guard against degenerate cases (n<3, zero variance).
    n = len(points)
    correlation: float | None = None
    if n >= 3:
        xs = [p["reach"] for p in points]
        ys = [float(p["follows"]) for p in points]
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        var_x = sum((x - mean_x) ** 2 for x in xs)
        var_y = sum((y - mean_y) ** 2 for y in ys)
        if var_x > 0 and var_y > 0:
            cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
            correlation = cov / (var_x ** 0.5 * var_y ** 0.5)

    points.sort(key=lambda p: p["day"])
    return {
        "points": points,
        "correlation": correlation,
        "uses_non_follower_reach": has_any_nfr,
    }


# --- Tier 2 / F2: Hashtag Performance ---

def find_top_hashtags(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    limit: int,
    min_uses: int,
    until: datetime | None = None,
) -> list[dict]:
    """Top hashtags by avg engagement. Returns [] if `post_hashtags` is missing."""
    params = {
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": since,
        "until": until or _now_utc_naive(),
        "limit": limit,
        "min_uses": min_uses,
    }
    rows = safe_call(
        lambda: client.query(GET_TOP_HASHTAGS, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_top_hashtags",
    )
    cols = ["hashtag", "post_count", "avg_reach", "avg_engagement_rate_pct", "avg_save_rate_pct"]
    return [dict(zip(cols, r)) for r in rows]


def find_hashtag_trend(
    client: Client,
    user_id: str,
    ig_user_id: str,
    tag: str,
    since: datetime,
    until: datetime | None = None,
) -> list[dict]:
    """Weekly trend for one hashtag. Returns [] if `post_hashtags` is missing."""
    params = {
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "tag": tag,
        "since": since,
        "until": until or _now_utc_naive(),
    }
    rows = safe_call(
        lambda: client.query(GET_HASHTAG_TREND, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_hashtag_trend",
    )
    cols = ["week_start", "posts_used", "avg_reach", "avg_engagement_rate_pct"]
    return [dict(zip(cols, r)) for r in rows]


def find_hashtag_combos(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
    min_uses: int,
    until: datetime | None = None,
) -> list[dict]:
    """Top co-occurring pairs. Returns [] if `post_hashtags` is missing."""
    params = {
        "user_id": user_id,
        "ig_user_id": ig_user_id,
        "since": since,
        "until": until or _now_utc_naive(),
        "min_uses": min_uses,
    }
    rows = safe_call(
        lambda: client.query(GET_HASHTAG_COMBOS, parameters=params).result_rows,
        fallback=[],
        label="insights_repo.find_hashtag_combos",
    )
    cols = ["tag_a", "tag_b", "cooccurrence_count", "avg_engagement_pct"]
    return [dict(zip(cols, r)) for r in rows]


# --- Tier 2 / F4: Comment Sentiment ---

def find_sentiment_distribution(
    client: Client,
    user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> dict[str, int]:
    """Total comments per sentiment bucket. Returns zeros when the
    `comment_sentiment` / `instagram_comments` tables aren't migrated yet."""
    rows = safe_call(
        lambda: client.query(
            GET_SENTIMENT_SUMMARY,
            parameters={
                "user_id": user_id,
                "since": since,
                "until": until or _now_utc_naive(),
            },
        ).result_rows,
        fallback=[],
        label="insights_repo.find_sentiment_distribution",
    )
    out = {"positive": 0, "neutral": 0, "negative": 0}
    for sentiment, total in rows:
        if sentiment in out:
            out[sentiment] = int(total)
    return out


def find_sentiment_trend(
    client: Client,
    user_id: str,
    since: datetime,
    until: datetime | None = None,
) -> list[dict]:
    """Weekly sentiment trend. Returns [] when sentiment tables are missing."""
    rows = safe_call(
        lambda: client.query(
            GET_SENTIMENT_TREND,
            parameters={
                "user_id": user_id,
                "since": since,
                "until": until or _now_utc_naive(),
            },
        ).result_rows,
        fallback=[],
        label="insights_repo.find_sentiment_trend",
    )
    return [
        {
            "week_start": str(r[0]),
            "positive": int(r[1]),
            "neutral": int(r[2]),
            "negative": int(r[3]),
        }
        for r in rows
    ]


#: Question-starter words. A topic whose label starts with one of these (case
#: insensitive) is treated as a question even if the stored is_question flag
#: is 0 — covers rows written before migration 014 added the column.
_QUESTION_STARTERS: tuple[str, ...] = (
    "who", "what", "where", "when", "why", "how", "which",
    "can ", "could ", "would ", "should ", "will ",
    "is ", "are ", "do ", "does ", "did ",
)


def _label_looks_like_question(label: str) -> bool:
    label = (label or "").lower().strip()
    if not label:
        return False
    if "?" in label:
        return True
    return any(label.startswith(s) for s in _QUESTION_STARTERS)


_LEGACY_GET_TOPICS = """
SELECT
    cluster_id, label, size, sample_comment_ids
FROM comment_topics FINAL
WHERE user_id = {user_id:UUID}
  AND period_end >= {since:DateTime}
ORDER BY period_end DESC, size DESC
LIMIT 20
"""


def find_topics(
    client: Client,
    user_id: str,
    since: datetime,
) -> list[dict]:
    """Return up to 20 most recent topic clusters for the user.

    Falls back to the legacy column set (no `is_question`) when migration 014
    hasn't been applied — the label heuristic still flags obvious questions.
    Returns [] if `comment_topics` doesn't exist (migration 011 not run).
    """
    params = {"user_id": user_id, "since": since}
    try:
        rows = client.query(GET_TOPICS, parameters=params).result_rows
    except Exception as exc:
        if not _is_schema_missing(exc):
            raise
        try:
            legacy = client.query(_LEGACY_GET_TOPICS, parameters=params).result_rows
        except Exception as legacy_exc:
            if not _is_schema_missing(legacy_exc):
                raise
            log_schema_missing(
                "find_topics", legacy_exc,
                "comment_topics table missing — returning empty list",
            )
            return []
        # First (new-column) query failed but legacy worked — migration 014 is the gap.
        log_schema_missing(
            "find_topics", exc,
            "dropped is_question (migration 014 not applied)",
        )
        rows = [(*r, 0) for r in legacy]  # pad is_question=0

    out: list[dict] = []
    for r in rows:
        label = r[1] or ""
        stored_flag = bool(r[4]) if len(r) > 4 and r[4] is not None else False
        out.append({
            "cluster_id": int(r[0]),
            "label": label,
            "size": int(r[2]),
            # Trust the stored flag once topic_clustering has written it.
            # For legacy rows that defaulted to 0 (or that the job hasn't
            # rerun on yet), fall back to a label heuristic so the FE
            # HelpCircle still lights up on obvious questions.
            "is_question": stored_flag or _label_looks_like_question(label),
        })
    return out


def find_question_posts(
    client: Client,
    user_id: str,
    since: datetime,
    limit: int,
) -> list[dict]:
    """Posts ranked by question-comment count. Returns [] when sentiment tables are missing."""
    rows = safe_call(
        lambda: client.query(
            GET_QUESTION_POSTS,
            parameters={"user_id": user_id, "since": since, "limit": limit},
        ).result_rows,
        fallback=[],
        label="insights_repo.find_question_posts",
    )
    return [
        {
            "ig_media_id": r[0],
            "permalink": r[1] or "",
            "thumbnail_url": r[2] or None,
            "caption": r[3] or "",
            "timestamp": str(r[4]),
            "question_count": int(r[5]),
            "total_comments": int(r[6]),
        }
        for r in rows
    ]


def find_media_sentiment_distribution(
    client: Client,
    user_id: str,
    ig_media_id: str,
) -> dict[str, int]:
    """Per-post sentiment counts. Returns zeros when sentiment tables are missing."""
    rows = safe_call(
        lambda: client.query(
            GET_MEDIA_SENTIMENT_DISTRIBUTION,
            parameters={"user_id": user_id, "ig_media_id": ig_media_id},
        ).result_rows,
        fallback=[],
        label="insights_repo.find_media_sentiment_distribution",
    )
    out = {"positive": 0, "neutral": 0, "negative": 0}
    for sentiment, total in rows:
        if sentiment in out:
            out[sentiment] = int(total)
    return out


def find_media_sentiment_samples(
    client: Client,
    user_id: str,
    ig_media_id: str,
    per_bucket: int = 3,
) -> list[dict]:
    """Return up to `per_bucket` representative comments per sentiment bucket.
    Returns [] when sentiment tables are missing."""
    rows = safe_call(
        lambda: client.query(
            GET_MEDIA_SENTIMENT_SAMPLES,
            parameters={"user_id": user_id, "ig_media_id": ig_media_id},
        ).result_rows,
        fallback=[],
        label="insights_repo.find_media_sentiment_samples",
    )
    per_bucket_counts: dict[str, int] = {"positive": 0, "neutral": 0, "negative": 0}
    samples: list[dict] = []
    for ig_comment_id, username, text, sentiment, _likes in rows:
        if sentiment not in per_bucket_counts:
            continue
        if per_bucket_counts[sentiment] >= per_bucket:
            continue
        per_bucket_counts[sentiment] += 1
        samples.append({
            "ig_comment_id": ig_comment_id,
            "username": username or "",
            "text": text or "",
            "sentiment": sentiment,
        })
        if all(c >= per_bucket for c in per_bucket_counts.values()):
            break
    return samples


# --- Tier 2 / F3: Competitor Benchmarking (self-side helpers) ---

def find_self_content_mix(
    client: Client,
    user_id: str,
    ig_user_id: str,
    since: datetime,
) -> dict[str, float]:
    """Format distribution (reels/carousel/image) for the connected IG account.

    Returns all-zeros when `instagram_media` is empty or missing.
    """
    rows = safe_call(
        lambda: client.query(
            GET_SELF_CONTENT_MIX,
            parameters={
                "user_id": user_id,
                "ig_user_id": ig_user_id,
                "since": since,
            },
        ).result_rows,
        fallback=[],
        label="insights_repo.find_self_content_mix",
    )
    if not rows:
        return {"reels": 0.0, "carousel": 0.0, "image": 0.0}
    reels, carousel, image, total = rows[0]
    total = total or 1
    return {
        "reels": reels / total,
        "carousel": carousel / total,
        "image": image / total,
    }


def find_self_last_25_posts(
    client: Client,
    user_id: str,
    ig_user_id: str,
) -> list[tuple]:
    """Latest 25 owned posts. Returns [] when `instagram_media` is missing."""
    return safe_call(
        lambda: client.query(
            GET_SELF_LAST_25_POSTS,
            parameters={"user_id": user_id, "ig_user_id": ig_user_id},
        ).result_rows,
        fallback=[],
        label="insights_repo.find_self_last_25_posts",
    )
