CREATE TABLE IF NOT EXISTS youtube_retention_annotations (
    user_id UUID,
    video_id String,
    timestamp_seconds UInt32,
    annotation_text String DEFAULT '',
    drop_pct Float32 DEFAULT 0,
    model LowCardinality(String) DEFAULT '',
    generated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(generated_at)
ORDER BY (user_id, video_id, timestamp_seconds)
SETTINGS index_granularity = 8192;
