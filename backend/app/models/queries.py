"""Raw SQL queries for ClickHouse.

All queries against ReplacingMergeTree tables use the FINAL keyword
to guarantee deduplication at read time.

Parameter types use ClickHouse native types (UUID, String, UInt32)
to enable proper index usage.
"""

# --- Users ---

GET_USER_BY_EMAIL = """
SELECT id, email, username, hashed_password, is_active
FROM users FINAL
WHERE email = {email:String}
LIMIT 1
"""

GET_USER_BY_ID = """
SELECT id, email, username, is_active
FROM users FINAL
WHERE id = {user_id:UUID}
LIMIT 1
"""

CHECK_EMAIL_EXISTS = """
SELECT id FROM users FINAL
WHERE email = {email:String}
LIMIT 1
"""

# --- Instagram Profiles ---

GET_INSTAGRAM_PROFILE = """
SELECT id, ig_user_id, username, name, biography, profile_picture_url,
       followers_count, follows_count, media_count, connected_at
FROM instagram_profiles FINAL
WHERE user_id = {user_id:UUID}
ORDER BY updated_at DESC
LIMIT 1
"""

GET_INSTAGRAM_TOKEN = """
SELECT ig_user_id, access_token, token_expires_at
FROM instagram_profiles FINAL
WHERE user_id = {user_id:UUID}
ORDER BY updated_at DESC
LIMIT 1
"""

# --- Instagram Media ---

COUNT_INSTAGRAM_MEDIA = """
SELECT count()
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
"""

GET_INSTAGRAM_MEDIA_PAGE = """
SELECT ig_media_id, media_type, media_url, thumbnail_url, permalink,
       caption, timestamp, like_count, comments_count, media_product_type
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
ORDER BY timestamp DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
"""

GET_ALL_INSTAGRAM_MEDIA_FOR_INSIGHTS = """
SELECT ig_media_id, media_product_type
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
ORDER BY timestamp DESC
"""

# --- Account Insights ---

GET_ACCOUNT_INSIGHTS = """
SELECT metric_name, metric_value, end_time
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name IN ({metrics:Array(String)})
  AND end_time >= {since:DateTime}
ORDER BY metric_name, end_time
"""

# Tier 2 / F1 — per-day samples for Welch's t-test significance.
# Aggregates account_insights to one row per (metric, day) so the comparison
# helper can compute mean/variance across days without the FINAL+ORDER BY
# already in GET_ACCOUNT_INSIGHTS skewing things.
GET_DAILY_METRIC_SAMPLES = """
SELECT
    metric_name,
    toDate(end_time) AS day,
    sum(metric_value) AS daily_value
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name IN ({metrics:Array(String)})
  AND end_time >= {since:DateTime}
  AND end_time <= {until:DateTime}
GROUP BY metric_name, day
"""

# --- Demographic Insights ---

GET_DEMOGRAPHIC_INSIGHTS = """
SELECT metric_name, dimension_key, dimension_value, metric_value, timeframe
FROM demographic_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name = {metric_name:String}
  AND dimension_key = {dimension_key:String}
ORDER BY metric_value DESC
LIMIT 45
"""

# --- Media Insights ---

GET_MEDIA_INSIGHTS = """
SELECT ig_media_id, metric_name, metric_value
FROM media_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_media_id = {ig_media_id:String}
"""

GET_MEDIA_NEEDING_SYNC = """
SELECT m.ig_media_id, m.media_product_type
FROM instagram_media m FINAL
LEFT JOIN (
    SELECT ig_media_id, max(fetched_at) AS last_fetched
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id
) mi ON m.ig_media_id = mi.ig_media_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND (mi.last_fetched IS NULL OR mi.last_fetched < {stale_threshold:DateTime})
ORDER BY m.timestamp DESC
"""

# --- Dashboard Aggregates ---

GET_DASHBOARD_SUMMARY = """
SELECT
    sumIf(metric_value, metric_name = 'views') AS total_views,
    sumIf(metric_value, metric_name = 'reach') AS total_reach,
    sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions,
    sumIf(metric_value, metric_name = 'accounts_engaged') AS total_accounts_engaged
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND end_time >= {since:DateTime}
  AND end_time <= {until:DateTime}
"""

