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
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'views')) AS views,
       toInt64(sumIf(mi.metric_value, mi.metric_name = 'total_interactions')) AS interactions
FROM media_insights mi FINAL
JOIN instagram_media m FINAL ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE mi.user_id = {user_id:UUID}
GROUP BY mi.ig_media_id, m.media_type, m.permalink, m.caption
ORDER BY interactions DESC
LIMIT {limit:UInt32}
"""
