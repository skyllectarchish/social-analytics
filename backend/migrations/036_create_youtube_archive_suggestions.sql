CREATE TABLE IF NOT EXISTS youtube_archive_suggestions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    video_id String,
    original_title String,
    trending_topic String,
    wikipedia_spike_pct Float64,
    autocomplete_matches Array(String),
    suggestion_type LowCardinality(String),
    llm_recommendation String,
    generated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(generated_at)
ORDER BY (user_id, video_id)
SETTINGS index_granularity = 8192;
