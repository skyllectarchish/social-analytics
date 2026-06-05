CREATE TABLE IF NOT EXISTS youtube_competitor_videos (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    competitor_channel_id String,
    video_id String,
    title String,
    description String,
    thumbnail_url String,
    published_at DateTime,
    view_count UInt64,
    llm_analysis Nullable(String),
    is_outlier Bool DEFAULT false,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, competitor_channel_id, video_id)
SETTINGS index_granularity = 8192;
