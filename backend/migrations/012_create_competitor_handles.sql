-- Tier 2 / F3: handles a user is tracking. Soft-deleted by flipping active=0
-- so historical snapshots remain queryable.
CREATE TABLE IF NOT EXISTS competitor_handles (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    handle String,                       -- lowercase, no leading '@'
    ig_user_id String DEFAULT '',        -- resolved on first business_discovery lookup
    display_name String DEFAULT '',
    profile_picture_url String DEFAULT '',
    active UInt8 DEFAULT 1,
    added_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, handle);
