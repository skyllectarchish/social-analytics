CREATE TABLE IF NOT EXISTS youtube_alerts (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    alert_type LowCardinality(String),
    alert_body String,
    is_read Bool DEFAULT false,
    created_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (user_id, video_id, created_at)
SETTINGS index_granularity = 8192;
