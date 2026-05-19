-- Tier 2 / F2: hashtags a user is tracking as their own brand. The weekly
-- branded_hashtag_sync job pulls recent public media that mentioned each
-- active row and writes results to branded_hashtag_mentions. Soft-deleted by
-- flipping active=0 so historical mentions stay queryable.
--
-- ig_hashtag_id is resolved on first sync via ig_hashtag_search and cached
-- here so subsequent recent_media calls skip the search step.
CREATE TABLE IF NOT EXISTS branded_hashtags (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    hashtag String,
    ig_hashtag_id String DEFAULT '',
    active UInt8 DEFAULT 1,
    last_synced_at DateTime DEFAULT toDateTime(0),
    added_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, hashtag);
