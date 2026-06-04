CREATE TABLE IF NOT EXISTS youtube_videos (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    yt_channel_id String,
    video_id String,
    title String DEFAULT '',
    description String DEFAULT '',
    thumbnail_url String DEFAULT '',
    published_at DateTime,
    duration_seconds UInt32 DEFAULT 0,
    video_format LowCardinality(String) DEFAULT '',
    view_count UInt64 DEFAULT 0,
    like_count UInt64 DEFAULT 0,
    comment_count UInt64 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, yt_channel_id, video_id)
SETTINGS index_granularity = 8192;
