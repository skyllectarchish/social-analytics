CREATE TABLE IF NOT EXISTS youtube_daily_metrics (
    user_id UUID,
    yt_channel_id String,
    metric_name LowCardinality(String),
    metric_value Float64 DEFAULT 0,
    end_time DateTime
) ENGINE = ReplacingMergeTree(end_time)
ORDER BY (user_id, yt_channel_id, metric_name, end_time)
SETTINGS index_granularity = 8192;