GET_FOLLOWER_GROWTH = """
SELECT
    sum(metric_value) AS net_follower_change
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name = 'follows_and_unfollows'
  AND end_time >= {since:DateTime}
  AND end_time <= {until:DateTime}
"""

GET_TOP_PERFORMING_MEDIA = """
SELECT mi.ig_media_id, m.media_type, m.permalink,
       m.thumbnail_url, m.media_url, m.caption,
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'views')) AS views,
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'total_interactions')) AS interactions
FROM media_insights mi FINAL
JOIN instagram_media m FINAL ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE mi.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
GROUP BY mi.ig_media_id, m.media_type, m.permalink, m.thumbnail_url, m.media_url, m.caption
ORDER BY interactions DESC
LIMIT {limit:UInt32}
"""

# --- Feature 1: Content-Format Performance Breakdown ---

GET_FORMAT_BREAKDOWN = """
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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
  AND m.media_product_type != ''
GROUP BY m.media_product_type, m.media_type
ORDER BY avg_reach DESC
"""

# --- Feature 2: Best Time to Post ---

GET_BEST_TIME_TO_POST = """
SELECT
    toDayOfWeek(m.timestamp) AS day_of_week,
    toHour(m.timestamp) AS hour_of_day,
    count(DISTINCT m.ig_media_id) AS sample_size,
    avg(metrics.total_interactions) AS avg_interactions,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach * 100, metrics.reach > 0) AS avg_engagement_rate
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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
GROUP BY day_of_week, hour_of_day
HAVING sample_size >= {min_sample:UInt32}
ORDER BY avg_engagement_rate DESC
"""

# --- Feature 3: Algorithm Metrics (save rate, share rate, algorithm score) ---

GET_ALGORITHM_METRICS_POSTS = """
SELECT
    m.ig_media_id,
    m.media_product_type,
    m.media_type,
    m.permalink,
    m.thumbnail_url,
    m.media_url,
    m.caption,
    toString(m.timestamp) AS timestamp,
    metrics.saved,
    metrics.shares,
    metrics.reach,
    metrics.likes,
    metrics.comments,
    if(metrics.reach > 0, metrics.saved / metrics.reach * 100, 0) AS save_rate,
    if(metrics.reach > 0, metrics.shares / metrics.reach * 100, 0) AS share_rate,
    if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35 + metrics.likes * 0.15 + metrics.comments * 0.10) / metrics.reach * 100,
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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
ORDER BY algorithm_score DESC
LIMIT {limit:UInt32}
"""

GET_ALGORITHM_METRICS_SUMMARY = """
SELECT
    sumIf(metric_value, metric_name = 'saves') AS total_saves,
    sumIf(metric_value, metric_name = 'shares') AS total_shares,
    sumIf(metric_value, metric_name = 'reach') AS total_reach,
    if(sumIf(metric_value, metric_name = 'reach') > 0,
       sumIf(metric_value, metric_name = 'saves') / sumIf(metric_value, metric_name = 'reach') * 100, 0
    ) AS account_save_rate,
    if(sumIf(metric_value, metric_name = 'reach') > 0,
       sumIf(metric_value, metric_name = 'shares') / sumIf(metric_value, metric_name = 'reach') * 100, 0
    ) AS account_share_rate
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND end_time >= {since:DateTime}
  AND end_time <= {until:DateTime}
"""

# --- Phase 0.3: Shared pivot subquery (embedded via string concat) ---

PIVOTED_MEDIA_METRICS = """
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'views') AS views,
        sumIf(metric_value, metric_name = 'likes') AS likes,
        sumIf(metric_value, metric_name = 'saved') AS saved,
        sumIf(metric_value, metric_name = 'shares') AS shares,
        sumIf(metric_value, metric_name = 'comments') AS comments,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions,
        sumIf(metric_value, metric_name = 'ig_reels_avg_watch_time') AS avg_watch_time,
        sumIf(metric_value, metric_name = 'ig_reels_video_view_total_time') AS total_view_time,
        sumIf(metric_value, metric_name = 'reels_skip_rate') AS skip_rate,
        sumIf(metric_value, metric_name = 'profile_visits') AS profile_visits,
        sumIf(metric_value, metric_name = 'reposts') AS reposts
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
"""

