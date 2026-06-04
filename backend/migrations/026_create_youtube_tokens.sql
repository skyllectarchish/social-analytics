CREATE TABLE IF NOT EXISTS youtube_tokens (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    refresh_token String,
    connected_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, yt_channel_id)
SETTINGS index_granularity = 8192;
