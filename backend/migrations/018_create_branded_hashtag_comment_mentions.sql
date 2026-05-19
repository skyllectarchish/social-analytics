-- Tier 2 / F2: comments that mention a tracked branded hashtag.
--
-- This replaces the original Meta-hashtag-search pipeline (branded_hashtag_mentions)
-- after we discovered that the Instagram Login API token type the app uses
-- does NOT have access to the ig_hashtag_search endpoint that path required
-- (only the Facebook Login flow does, and that needs a connected FB Page).
--
-- Instead, the sync job scans the instagram_comments corpus for comments
-- whose text contains the branded hashtag and writes each match into this
-- table. Mentions here are therefore comments on the user's OWN posts that
-- referenced the brand tag, not external public posts.
--
-- ORDER BY (user_id, hashtag, ig_comment_id) so ReplacingMergeTree dedupes
-- per (brand tag, distinct comment). A post with multiple comments mentioning
-- the same tag yields multiple rows here, one per comment.
CREATE TABLE IF NOT EXISTS branded_hashtag_comment_mentions (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    hashtag String,
    ig_comment_id String,
    ig_media_id String DEFAULT '',
    permalink String DEFAULT '',
    username String DEFAULT '',
    text String DEFAULT '',
    like_count UInt64 DEFAULT 0,
    timestamp DateTime DEFAULT toDateTime(0),
    fetched_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, hashtag, ig_comment_id);
