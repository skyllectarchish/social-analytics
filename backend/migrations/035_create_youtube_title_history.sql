CREATE TABLE IF NOT EXISTS youtube_title_history (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    channel_id String,
    video_id String,
    title_text String,
    observed_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, channel_id, video_id, observed_at)
SETTINGS index_granularity = 8192;
