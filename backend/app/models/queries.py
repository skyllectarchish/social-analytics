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

# Every connected account — drives the daily account_sync job.
GET_ALL_INSTAGRAM_TOKENS = """
SELECT user_id, ig_user_id, access_token, token_expires_at
FROM instagram_profiles FINAL
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

# Used by the media-image proxy to resolve a single media's stored CDN URL,
# scoped to the requesting user. Prefers the video thumbnail, falls back to the
# image media_url. FINAL collapses the ReplacingMergeTree dupes (the table has
# no updated_at column — dedup is handled by FINAL, as in GET_INSTAGRAM_MEDIA_PAGE).
GET_MEDIA_IMAGE_URL = """
SELECT thumbnail_url, media_url
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_media_id = {ig_media_id:String}
LIMIT 1
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

# --- AI content factory ---

# Question comments for the audience-demand miner. Excludes spam; synthetic
# demo rows are excluded unless include_demo=1 (used to demo the feature
# before Meta App Review unlocks real comment data).
GET_QUESTION_COMMENTS = """
SELECT c.text, c.ig_media_id, coalesce(m.caption, '') AS media_caption
FROM instagram_comments c FINAL
INNER JOIN comment_sentiment s FINAL
    ON s.user_id = c.user_id AND s.ig_comment_id = c.ig_comment_id
LEFT JOIN instagram_media m FINAL
    ON m.user_id = c.user_id AND m.ig_media_id = c.ig_media_id
WHERE c.user_id = {user_id:UUID}
  AND s.is_question = 1
  AND s.is_spam = 0
  AND ({include_demo:UInt8} = 1 OR c.ig_comment_id NOT LIKE 'synth_%')
  AND c.timestamp >= {since:DateTime}
ORDER BY c.timestamp DESC
LIMIT {limit:UInt32}
"""

# Weekly average engagement (likes + comments per post) per format — feeds
# the deterministic format-fatigue detector. Uses instagram_media counts so
# it works even where per-media insights are blocked by Meta.
GET_WEEKLY_FORMAT_ENGAGEMENT = """
SELECT
    toStartOfWeek(timestamp) AS week,
    multiIf(
        media_product_type = 'REELS', 'REELS',
        media_type = 'CAROUSEL_ALBUM', 'CAROUSEL',
        'IMAGE'
    ) AS format,
    count() AS posts,
    avg(like_count + comments_count) AS avg_engagement
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND media_product_type != 'STORY'
  AND timestamp >= {since:DateTime}
GROUP BY week, format
ORDER BY format, week
"""

# --- Data-export archive import ---

GET_ARCHIVE_SUMMARY = """
SELECT
    (SELECT count() FROM archive_posts FINAL WHERE user_id = {user_id:UUID}) AS posts,
    (SELECT min(taken_at) FROM archive_posts FINAL WHERE user_id = {user_id:UUID}) AS posts_from,
    (SELECT count() FROM archive_stories FINAL WHERE user_id = {user_id:UUID}) AS stories,
    (SELECT min(taken_at) FROM archive_stories FINAL WHERE user_id = {user_id:UUID}) AS stories_from,
    (SELECT count() FROM follower_events FINAL WHERE user_id = {user_id:UUID}) AS followers,
    (SELECT min(followed_at) FROM follower_events FINAL WHERE user_id = {user_id:UUID}) AS followers_from
"""

# Cumulative follower curve by month — the real historical growth line the
# Graph API can never provide (it has no per-follower timestamps at all).
GET_ARCHIVE_FOLLOWER_GROWTH = """
SELECT month, joins, sum(joins) OVER (ORDER BY month) AS cumulative
FROM (
    SELECT toStartOfMonth(followed_at) AS month, count() AS joins
    FROM follower_events FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY month
)
ORDER BY month
"""

GET_ARCHIVE_CONTENT_BY_MONTH = """
SELECT month, sumIf(n, kind = 'post') AS posts, sumIf(n, kind = 'story') AS stories
FROM (
    SELECT toStartOfMonth(taken_at) AS month, 'post' AS kind, count() AS n
    FROM archive_posts FINAL WHERE user_id = {user_id:UUID} GROUP BY month
    UNION ALL
    SELECT toStartOfMonth(taken_at) AS month, 'story' AS kind, count() AS n
    FROM archive_stories FINAL WHERE user_id = {user_id:UUID} GROUP BY month
)
GROUP BY month
ORDER BY month
"""

# --- Comment inbox ---

# Brand-collab inquiry heuristic — supplements the LLM-scored `is_collab`
# flag so comments scored before migration 035 (or not yet batch-scored)
# still surface under the Collabs filter. Substring match, case-insensitive.
_COLLAB_KEYWORDS_SQL = (
    "['collab', 'partnership', 'sponsor', 'brand deal', 'work with you', "
    "'work together', 'ambassador', 'business inquiry', 'paid promotion', "
    "'promote our']"
)

# A comment counts as a collab inquiry when the LLM flagged it OR the
# heuristic matches. Shared between the SELECT column and the filter.
_COMMENT_IS_COLLAB_EXPR = (
    "(coalesce(s.is_collab, 0) = 1 "
    f"OR multiSearchAnyCaseInsensitive(c.text, {_COLLAB_KEYWORDS_SQL}) > 0)"
)

