-- Tier 2 / F4: LLM-labelled clusters produced by the weekly topic_clustering job.
CREATE TABLE IF NOT EXISTS comment_topics (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    cluster_id UInt32,
    label String,                          -- short title (e.g. "morning routine")
    sample_comment_ids Array(String),      -- 3-5 representative ig_comment_ids
    size UInt32,                           -- comments in cluster
    period_start DateTime,
    period_end DateTime,
    computed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
ORDER BY (user_id, cluster_id, period_start);
