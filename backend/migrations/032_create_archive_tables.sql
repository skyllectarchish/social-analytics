-- Instagram data-export ("Download your information") import tables.
-- Kept separate from the API-synced tables (instagram_media etc.) because
-- export rows have no IG media IDs — merging would corrupt API-keyed joins.

-- Posts parsed from content/posts_*.json
CREATE TABLE IF NOT EXISTS archive_posts (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    taken_at DateTime,
    caption String DEFAULT '',
    media_count UInt16 DEFAULT 1,
    imported_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(imported_at)
ORDER BY (user_id, taken_at, caption)
SETTINGS index_granularity = 8192;

-- Stories parsed from content/stories.json (the API only exposes live 24h stories)
CREATE TABLE IF NOT EXISTS archive_stories (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    taken_at DateTime,
    caption String DEFAULT '',
    imported_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(imported_at)
ORDER BY (user_id, taken_at)
SETTINGS index_granularity = 8192;

-- Follower list with follow timestamps from connections/followers_*.json.
-- Deduped per (user, follower) so re-imports refresh rather than duplicate.
CREATE TABLE IF NOT EXISTS follower_events (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    follower_username String,
    followed_at DateTime,
    imported_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(imported_at)
ORDER BY (user_id, follower_username)
SETTINGS index_granularity = 8192;