# --- Feature 4: Reels Retention & Drop-Off ---

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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.media_product_type = 'REELS'
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.media_product_type = 'REELS'
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp <= {until:DateTime}
GROUP BY week_start
ORDER BY week_start ASC
"""

# --- Feature 5: Follower Quality Score ---

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

# --- Phase 7: Drill-Down APIs ---

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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type = {format:String}
ORDER BY algorithm_score_pct DESC
LIMIT {limit:UInt32}
"""

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
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND toDayOfWeek(m.timestamp) = {day_of_week:UInt8}
  AND toHour(m.timestamp) = {hour_of_day:UInt8}
ORDER BY engagement_rate_pct DESC
LIMIT 20
"""

# --- Tier 2 / F5: Audience Growth Drivers ---

# Net daily follower change. account_insights stores 'follows_and_unfollows'
# as net per-day rows (see service.fetch_account_insights).
GET_DAILY_FOLLOWS = """
SELECT
    toDate(end_time) AS day,
    toInt64(sum(metric_value)) AS daily_follows
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name = 'follows_and_unfollows'
  AND end_time >= {since:DateTime}
GROUP BY day
ORDER BY day
"""

# Daily total non-follower reach summed across posts published that day.
# Used by the growth-drivers correlation chart — pairs daily follow growth
# with daily non_follower_reach. Falls back to plain reach when the
# non_follower_reach breakdown hasn't synced yet (same convention as
# GET_POSTS_FOR_ATTRIBUTION).
GET_DAILY_REACH_BY_POST_DAY = """
SELECT
    toDate(m.timestamp) AS day,
    sum(toFloat64(metrics.reach)) AS daily_reach,
    sum(toFloat64(metrics.non_follower_reach)) AS daily_non_follower_reach
FROM instagram_media m FINAL
INNER JOIN (
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'non_follower_reach') AS non_follower_reach
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
GROUP BY day
ORDER BY day
"""

# Posts in the window with reach / non_follower_reach for attribution.
# `non_follower_reach` may be absent (the optional follow-up sync isn't wired
# yet) — the repo falls back to plain `reach` and tags the conversion rate as
# "rough estimate" in the UI.
GET_POSTS_FOR_ATTRIBUTION = """
SELECT
    m.ig_media_id,
    toDate(m.timestamp) AS post_day,
    m.permalink,
    m.thumbnail_url,
    m.caption,
    m.media_product_type,
    toFloat64(metrics.reach) AS reach,
    toFloat64(metrics.non_follower_reach) AS non_follower_reach
FROM instagram_media m FINAL
INNER JOIN (
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'non_follower_reach') AS non_follower_reach
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.media_product_type IN ('FEED', 'REELS')
"""

# --- Tier 2 / F2: Hashtag Performance ---

GET_TOP_HASHTAGS = """
SELECT
    h.hashtag,
    count(DISTINCT h.ig_media_id) AS post_count,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach * 100, metrics.reach > 0) AS avg_engagement_rate_pct,
    avgIf(metrics.saved / metrics.reach * 100, metrics.reach > 0) AS avg_save_rate_pct
FROM post_hashtags h FINAL
INNER JOIN instagram_media m FINAL
    ON m.ig_media_id = h.ig_media_id AND m.user_id = h.user_id
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON h.ig_media_id = metrics.ig_media_id AND h.user_id = metrics.user_id
WHERE h.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND h.timestamp >= {since:DateTime}
  AND h.timestamp <= {until:DateTime}
