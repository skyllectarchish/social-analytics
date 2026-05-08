CREATE TABLE IF NOT EXISTS media_insights (
    id UUID,
    user_id UUID,
    ig_media_id String,
    metric_name String,
    metric_value Float64,
    fetched_at DateTime,
    updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, ig_media_id, metric_name);
