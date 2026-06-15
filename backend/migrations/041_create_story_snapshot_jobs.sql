-- Tracks the story-snapshot job's health per user so the Stories page can show
-- "last captured Xh ago" and surface silent failures (e.g. a token that lost
-- the stories permission). Both the scheduled story_snapshot job and the inline
-- snapshot during a manual /insights/sync write a row here.
--
-- One row per user: ReplacingMergeTree on (user_id) keeps only the freshest run
-- (by updated_at), so the status read uses FINAL. A successful run with zero
-- live stories still records 'completed' — that's a healthy "checked, nothing
-- live" heartbeat, not a failure.
CREATE TABLE IF NOT EXISTS story_snapshot_jobs (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    status String,                          -- 'completed' | 'failed'
    stories_captured UInt32 DEFAULT 0,
    error String DEFAULT '',
    ran_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id);