GROUP BY h.hashtag
HAVING post_count >= {min_uses:UInt8}
ORDER BY avg_engagement_rate_pct DESC
LIMIT {limit:UInt32}
"""

GET_HASHTAG_TREND = """
SELECT
    toStartOfWeek(h.timestamp) AS week_start,
    count(DISTINCT h.ig_media_id) AS posts_used,
    avg(metrics.reach) AS avg_reach,
    avgIf(metrics.total_interactions / metrics.reach * 100, metrics.reach > 0) AS avg_engagement_rate_pct
FROM post_hashtags h FINAL
INNER JOIN instagram_media m FINAL
    ON m.ig_media_id = h.ig_media_id AND m.user_id = h.user_id
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON h.ig_media_id = metrics.ig_media_id AND h.user_id = metrics.user_id
WHERE h.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND h.hashtag = {tag:String}
  AND h.timestamp >= {since:DateTime}
  AND h.timestamp <= {until:DateTime}
GROUP BY week_start
ORDER BY week_start
"""

# Co-occurring hashtag pairs ranked by combined engagement.
# `h1.hashtag < h2.hashtag` orders the pair and prevents counting (A,B) and (B,A) twice.
GET_HASHTAG_COMBOS = """
WITH post_engagement AS (
    SELECT
        m.ig_media_id, m.user_id,
        if(metrics.reach > 0, metrics.total_interactions / metrics.reach * 100, 0) AS engagement_pct
    FROM instagram_media m FINAL
    INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
        ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
    WHERE m.user_id = {user_id:UUID}
      AND m.ig_user_id = {ig_user_id:String}
      AND m.timestamp >= {since:DateTime}
      AND m.timestamp <= {until:DateTime}
)
SELECT
    h1.hashtag AS tag_a,
    h2.hashtag AS tag_b,
    count(DISTINCT h1.ig_media_id) AS cooccurrence_count,
    avg(pe.engagement_pct) AS avg_engagement_pct
FROM post_hashtags h1 FINAL
INNER JOIN post_hashtags h2 FINAL
    ON h1.user_id = h2.user_id
    AND h1.ig_media_id = h2.ig_media_id
INNER JOIN post_engagement pe
    ON pe.ig_media_id = h1.ig_media_id
    AND pe.user_id = h1.user_id
WHERE h1.user_id = {user_id:UUID}
  AND h1.timestamp >= {since:DateTime}
  AND h1.timestamp <= {until:DateTime}
  AND h1.hashtag < h2.hashtag
GROUP BY tag_a, tag_b
HAVING cooccurrence_count >= {min_uses:UInt8}
ORDER BY avg_engagement_pct DESC
LIMIT 50
"""

# --- Tier 2 / F4: Comment Sentiment ---

GET_SENTIMENT_SUMMARY = """
SELECT
    s.sentiment,
    count() AS total
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL
    ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
WHERE s.user_id = {user_id:UUID}
  AND s.is_spam = 0
  AND c.timestamp >= {since:DateTime}
  AND c.timestamp <= {until:DateTime}
GROUP BY s.sentiment
"""

GET_SENTIMENT_TREND = """
SELECT
    toStartOfWeek(c.timestamp) AS week_start,
    countIf(s.sentiment = 'positive') AS positive,
    countIf(s.sentiment = 'neutral') AS neutral,
    countIf(s.sentiment = 'negative') AS negative
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL
    ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
WHERE s.user_id = {user_id:UUID}
  AND s.is_spam = 0
  AND c.timestamp >= {since:DateTime}
  AND c.timestamp <= {until:DateTime}
GROUP BY week_start
ORDER BY week_start
"""

GET_TOPICS = """
SELECT
    cluster_id, label, size, sample_comment_ids, is_question
FROM comment_topics FINAL
WHERE user_id = {user_id:UUID}
  AND period_end >= {since:DateTime}
ORDER BY period_end DESC, size DESC
LIMIT 20
"""

GET_QUESTION_POSTS = """
SELECT
    c.ig_media_id,
    m.permalink,
    m.thumbnail_url,
    substring(m.caption, 1, 200) AS caption,
    m.timestamp,
    countIf(s.is_question = 1) AS question_count,
    count() AS total_comments
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL
    ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
INNER JOIN instagram_media m FINAL
    ON c.ig_media_id = m.ig_media_id AND c.user_id = m.user_id
