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
"""

GET_INSTAGRAM_MEDIA_PAGE = """
SELECT ig_media_id, media_type, media_url, thumbnail_url, permalink,
       caption, timestamp, like_count, comments_count, media_product_type
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
ORDER BY timestamp DESC
LIMIT {limit:UInt32} OFFSET {offset:UInt32}
"""

GET_ALL_INSTAGRAM_MEDIA_FOR_INSIGHTS = """
SELECT ig_media_id, media_product_type
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
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
"""

GET_FOLLOWER_GROWTH = """
SELECT
    sum(metric_value) AS net_follower_change
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name = 'follows_and_unfollows'
  AND end_time >= {since:DateTime}
"""

GET_TOP_PERFORMING_MEDIA = """
SELECT mi.ig_media_id, m.media_type, m.permalink, m.caption,
       m.thumbnail_url, m.media_url,
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'views')) AS views,
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'total_interactions')) AS interactions
FROM media_insights mi FINAL
JOIN instagram_media m FINAL ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE mi.user_id = {user_id:UUID}
GROUP BY mi.ig_media_id, m.media_type, m.permalink, m.caption, m.thumbnail_url, m.media_url
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
  AND m.timestamp >= {since:DateTime}
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
    if(metrics.reach > 0, metrics.saved / metrics.reach, 0) AS save_rate,
    if(metrics.reach > 0, metrics.shares / metrics.reach, 0) AS share_rate,
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
LIMIT {limit:UInt32}
"""

GET_ALGORITHM_METRICS_SUMMARY = """
SELECT
    sumIf(metric_value, metric_name = 'saves') AS total_saves,
    sumIf(metric_value, metric_name = 'shares') AS total_shares,
    sumIf(metric_value, metric_name = 'reach') AS total_reach,
    if(sumIf(metric_value, metric_name = 'reach') > 0,
       sumIf(metric_value, metric_name = 'saves') / sumIf(metric_value, metric_name = 'reach'), 0
    ) AS account_save_rate,
    if(sumIf(metric_value, metric_name = 'reach') > 0,
       sumIf(metric_value, metric_name = 'shares') / sumIf(metric_value, metric_name = 'reach'), 0
    ) AS account_share_rate
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND end_time >= {since:DateTime}
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
  AND m.timestamp >= {since:DateTime}
  AND toDayOfWeek(m.timestamp) = {day_of_week:UInt8}
  AND toHour(m.timestamp) = {hour_of_day:UInt8}
ORDER BY engagement_rate_pct DESC
LIMIT 20
"""