# Filters are parameterized as "off" sentinels ('' / 0) so one centralized
# query serves every filter combination without dynamic SQL. Spam (per the
# sentiment batch) is always excluded; the creator's own top-level comments
# are excluded via self_username. `replied` = the creator has a reply under
# the comment (their own replies are synced like any other comment).
# Synthetic demo rows (seed_demo_sentiment, ig_comment_id 'synth_*') are
# excluded — the inbox is an action surface and replying to them would 400
# at Meta; they remain visible in the Audience Voice demo sections.
_COMMENT_INBOX_FILTERS = f"""
WHERE c.user_id = {{user_id:UUID}}
  AND c.parent_comment_id = ''
  AND c.username != {{self_username:String}}
  AND c.ig_comment_id NOT LIKE 'synth_%'
  AND coalesce(s.is_spam, 0) = 0
  AND ({{sentiment:String}} = '' OR s.sentiment = {{sentiment:String}})
  AND ({{questions_only:UInt8}} = 0 OR s.is_question = 1)
  AND ({{unanswered_only:UInt8}} = 0 OR coalesce(r.my_replies, 0) = 0)
  AND ({{collab_only:UInt8}} = 0 OR {_COMMENT_IS_COLLAB_EXPR})
"""

_COMMENT_INBOX_JOINS = """
FROM instagram_comments c FINAL
LEFT JOIN comment_sentiment s FINAL
    ON s.user_id = c.user_id AND s.ig_comment_id = c.ig_comment_id
LEFT JOIN (
    SELECT parent_comment_id,
           countIf(username = {self_username:String}) AS my_replies
    FROM instagram_comments FINAL
    WHERE user_id = {user_id:UUID} AND parent_comment_id != ''
    GROUP BY parent_comment_id
) r ON r.parent_comment_id = c.ig_comment_id
LEFT JOIN instagram_media m FINAL
    ON m.user_id = c.user_id AND m.ig_media_id = c.ig_media_id
"""

GET_COMMENT_INBOX = f"""
SELECT
    c.ig_comment_id,
    c.ig_media_id,
    c.username,
    c.text,
    c.like_count,
    c.timestamp,
    coalesce(s.sentiment, '') AS sentiment,
    coalesce(s.is_question, 0) AS is_question,
    coalesce(r.my_replies, 0) > 0 AS replied,
    coalesce(m.permalink, '') AS permalink,
    {_COMMENT_IS_COLLAB_EXPR} AS is_collab
{_COMMENT_INBOX_JOINS}
{_COMMENT_INBOX_FILTERS}
ORDER BY c.timestamp DESC
LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
"""

COUNT_COMMENT_INBOX = f"""
SELECT count()
{_COMMENT_INBOX_JOINS}
{_COMMENT_INBOX_FILTERS}
"""

# One comment + its post context — reply validation and the AI suggester.
GET_COMMENT_WITH_CONTEXT = """
SELECT c.ig_comment_id, c.ig_media_id, c.username, c.text,
       coalesce(s.sentiment, '') AS sentiment,
       coalesce(s.is_question, 0) AS is_question,
       coalesce(m.caption, '') AS media_caption
FROM instagram_comments c FINAL
LEFT JOIN comment_sentiment s FINAL
    ON s.user_id = c.user_id AND s.ig_comment_id = c.ig_comment_id
LEFT JOIN instagram_media m FINAL
    ON m.user_id = c.user_id AND m.ig_media_id = c.ig_media_id
WHERE c.user_id = {user_id:UUID}
  AND c.ig_comment_id = {ig_comment_id:String}
  AND c.ig_comment_id NOT LIKE 'synth_%'
LIMIT 1
"""

# The creator's most recent replies — voice samples for the AI suggester.
GET_RECENT_SELF_REPLIES = """
SELECT text
FROM instagram_comments FINAL
WHERE user_id = {user_id:UUID}
  AND parent_comment_id != ''
  AND username = {self_username:String}
  AND ig_comment_id NOT LIKE 'synth_%'
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
"""

# --- Superfans (repeat engagers) ---

# Top commenters over a window: distinct comments + distinct posts touched.
# A "superfan" is anyone clearing the min_comments/min_posts thresholds —
# repeat engagement across multiple posts, not one comment storm under a
# single viral post. Replies count too (engaging in threads is engagement).
GET_SUPERFANS = """
SELECT
    c.username,
    count(DISTINCT c.ig_comment_id) AS comment_count,
    count(DISTINCT c.ig_media_id) AS posts_touched,
    sum(c.like_count) AS total_likes,
    max(c.timestamp) AS last_comment_at,
    avg(coalesce(s.score, 0)) AS avg_sentiment_score
FROM instagram_comments c FINAL
LEFT JOIN comment_sentiment s FINAL
    ON s.user_id = c.user_id AND s.ig_comment_id = c.ig_comment_id
WHERE c.user_id = {user_id:UUID}
  AND c.username != {self_username:String}
  AND c.username != ''
  AND c.ig_comment_id NOT LIKE 'synth_%'
  AND coalesce(s.is_spam, 0) = 0
  AND c.timestamp >= {since:DateTime}
GROUP BY c.username
HAVING comment_count >= {min_comments:UInt8}
   AND posts_touched >= {min_posts:UInt8}
ORDER BY comment_count DESC, total_likes DESC
LIMIT {limit:UInt32}
"""

