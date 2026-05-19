-- Tier 2 / F3: one row per (user, handle, day). Daily competitor_sync job appends.
CREATE TABLE IF NOT EXISTS competitor_snapshots (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    handle String,
    snapshot_date Date,
    followers_count UInt64 DEFAULT 0,
    media_count UInt64 DEFAULT 0,
    posts_last_7d UInt32 DEFAULT 0,
    reels_last_7d UInt32 DEFAULT 0,
    carousels_last_7d UInt32 DEFAULT 0,
    avg_likes_last_25 Float32 DEFAULT 0,
    avg_comments_last_25 Float32 DEFAULT 0,
    avg_engagement_rate_pct Float32 DEFAULT 0,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, handle, snapshot_date);
