CREATE TABLE IF NOT EXISTS instagram_media (
    id UUID DEFAULT generateUUIDv4(),
    ig_media_id String,
    ig_user_id String,
    user_id UUID,
    media_type String,
    media_url String,
    thumbnail_url String DEFAULT '',
    permalink String,
    caption String DEFAULT '',
    timestamp DateTime,
    like_count UInt64 DEFAULT 0,
    comments_count UInt64 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, ig_user_id, ig_media_id)
SETTINGS index_granularity = 8192;
