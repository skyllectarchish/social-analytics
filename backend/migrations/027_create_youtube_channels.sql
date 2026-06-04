CREATE TABLE IF NOT EXISTS youtube_channels (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    title String DEFAULT '',
    description String DEFAULT '',
    thumbnail_url String DEFAULT '',
    subscriber_count UInt64 DEFAULT 0,
    video_count UInt64 DEFAULT 0,
    view_count UInt64 DEFAULT 0,
    hidden_subscriber_count UInt8 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id)
SETTINGS index_granularity = 8192;