# --- Anomaly alerts ---

# Recent posts with their organic engagement (likes + comments straight off
# instagram_media — populated even when per-media insights are blocked, e.g.
# posts that predate the Business-account conversion). Stories excluded:
# they expire in 24h and have no like counts.
GET_POST_ENGAGEMENT_WINDOW = """
SELECT ig_media_id, permalink, caption, timestamp,
       like_count + comments_count AS engagement
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND media_product_type != 'STORY'
  AND timestamp >= {since:DateTime}
ORDER BY timestamp DESC
"""

# Trailing-post engagement baseline for the overperformance median.
GET_POST_ENGAGEMENT_BASELINE = """
SELECT like_count + comments_count AS engagement
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND media_product_type != 'STORY'
  AND timestamp < {before:DateTime}
ORDER BY timestamp DESC
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
    round(avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_engagement_rate,
    round(avgIf(metrics.saved / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_save_rate,
    round(avgIf(metrics.shares / metrics.reach, metrics.reach > 0) * 100, 2) AS avg_share_rate
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

# Same heatmap, additionally split by media_product_type (FEED vs REELS) so
# the FE can offer an All/Reels/Feed toggle without re-querying.
GET_BEST_TIME_BY_FORMAT = """
SELECT
    m.media_product_type,
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
GROUP BY m.media_product_type, day_of_week, hour_of_day
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

#: Account-wide save/share rates over a date window.
#:
#: `saved` and `shares` are per-media metrics in Meta's API (NOT
#: account-level), so we aggregate them from media_insights joined to
#: instagram_media for window-scoping. The denominator (`reach`) IS available
#: at the account level — sum it from account_insights so the percentage
#: doesn't double-count viewers who saw multiple of the user's posts.
GET_ALGORITHM_METRICS_SUMMARY = """
WITH
    media_totals AS (
        SELECT
            sumIf(mi.metric_value, mi.metric_name = 'saved') AS total_saves,
            sumIf(mi.metric_value, mi.metric_name = 'shares') AS total_shares
        FROM media_insights mi FINAL
        INNER JOIN (
            SELECT ig_media_id
            FROM instagram_media FINAL
            WHERE user_id = {user_id:UUID}
              AND ig_user_id = {ig_user_id:String}
              AND timestamp >= {since:DateTime}
              AND timestamp <= {until:DateTime}
        ) m ON mi.ig_media_id = m.ig_media_id
        WHERE mi.user_id = {user_id:UUID}
    ),
    account_totals AS (
        SELECT sumIf(metric_value, metric_name = 'reach') AS total_reach
        FROM account_insights FINAL
        WHERE user_id = {user_id:UUID}
          AND ig_user_id = {ig_user_id:String}
          AND end_time >= {since:DateTime}
          AND end_time <= {until:DateTime}
    )
SELECT
    media_totals.total_saves AS total_saves,
    media_totals.total_shares AS total_shares,
    account_totals.total_reach AS total_reach,
    if(account_totals.total_reach > 0,
       media_totals.total_saves / account_totals.total_reach * 100, 0
    ) AS account_save_rate,
    if(account_totals.total_reach > 0,
       media_totals.total_shares / account_totals.total_reach * 100, 0
    ) AS account_share_rate
FROM media_totals, account_totals
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
        sumIf(metric_value, metric_name = 'profile_visits') AS profile_visits
        -- `reposts` was dropped from Meta's media insights API (see constants.py)
        -- so the aggregation is also removed here; no caller reads it.
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
  AND end_time <= {until:DateTime}
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
  AND m.timestamp <= {until:DateTime}
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
  AND m.timestamp <= {until:DateTime}
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
ORDER BY c.timestamp DESC
LIMIT 5000
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


# --- Tier 4: AI Copilot ---

# Read the cached weekly digest for (user_id, week_of). Returns one row or none.
GET_AI_DIGEST = """
SELECT week_of, status, cached, narrative_md, bullets_json, followups_json,
       metrics_snapshot, generated_at
FROM ai_digests FINAL
WHERE user_id = {user_id:UUID}
  AND week_of = {week_of:Date}
LIMIT 1
"""

# Aggregate AI calls in the current calendar month (UTC). 'digest_auto' is
# excluded because the scheduled weekly digest is system-charged, not
# user-charged.
GET_AI_QUOTA_USED_THIS_MONTH = """
SELECT count() AS used
FROM ai_quota_usage
WHERE user_id = {user_id:UUID}
  AND called_at >= toStartOfMonth(now())
  AND feature != 'digest_auto'
"""

# Idempotent on (user_id, feature, ref_id) thanks to ReplacingMergeTree —
# repeat submits collapse to the latest row at merge time.
GET_AI_FEEDBACK = """
SELECT rating, note, updated_at
FROM ai_feedback FINAL
WHERE user_id = {user_id:UUID}
  AND feature = {feature:String}
  AND ref_id = {ref_id:String}
