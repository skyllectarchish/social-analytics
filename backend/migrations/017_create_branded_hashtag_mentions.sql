-- Tier 2 / F2: public media that mentioned a tracked branded hashtag.
-- Populated by the weekly branded_hashtag_sync job. Meta caps hashtag
-- queries at about 30 per IG user per 7 days, hence the weekly cadence.
--
-- A post can mention multiple tracked hashtags, so the primary key is
-- user_id, hashtag, ig_media_id.
CREATE TABLE IF NOT EXISTS branded_hashtag_mentions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    hashtag String,
    ig_media_id String,
    media_type String DEFAULT '',
    permalink String DEFAULT '',
    caption String DEFAULT '',
    like_count UInt64 DEFAULT 0,
    comments_count UInt64 DEFAULT 0,
    timestamp DateTime DEFAULT toDateTime(0),
    fetched_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, hashtag, ig_media_id);
