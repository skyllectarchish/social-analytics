-- Tier 2 / F4: comments synced from /{media-id}/comments + .../replies.
CREATE TABLE IF NOT EXISTS instagram_comments (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_media_id String,
    ig_comment_id String,
    parent_comment_id String DEFAULT '',  -- '' for top-level comments
    username String DEFAULT '',
    text String,
    like_count UInt32 DEFAULT 0,
    timestamp DateTime,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, ig_media_id, ig_comment_id);