LIMIT 1
"""

# Inserts use the client.insert(table, rows, column_names=[...]) helper
# from clickhouse-connect — see ai/quota.py, ai/feedback.py, ai/telemetry.py.
# No raw INSERT strings here, matching the project convention.

# Posts published in the digest week, with per-post metric aggregates
# from media_insights. Caption is truncated to 200 chars in Python (we
# don't trim in SQL because ClickHouse Strings can be long-ish; trimming
# saves token spend, not query cost).
GET_DIGEST_WEEK_POSTS = """
SELECT
    m.ig_media_id,
    m.media_type,
    m.permalink,
    m.caption,
    m.timestamp,
    m.like_count,
    m.comments_count,
    toInt64(sumIf(mi.metric_value, mi.metric_name = 'reach')) AS reach,
    toInt64(sumIf(mi.metric_value, mi.metric_name = 'views')) AS views,
    toInt64(sumIf(mi.metric_value, mi.metric_name = 'saved')) AS saves,
    toInt64(sumIf(mi.metric_value, mi.metric_name = 'shares')) AS shares,
    toInt64(sumIf(mi.metric_value, mi.metric_name = 'total_interactions')) AS interactions
FROM instagram_media m FINAL
LEFT JOIN media_insights mi FINAL
    ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp < {until:DateTime}
GROUP BY m.ig_media_id, m.media_type, m.permalink, m.caption,
         m.timestamp, m.like_count, m.comments_count
ORDER BY m.timestamp DESC
"""

# Aggregate engagement signals over a single window. Used twice in the
# digest loader — once for the requested week, once for the prior week —
# so we can compute period-over-period deltas.
GET_DIGEST_WINDOW_AGGREGATES = """
SELECT
    count(DISTINCT m.ig_media_id) AS posts_count,
    sumIf(mi.metric_value, mi.metric_name = 'reach') AS total_reach,
    sumIf(mi.metric_value, mi.metric_name = 'saved') AS total_saves,
    sumIf(mi.metric_value, mi.metric_name = 'shares') AS total_shares,
    sumIf(mi.metric_value, mi.metric_name = 'total_interactions') AS total_interactions
FROM instagram_media m FINAL
LEFT JOIN media_insights mi FINAL
    ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp < {until:DateTime}
"""

# Net follower change inside a date window. Reads from `account_insights`
# follows_and_unfollows series — same source the dashboard uses.
GET_DIGEST_FOLLOWER_DELTA = """
SELECT
    toInt64(sum(metric_value)) AS net_change
FROM account_insights FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND metric_name = 'follows_and_unfollows'
  AND end_time >= {since:DateTime}
  AND end_time < {until:DateTime}
"""

# Best (peak-engagement) hour over a window. Used twice — week + prior
# 60d baseline — to detect cadence drift.
GET_DIGEST_PEAK_HOUR = """
SELECT
    toHour(m.timestamp) AS hour,
    sum(mi.metric_value) AS total_interactions,
    count(DISTINCT m.ig_media_id) AS posts
FROM instagram_media m FINAL
INNER JOIN media_insights mi FINAL
    ON mi.ig_media_id = m.ig_media_id AND mi.user_id = m.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND mi.metric_name = 'total_interactions'
  AND m.timestamp >= {since:DateTime}
  AND m.timestamp < {until:DateTime}
GROUP BY hour
HAVING posts > 0
ORDER BY total_interactions DESC
LIMIT 1
"""

# Average save_rate per media_type over a window. Used to detect format
# regressions ("carousel save rate dropped 18%"). We compute the rate
# per post then average — matches how the dashboard renders it.
GET_DIGEST_FORMAT_RATES = """
SELECT
    m.media_type,
    avgIf(metrics.saved / metrics.reach, metrics.reach > 0) AS avg_save_rate,
    avgIf(metrics.shares / metrics.reach, metrics.reach > 0) AS avg_share_rate,
    avgIf(metrics.total_interactions / metrics.reach, metrics.reach > 0) AS avg_engagement_rate,
    count(DISTINCT m.ig_media_id) AS posts
