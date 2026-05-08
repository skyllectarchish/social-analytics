CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT generateUUIDv4(),
    email String,
    username String,
    hashed_password String,
    is_active UInt8 DEFAULT 1,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id)
SETTINGS index_granularity = 8192;

ALTER TABLE users ADD INDEX IF NOT EXISTS idx_email (email) TYPE bloom_filter GRANULARITY 1;
