CREATE TABLE IF NOT EXISTS youtube_competitor_velocity (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    channel_id String,
    video_id String,
    hours_since_publish UInt8,
    view_count UInt64,
    avg_watch_s Float64 DEFAULT 0,
    ctr_pct Float64 DEFAULT 0,
    checked_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(checked_at)
ORDER BY (user_id, channel_id, video_id, hours_since_publish)
SETTINGS index_granularity = 8192;