FROM instagram_media m FINAL
INNER JOIN (
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
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
  AND m.timestamp < {until:DateTime}
GROUP BY m.media_type
HAVING posts > 0
"""

# Sample-size gate. Used to short-circuit the digest with
# status='not_enough_data' instead of charging an LLM call for a creator
# who has barely posted.
GET_DIGEST_POSTS_COUNT_SINCE = """
SELECT count(DISTINCT ig_media_id) AS posts
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND timestamp >= {since:DateTime}
"""

# Scheduled weekly digest job — list every (user_id, ig_user_id) with at
# least one post in the trailing 30 days. The job loops over these and
# synthesizes per-user digests; the sufficiency check inside
# digest.has_enough_data() then filters out anyone too thin.
LIST_USERS_WITH_RECENT_ACTIVITY = """
SELECT
    p.user_id,
    p.ig_user_id
FROM instagram_profiles p FINAL
INNER JOIN (
    -- DISTINCT already dedupes (user_id, ig_user_id); FINAL would force a
    -- full table merge of instagram_media first which gets expensive on
    -- multi-million-row corpora and is unnecessary for this read.
    SELECT DISTINCT user_id, ig_user_id
    FROM instagram_media
    WHERE timestamp >= {since:DateTime}
) m ON m.user_id = p.user_id AND m.ig_user_id = p.ig_user_id
"""

# Admin cost dashboard — daily/feature/model breakdown of LLM spend
# from ai_quota_usage. Used by GET /api/admin/ai-cost (Phase F).
GET_AI_COST_BREAKDOWN = """
SELECT
    toDate(called_at) AS day,
    feature,
    model,
    count() AS calls,
    sum(input_tokens) AS input_tokens,
    sum(output_tokens) AS output_tokens,
    sum(cache_read_tokens) AS cache_read_tokens,
    sum(cache_write_tokens) AS cache_write_tokens,
    sum(cost_usd_micros) AS cost_usd_micros
FROM ai_quota_usage
WHERE called_at >= {since:DateTime}
  AND called_at < {until:DateTime}
GROUP BY day, feature, model
ORDER BY day DESC, cost_usd_micros DESC
"""

# --- Phase C: Content Ideas ---

# Cache read. The 6h freshness check happens in Python — this just
# returns the latest row (or none).
GET_AI_IDEAS_CACHE = """
SELECT response_json, themes_json, generated_at
FROM ai_ideas FINAL
WHERE user_id = {user_id:UUID}
  AND period_days = {period_days:UInt16}
  AND limit_n = {limit_n:UInt16}
LIMIT 1
"""

# Top-N posts ranked by algorithm score over a trailing window. We
# inline the same algorithm-score formula used elsewhere
# (shares * 0.4 + saves * 0.35 + likes * 0.15 + comments * 0.10) / reach.
GET_IDEAS_TOP_POSTS = """
SELECT
    m.ig_media_id,
    m.media_type,
    m.permalink,
    m.thumbnail_url,
    substring(m.caption, 1, 240) AS caption_preview,
    m.timestamp,
    toInt64(metrics.reach) AS reach,
    toInt64(metrics.likes) AS likes,
    toInt64(metrics.saved) AS saves,
    toInt64(metrics.shares) AS shares,
    toInt64(metrics.total_interactions) AS interactions,
    round(if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35
         + metrics.likes * 0.15 + metrics.comments * 0.10)
        / metrics.reach * 100, 0), 2) AS algorithm_score_pct
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
ORDER BY algorithm_score_pct DESC
LIMIT {limit:UInt32}
"""

# Hashtag distribution across all of the user's posts in the trailing
# window. Powers the adjacency check — themes the user already uses are
# "in-distribution"; themes that appear only in newly-proposed ideas
# become adjacent flags.
GET_IDEAS_HISTORICAL_HASHTAGS = """
SELECT
    h.hashtag,
    count(DISTINCT h.ig_media_id) AS post_count
FROM post_hashtags h FINAL
INNER JOIN instagram_media m FINAL
    ON m.ig_media_id = h.ig_media_id AND m.user_id = h.user_id
WHERE h.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.timestamp >= {since:DateTime}
GROUP BY h.hashtag
ORDER BY post_count DESC
LIMIT {limit:UInt32}
"""

# --- Phase D: Post Diagnostic ---

# Cache read. The 5-minute freshness check happens in Python.
GET_AI_DIAGNOSTIC_CACHE = """
SELECT response_json, generated_at
FROM ai_diagnostics FINAL
WHERE user_id = {user_id:UUID}
  AND ig_media_id = {ig_media_id:String}
LIMIT 1
"""

# Pull the target post + its pivoted metrics. Single-row read used to
# (a) check eligibility (≥24h old) and (b) populate the `observed` half
# of the response.
GET_DIAGNOSTIC_TARGET_POST = """
SELECT
    m.ig_media_id,
    m.media_type,
    m.permalink,
    m.thumbnail_url,
    m.caption,
    m.timestamp,
    toInt64(metrics.reach) AS reach,
    toInt64(metrics.likes) AS likes,
    toInt64(metrics.saved) AS saves,
    toInt64(metrics.shares) AS shares,
    toInt64(metrics.comments) AS comments,
    toInt64(metrics.total_interactions) AS interactions,
    toFloat64(metrics.avg_watch_time) AS avg_watch_time
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_media_id = {ig_media_id:String}
LIMIT 1
"""

# Rolling 60-post baseline for the user, EXCLUDING the target post.
# Median rather than mean because Instagram engagement is heavy-tailed.
# We use quantileExact so the values are stable across calls — important
# for the prompt cache (any drift here breaks the cached prefix).
GET_DIAGNOSTIC_BASELINE = """
SELECT
    quantileExact(0.5)(toFloat64(reach)) AS median_reach,
    quantileExact(0.5)(if(reach > 0, total_interactions / reach * 100, 0)) AS median_er_pct,
    quantileExact(0.5)(if(reach > 0, saved / reach * 100, 0)) AS median_save_rate_pct,
    quantileExact(0.5)(if(reach > 0, shares / reach * 100, 0)) AS median_share_rate_pct,
    count() AS sample_size
FROM (
    SELECT
        m.ig_media_id,
        metrics.reach AS reach,
        metrics.saved AS saved,
        metrics.shares AS shares,
        metrics.total_interactions AS total_interactions
    FROM instagram_media m FINAL
    INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
        ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
    WHERE m.user_id = {user_id:UUID}
      AND m.ig_user_id = {ig_user_id:String}
      AND m.ig_media_id != {target_ig_media_id:String}
    ORDER BY m.timestamp DESC
    LIMIT 60
)
"""

# Same shape as the all-format baseline but scoped to one media_type —
# powers the "Reels outperform Carousels 2.1x for this account" factor.
GET_DIAGNOSTIC_FORMAT_BASELINE = """
SELECT
    quantileExact(0.5)(toFloat64(reach)) AS median_reach,
    quantileExact(0.5)(if(reach > 0, total_interactions / reach * 100, 0)) AS median_er_pct,
    quantileExact(0.5)(if(reach > 0, saved / reach * 100, 0)) AS median_save_rate_pct,
    count() AS sample_size