WHERE s.user_id = {user_id:UUID}
  AND s.is_spam = 0
  AND c.timestamp >= {since:DateTime}
GROUP BY c.ig_media_id, m.permalink, m.thumbnail_url, caption, m.timestamp
HAVING question_count > 0
ORDER BY question_count DESC
LIMIT {limit:UInt32}
"""

GET_MEDIA_SENTIMENT_DISTRIBUTION = """
SELECT
    s.sentiment,
    count() AS total
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL
    ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
WHERE s.user_id = {user_id:UUID}
  AND c.ig_media_id = {ig_media_id:String}
  AND s.is_spam = 0
GROUP BY s.sentiment
"""

# Three sample comments per sentiment bucket — pick the most-liked.
GET_MEDIA_SENTIMENT_SAMPLES = """
SELECT
    c.ig_comment_id,
    c.username,
    substring(c.text, 1, 240) AS text,
    s.sentiment,
    c.like_count
FROM comment_sentiment s FINAL
INNER JOIN instagram_comments c FINAL
    ON s.ig_comment_id = c.ig_comment_id AND s.user_id = c.user_id
WHERE s.user_id = {user_id:UUID}
  AND c.ig_media_id = {ig_media_id:String}
  AND s.is_spam = 0
ORDER BY c.like_count DESC
LIMIT 30
"""

# Pull comments that don't have a sentiment row yet (or whose text changed).
# Used by the sentiment_batch job. The `<` against an UUID-typed empty string
# is intentional: ClickHouse left-join missing rows surface as ''.
GET_COMMENTS_PENDING_SENTIMENT = """
SELECT
    c.user_id, c.ig_comment_id, c.ig_media_id, c.text
FROM instagram_comments c FINAL
LEFT JOIN comment_sentiment s FINAL
    ON c.ig_comment_id = s.ig_comment_id AND c.user_id = s.user_id
WHERE s.ig_comment_id = ''
  AND length(c.text) > 0
ORDER BY c.timestamp DESC
LIMIT {limit:UInt32}
"""

# --- Tier 2 / F3: Competitor Benchmarking ---

GET_COMPETITOR_HANDLES = """
SELECT
    handle, ig_user_id, display_name, profile_picture_url, consecutive_failures
FROM competitor_handles FINAL
WHERE user_id = {user_id:UUID}
  AND active = 1
ORDER BY added_at ASC
"""

GET_COMPETITOR_LATEST_SNAPSHOTS = """
SELECT
    handle,
    argMax(snapshot_date, fetched_at) AS snapshot_date,
    argMax(followers_count, fetched_at) AS followers_count,
    argMax(media_count, fetched_at) AS media_count,
    argMax(posts_last_7d, fetched_at) AS posts_last_7d,
    argMax(reels_last_7d, fetched_at) AS reels_last_7d,
    argMax(carousels_last_7d, fetched_at) AS carousels_last_7d,
    argMax(avg_likes_last_25, fetched_at) AS avg_likes_last_25,
    argMax(avg_comments_last_25, fetched_at) AS avg_comments_last_25,
    argMax(avg_engagement_rate_pct, fetched_at) AS avg_engagement_rate_pct
FROM competitor_snapshots FINAL
WHERE user_id = {user_id:UUID}
GROUP BY handle
"""

GET_COMPETITOR_TIMELINE = """
SELECT
    handle,
    snapshot_date,
    argMax(followers_count, fetched_at) AS followers_count
FROM competitor_snapshots FINAL
WHERE user_id = {user_id:UUID}
  AND snapshot_date >= {since_date:Date}
