CREATE TABLE IF NOT EXISTS youtube_predictions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    four_hour_views UInt64,
    four_hour_avg_watch_s Float64,
    ctr_pct Float64,
    predicted_30d_views UInt64,
    predicted_low UInt64,
    predicted_high UInt64,
    revenue_low_usd Float64,
    revenue_high_usd Float64,
    predicted_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(predicted_at)
ORDER BY (user_id, video_id)
SETTINGS index_granularity = 8192;
