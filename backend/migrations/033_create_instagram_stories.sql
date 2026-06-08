-- Story analytics retention: snapshot active stories before Meta expires them
-- (stories live 24h and the API's GET /{ig-user-id}/stories only returns live ones).
-- Story *insights* reuse the existing media_insights table — same
-- (user_id, ig_media_id, metric_name) shape as every other media row.
CREATE TABLE IF NOT EXISTS instagram_stories (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_user_id String,
    ig_media_id String,
    media_type String DEFAULT '',
    media_url String DEFAULT '',
    thumbnail_url String DEFAULT '',
    permalink String DEFAULT '',
    timestamp DateTime,
    fetched_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(fetched_at)
ORDER BY (user_id, ig_media_id);
