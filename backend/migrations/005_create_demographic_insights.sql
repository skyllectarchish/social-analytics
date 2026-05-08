CREATE TABLE IF NOT EXISTS demographic_insights (
    id UUID,
    user_id UUID,
    ig_user_id String,
    metric_name String,
    dimension_key String,
    dimension_value String,
    metric_value Int64,
    timeframe String,
    fetched_at DateTime,
    updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, ig_user_id, metric_name, dimension_key, dimension_value, timeframe);