GROUP BY handle, snapshot_date
ORDER BY handle, snapshot_date
"""

# Counts each format for the authenticated user over the period.
# media_product_type='REELS' → reels. media_type='CAROUSEL_ALBUM' → carousel.
# everything else → image.
GET_SELF_CONTENT_MIX = """
SELECT
    countIf(media_product_type = 'REELS') AS reels,
    countIf(media_type = 'CAROUSEL_ALBUM') AS carousel,
    countIf(media_product_type != 'REELS' AND media_type != 'CAROUSEL_ALBUM') AS image,
    count() AS total
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND timestamp >= {since:DateTime}
"""

# Aggregated per-post counts for the authenticated user, used to derive a
# competitor-comparable SelfSnapshot (likes+comments/followers across last 25).
GET_SELF_LAST_25_POSTS = """
SELECT
    media_type,
    media_product_type,
    timestamp,
    like_count,
    comments_count
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
ORDER BY timestamp DESC
LIMIT 25
"""

# --- Tier 2 / F2: Branded Hashtag Tracking ---

GET_BRANDED_HASHTAGS = """
SELECT hashtag, ig_hashtag_id, active, last_synced_at
FROM branded_hashtags FINAL
WHERE user_id = {user_id:UUID}
  AND active = 1
ORDER BY added_at ASC
"""

GET_BRANDED_HASHTAGS_FOR_SYNC = """
SELECT user_id, hashtag, ig_hashtag_id
FROM branded_hashtags FINAL
WHERE active = 1
"""

# Mention list — most recent first, capped so the UI doesn't try to render
# thousands of rows at once.
#
# Migration 018 pivoted from Meta's hashtag search (inaccessible via the
# Instagram Login API token) to scanning the user's own data. Migration 019
# added a `source` column so a single response can mix two kinds of rows:
#   - 'post': your own caption used the tag
#   - 'comment': a commenter on your post used the tag
GET_BRANDED_HASHTAG_MENTIONS = """
SELECT
    ig_comment_id, ig_media_id, permalink, username, text,
    like_count, timestamp, source
FROM branded_hashtag_comment_mentions FINAL
WHERE user_id = {user_id:UUID}
  AND hashtag = {hashtag:String}
  AND timestamp >= {since:DateTime}
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
"""

GET_BRANDED_HASHTAG_MENTION_COUNTS = """
SELECT
    hashtag,
    count() AS mention_count,
    sum(like_count) AS total_likes,
    countDistinct(username) AS unique_authors,
    max(timestamp) AS latest_mention
FROM branded_hashtag_comment_mentions FINAL
WHERE user_id = {user_id:UUID}
  AND timestamp >= {since:DateTime}
GROUP BY hashtag
"""

# Scan instagram_comments for any comment whose text mentions a given
# branded hashtag (case-insensitive). Joins to instagram_media so the
# resulting mention row carries the permalink of the post it lives under.
# Spaces or word boundaries before the # avoid matching `#mybrandX` when
# the brand is `mybrand` (positionCaseInsensitive('foo#mybrandextra', '#mybrand')
# returns a match, but the substring check is followed by a non-alphanumeric
# guard in Python because ClickHouse regex on toLower is slower than this
# simpler combo).
SCAN_COMMENTS_FOR_BRANDED_HASHTAG = """
SELECT
    c.ig_comment_id,
    c.ig_media_id,
    c.username,
    c.text,
    c.like_count,
    c.timestamp,
    m.permalink AS permalink
FROM instagram_comments c FINAL
LEFT JOIN instagram_media m FINAL
    ON m.ig_media_id = c.ig_media_id AND m.user_id = c.user_id
WHERE c.user_id = {user_id:UUID}
  AND positionCaseInsensitive(c.text, {needle:String}) > 0
"""

# Posts (captions) where the authenticated user themselves used the brand
# tag. Joins post_hashtags (lowercased extraction) to instagram_media for
# permalink + caption + post-level like count. Each row becomes a 'post'
# source mention.
SCAN_POSTS_FOR_BRANDED_HASHTAG = """
SELECT
    h.ig_media_id,
    m.permalink AS permalink,
    m.caption AS caption,
    m.like_count AS like_count,
    h.timestamp AS timestamp
FROM post_hashtags h FINAL
INNER JOIN instagram_media m FINAL
    ON m.ig_media_id = h.ig_media_id AND m.user_id = h.user_id
WHERE h.user_id = {user_id:UUID}
  AND h.hashtag = {hashtag:String}
"""
