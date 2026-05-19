-- Tier 2 / F2: denormalized hashtag rows extracted from instagram_media.caption.
-- ORDER BY (user_id, hashtag, ig_media_id) is chosen because hashtag lookups
-- ("show me #morningroutine across my posts") are the dominant query pattern.
CREATE TABLE IF NOT EXISTS post_hashtags (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_media_id String,
    hashtag String,                       -- lowercase, without leading #
    position UInt16,                      -- char offset in the caption
    timestamp DateTime,                   -- copied from instagram_media for fast filtering
    media_product_type String DEFAULT '',
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, hashtag, ig_media_id);