FROM (
    SELECT
        m.ig_media_id,
        metrics.reach AS reach,
        metrics.saved AS saved,
        metrics.total_interactions AS total_interactions
    FROM instagram_media m FINAL
    INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
        ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
    WHERE m.user_id = {user_id:UUID}
      AND m.ig_user_id = {ig_user_id:String}
      AND m.media_type = {media_type:String}
      AND m.ig_media_id != {target_ig_media_id:String}
    ORDER BY m.timestamp DESC
    LIMIT 60
)
"""

# Hour-of-day distribution across the user's last 60 posts. The
# diagnostic uses this to detect "posted at 3am vs your 11am sweet spot"
# style observations.
GET_DIAGNOSTIC_HOUR_DISTRIBUTION = """
SELECT
    toHour(m.timestamp) AS hour,
    count(DISTINCT m.ig_media_id) AS posts,
    avg(if(metrics.reach > 0, metrics.total_interactions / metrics.reach * 100, 0)) AS avg_er_pct,
    avg(metrics.reach) AS avg_reach
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.ig_media_id != {target_ig_media_id:String}
GROUP BY hour
HAVING posts > 0
ORDER BY hour
"""

# Hashtags used on the target post, joined with the user's overall
# usage frequency. Powers "5 of 8 hashtags are over-used / broad" type
# observations.
GET_DIAGNOSTIC_POST_HASHTAGS = """
WITH per_tag AS (
    -- Pre-aggregate the user's total post count per hashtag once, then join
    -- onto the target-post's tags. O(N) instead of the prior LEFT-JOIN self-
    -- cross which is O(N^2) for heavy hashtag corpora.
    SELECT hashtag, countDistinct(ig_media_id) AS uses
    FROM post_hashtags FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY hashtag
)
SELECT
    h.hashtag,
    -- Subtract this post's single use so "user_uses" measures *other* posts.
    greatest(per_tag.uses - 1, 0) AS user_uses
FROM post_hashtags h FINAL
LEFT JOIN per_tag ON per_tag.hashtag = h.hashtag
WHERE h.user_id = {user_id:UUID}
  AND h.ig_media_id = {ig_media_id:String}
ORDER BY user_uses DESC
"""

# Optional — sentiment summary if the comment_sentiment table has rows
# for this post. Returns one row at most (or empty if no comments yet).
GET_DIAGNOSTIC_SENTIMENT_SUMMARY = """
SELECT
    countIf(sentiment = 'positive') AS positive,
    countIf(sentiment = 'neutral') AS neutral,
    countIf(sentiment = 'negative') AS negative,
    countIf(is_question = 1) AS questions,
    count() AS total
FROM comment_sentiment FINAL
WHERE user_id = {user_id:UUID}
  AND ig_media_id = {ig_media_id:String}
"""

# --- Phase E: Caption Studio ---

# Top-N captions for a given format, ranked by algorithm score over the
# user's full posting history. The format → media_type/media_product_type
# predicate is inlined here so callers pass a single {format:String}.
# Captions are returned untruncated; the service layer redacts PII and
# truncates per token budget.
GET_CAPTION_TOP_CAPTIONS = """
SELECT
    m.ig_media_id,
    m.media_type,
    m.media_product_type,
    m.caption,
    m.timestamp,
    toInt64(metrics.reach) AS reach,
    toInt64(metrics.saved) AS saves,
    toInt64(metrics.shares) AS shares,
    toInt64(metrics.likes) AS likes,
    toInt64(metrics.comments) AS comments,
    toInt64(metrics.total_interactions) AS interactions,
    round(if(metrics.reach > 0,
        (metrics.shares * 0.4 + metrics.saved * 0.35
         + metrics.likes * 0.15 + metrics.comments * 0.10)
        / metrics.reach * 100, 0), 2) AS algorithm_score_pct
FROM instagram_media m FINAL
INNER JOIN (""" + PIVOTED_MEDIA_METRICS + """) metrics
    ON m.ig_media_id = metrics.ig_media_id AND m.user_id = metrics.user_id
WHERE m.user_id = {user_id:UUID}
  AND m.ig_user_id = {ig_user_id:String}
  AND m.caption != ''
  AND (
        ({format:String} = 'REELS'    AND m.media_product_type = 'REELS')
     OR ({format:String} = 'CAROUSEL' AND m.media_type = 'CAROUSEL_ALBUM')
     OR ({format:String} = 'IMAGE'    AND m.media_type = 'IMAGE'
                                       AND m.media_product_type != 'STORY')
     OR ({format:String} = 'STORY'    AND m.media_product_type = 'STORY')
  )
