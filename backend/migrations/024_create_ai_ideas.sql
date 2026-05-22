-- Tier 4 / Phase C: cached content-ideas responses. Keyed by
-- (user_id, period_days, limit_n) so a 90d/5-idea call and a 30d/5-idea
-- call live as separate cache rows. ReplacingMergeTree(updated_at)
-- dedupes on merge. Reads use FINAL and check generated_at against the
-- 6-hour soft-cache window in Python.
CREATE TABLE IF NOT EXISTS ai_ideas (
    user_id           UUID,
    period_days       UInt16,
    limit_n           UInt16,
    response_json     String,              -- full ContentIdeasResponse payload
    themes_json       String,              -- JSON array of themes detected
    model             LowCardinality(String),
    prompt_hash       String,
    input_tokens      UInt32 DEFAULT 0,
    output_tokens     UInt32 DEFAULT 0,
    cache_read_tokens  UInt32 DEFAULT 0,
    cache_write_tokens UInt32 DEFAULT 0,
    latency_ms        UInt32 DEFAULT 0,
    generated_at      DateTime,
    updated_at        DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, period_days, limit_n);
