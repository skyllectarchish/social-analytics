CREATE TABLE IF NOT EXISTS youtube_retention_curves (
    user_id UUID,
    yt_channel_id String,
    video_id String,
    elapsed_video_time_ratio Float32,
    audience_watch_ratio Float32 DEFAULT 0,
    relative_retention_performance Float32 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id, video_id, elapsed_video_time_ratio)
SETTINGS index_granularity = 8192;
