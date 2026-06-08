CREATE TABLE IF NOT EXISTS youtube_competitors (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    competitor_channel_id String,
    competitor_title String,
    competitor_thumbnail_url String,
    webhook_active Bool DEFAULT false,
    is_deleted Bool DEFAULT false,
    added_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, competitor_channel_id)
SETTINGS index_granularity = 8192;
