CREATE TABLE IF NOT EXISTS account_insights (
    id UUID,
    user_id UUID,
    ig_user_id String,
    metric_name String,
    metric_value Int64,
    period String DEFAULT 'day',
    end_time DateTime,
    fetched_at DateTime,
    updated_at DateTime
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, ig_user_id, metric_name, end_time);
