CREATE TABLE IF NOT EXISTS instagram_profiles (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_user_id String,
    username String,
    name String,
    biography String,
    profile_picture_url String,
    followers_count UInt64 DEFAULT 0,
    follows_count UInt64 DEFAULT 0,
    media_count UInt64 DEFAULT 0,
    access_token String,
    token_expires_at DateTime,
    connected_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, ig_user_id)
SETTINGS index_granularity = 8192;
