-- Tracks insights-sync runs so the frontend can poll for completion instead of
-- guessing with a fixed delay. POST /insights/sync inserts a 'running' row; the
-- background task closes it out with a 'completed'/'failed' row carrying the
-- same job_id. ReplacingMergeTree on (user_id, job_id) collapses the two inserts
-- to the freshest state (by updated_at), so the status read uses FINAL.
CREATE TABLE IF NOT EXISTS instagram_sync_jobs (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    job_id String,                          -- app-generated uuid4 hex, one per run
    status String,                          -- 'running' | 'completed' | 'failed'
    lookback_days UInt16 DEFAULT 0,
    error String DEFAULT '',
    started_at DateTime DEFAULT now(),
    finished_at Nullable(DateTime) DEFAULT NULL,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, job_id);