ORDER BY algorithm_score_pct DESC
LIMIT {limit:UInt32}
"""

# --- Phase F (Tier 2): sentiment-pipeline diagnostics ---
# Used by GET /api/instagram/insights/sentiment/diagnose to explain why the
# Audience Voice section may be empty (most often: Meta hasn't approved
# Advanced Access for instagram_business_manage_comments).

COUNT_IG_COMMENTS_FROM_MEDIA = """
SELECT toInt64(sum(comments_count))
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
"""

COUNT_STORED_COMMENTS = """
SELECT count()
FROM instagram_comments FINAL
WHERE user_id = {user_id:UUID}
"""

COUNT_STORED_COMMENT_SENTIMENT = """
SELECT count()
FROM comment_sentiment FINAL
WHERE user_id = {user_id:UUID}
"""

COUNT_STORED_COMMENT_TOPICS = """
SELECT count()
FROM comment_topics FINAL
WHERE user_id = {user_id:UUID}
"""

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

# ── YouTube Phase 2 ──────────────────────────────────────────────────────────

# --- Competitors ---

GET_YT_COMPETITORS = """
SELECT competitor_channel_id, competitor_title, competitor_thumbnail_url,
       webhook_active, added_at
FROM youtube_competitors FINAL
WHERE user_id = {user_id:UUID}
  AND is_deleted = false
ORDER BY added_at DESC
"""

COUNT_YT_COMPETITORS = """
SELECT count()
FROM youtube_competitors FINAL
WHERE user_id = {user_id:UUID}
  AND is_deleted = false
"""

# --- Competitor Videos ---

GET_YT_COMPETITOR_VIDEOS_FOR_BASELINE = """
SELECT video_id, view_count, published_at, title, thumbnail_url,
       llm_analysis, is_outlier
FROM youtube_competitor_videos FINAL
WHERE user_id = {user_id:UUID}
  AND competitor_channel_id = {competitor_channel_id:String}
ORDER BY published_at DESC
LIMIT 30
"""

GET_YT_COMPETITOR_OUTLIERS = """
SELECT v.competitor_channel_id, v.video_id, v.title, v.thumbnail_url,
       v.view_count, v.published_at, v.llm_analysis
FROM youtube_competitor_videos v FINAL
WHERE v.user_id = {user_id:UUID}
  AND v.is_outlier = true
ORDER BY v.published_at DESC
LIMIT 50
"""

GET_YT_RECENT_COMPETITOR_VIDEOS = """
SELECT v.competitor_channel_id, v.video_id, v.title, v.thumbnail_url,
       v.view_count, v.published_at, v.llm_analysis
FROM youtube_competitor_videos v FINAL
WHERE v.user_id = {user_id:UUID}
ORDER BY v.view_count DESC, v.published_at DESC
LIMIT 50
"""

# --- Velocity ---

GET_YT_VELOCITY = """
SELECT hours_since_publish, view_count, avg_watch_s, ctr_pct, checked_at
FROM youtube_competitor_velocity FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY hours_since_publish ASC
"""

# Own-channel videos are also stored in youtube_competitor_velocity with the
# user's own yt_channel_id as channel_id. This JOIN retrieves 4h velocity
# data for own videos to train the predictive model.
GET_YT_OWN_VELOCITY_SAMPLES = """
SELECT v.video_id, vel.view_count AS four_hour_views,
       vel.avg_watch_s AS four_hour_avg_watch_s, vel.ctr_pct,
       toUInt64(v.view_count) AS final_views
FROM youtube_videos v FINAL
JOIN youtube_competitor_velocity vel FINAL
  ON vel.video_id = v.video_id
     AND vel.user_id = v.user_id
     AND vel.hours_since_publish = 4
WHERE v.user_id = {user_id:UUID}
  AND v.view_count > 0
  AND toDate(v.published_at) <= today() - 30
ORDER BY v.published_at DESC
LIMIT 100
"""

# --- Title History ---

GET_YT_TITLE_HISTORY = """
SELECT title_text, observed_at
FROM youtube_title_history
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY observed_at ASC
"""

GET_YT_LAST_OBSERVED_TITLE = """
SELECT title_text
FROM youtube_title_history
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY observed_at DESC
LIMIT 1
"""

# --- Archive Suggestions ---

GET_YT_ARCHIVE_SUGGESTIONS = """
SELECT video_id, original_title, trending_topic, wikipedia_spike_pct,
       autocomplete_matches, suggestion_type, llm_recommendation, generated_at
FROM youtube_archive_suggestions FINAL
WHERE user_id = {user_id:UUID}
ORDER BY generated_at DESC
"""

GET_YT_LAST_ARCHIVE_SCAN = """
SELECT max(generated_at) AS last_scan
FROM youtube_archive_suggestions FINAL
WHERE user_id = {user_id:UUID}
"""

# --- Predictions ---

GET_YT_PREDICTION = """
SELECT video_id, four_hour_views, four_hour_avg_watch_s, ctr_pct,
       predicted_30d_views, predicted_low, predicted_high,
       revenue_low_usd, revenue_high_usd, predicted_at
FROM youtube_predictions FINAL
WHERE user_id = {user_id:UUID}
  AND video_id = {video_id:String}
ORDER BY predicted_at DESC
LIMIT 1
"""

# --- Alerts ---

GET_YT_ALERTS = """
SELECT id, video_id, alert_type, alert_body, is_read, created_at
FROM youtube_alerts
WHERE user_id = {user_id:UUID}
ORDER BY created_at DESC
LIMIT 20
"""

# --- Model State ---

GET_YT_MODEL_STATE = """
SELECT coefficients_json, intercept, r2_score, training_sample_size, trained_at
FROM youtube_model_state FINAL
WHERE user_id = {user_id:UUID}
ORDER BY trained_at DESC
LIMIT 1
"""

# --- Cross-Platform ---

GET_YT_DAILY_SUBSCRIBER_NET = """
SELECT
    toDate(end_time) AS day,
    sumIf(metric_value, metric_name = 'subscribersGained') AS gained,
    sumIf(metric_value, metric_name = 'subscribersLost') AS lost
