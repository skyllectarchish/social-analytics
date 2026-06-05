-- One model state per user. ORDER BY (user_id) means ReplacingMergeTree keeps only the latest trained model.
CREATE TABLE IF NOT EXISTS youtube_model_state (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    coefficients_json String,
    intercept Float64,
    r2_score Float64,
    training_sample_size UInt16,
    trained_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(trained_at)
ORDER BY (user_id)
SETTINGS index_granularity = 8192;