FROM youtube_daily_metrics FINAL
WHERE user_id = {user_id:UUID}
  AND end_time >= {start_date:DateTime}
GROUP BY day
ORDER BY day ASC
"""

GET_INSTAGRAM_REEL_POSTS = """
SELECT toDate(timestamp) AS post_date, ig_media_id, thumbnail_url, caption
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND media_product_type = 'REELS'
  AND timestamp >= {start_date:DateTime}
ORDER BY post_date ASC
"""
# --- Story analytics retention ---

# Snapshotted stories joined with their insights (stored in media_insights,
# same as every other media). LEFT JOIN: a story snapshotted moments before
# expiry may have no insights row yet — show it with zeroed metrics rather
# than dropping it.

GET_STORY_HISTORY = """
SELECT
    s.ig_media_id,
    s.media_type,
    s.permalink,
    s.timestamp,
    toInt64(metrics.reach) AS reach,
    toInt64(metrics.views) AS views,
    toInt64(metrics.replies) AS replies,
    toInt64(metrics.shares) AS shares,
    toInt64(metrics.total_interactions) AS interactions,
    toInt64(metrics.navigation) AS navigation
FROM instagram_stories s FINAL
LEFT JOIN (
    SELECT
        ig_media_id, user_id,
        sumIf(metric_value, metric_name = 'reach') AS reach,
        sumIf(metric_value, metric_name = 'views') AS views,
        sumIf(metric_value, metric_name = 'replies') AS replies,
        sumIf(metric_value, metric_name = 'shares') AS shares,
        sumIf(metric_value, metric_name = 'total_interactions') AS total_interactions,
        sumIf(metric_value, metric_name = 'navigation') AS navigation
    FROM media_insights FINAL
    WHERE user_id = {user_id:UUID}
    GROUP BY ig_media_id, user_id
) metrics ON s.ig_media_id = metrics.ig_media_id AND s.user_id = metrics.user_id
WHERE s.user_id = {user_id:UUID}
  AND s.ig_user_id = {ig_user_id:String}
  AND s.timestamp >= {since:DateTime}
ORDER BY s.timestamp DESC
LIMIT {limit:UInt32}
"""

COUNT_STORY_HISTORY = """
SELECT count()
FROM instagram_stories FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND timestamp >= {since:DateTime}
"""

# --- Comment-to-DM keyword funnels ---

GET_DM_FUNNELS = """
SELECT funnel_id, keyword, dm_message, public_reply, ig_media_id, created_at
FROM dm_funnels FINAL
WHERE user_id = {user_id:UUID}
  AND active = 1
ORDER BY created_at ASC
"""

GET_DM_FUNNEL_BY_ID = """
SELECT funnel_id, keyword, dm_message, public_reply, ig_media_id, created_at
FROM dm_funnels FINAL
WHERE user_id = {user_id:UUID}
  AND funnel_id = {funnel_id:String}
  AND active = 1
LIMIT 1
"""

# Every active funnel across all users — drives the dm_funnel_runner job.
# created_at matters: the runner only triggers on comments posted AFTER the
# funnel existed (no retroactive DM blasts).
GET_ALL_ACTIVE_DM_FUNNELS = """
SELECT user_id, funnel_id, keyword, dm_message, public_reply, ig_media_id, created_at
FROM dm_funnels FINAL
WHERE active = 1
"""

# Comment ids this user has already been funnel-processed for — dedup guard
# so one comment never receives two DMs (even failed attempts are final;
# retry storms against Meta's messaging API are worse than a missed DM).
GET_DM_FUNNEL_SENT_COMMENT_IDS = """
SELECT DISTINCT ig_comment_id
FROM dm_funnel_sends
WHERE user_id = {user_id:UUID}
"""

GET_DM_FUNNEL_SEND_COUNTS = """
SELECT
    funnel_id,
    countIf(status = 'sent') AS sent_count,
    countIf(status = 'failed') AS failed_count,
    max(sent_at) AS last_sent_at
FROM dm_funnel_sends FINAL
WHERE user_id = {user_id:UUID}
GROUP BY funnel_id
"""

GET_DM_FUNNEL_RECENT_SENDS = """
SELECT funnel_id, keyword, ig_comment_id, ig_media_id,
       commenter_username, comment_text, status, error, sent_at
FROM dm_funnel_sends FINAL
WHERE user_id = {user_id:UUID}
ORDER BY sent_at DESC
LIMIT {limit:UInt32}
"""

# Recent comment-eligible media for the funnel runner. Private replies are
# only allowed within 7 days of the comment, so older posts rarely matter —
# but commenters do dig into the back catalog, hence a generous window.
GET_RECENT_MEDIA_FOR_FUNNELS = """
SELECT ig_media_id
FROM instagram_media FINAL
WHERE user_id = {user_id:UUID}
  AND ig_user_id = {ig_user_id:String}
  AND media_product_type IN ('FEED', 'REELS')
  AND timestamp >= {since:DateTime}
ORDER BY timestamp DESC
LIMIT {limit:UInt32}
"""
