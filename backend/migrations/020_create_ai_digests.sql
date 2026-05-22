-- Tier 4: cached weekly AI digests. Keyed by (user_id, week_of) — each
-- regenerate writes a fresh row that ReplacingMergeTree dedupes on merge.
-- Reads use FINAL or ORDER BY updated_at DESC LIMIT 1.
CREATE TABLE IF NOT EXISTS ai_digests (
    user_id            UUID,
    week_of            Date,                       -- Monday of the synthesized week
    status             LowCardinality(String),     -- 'ready' | 'stale' | 'generating' | 'not_enough_data'
    cached             UInt8,                      -- 1 if served from cache
    narrative_md       String,
    bullets_json       String,                     -- JSON-encoded bullet array
    followups_json     String,                     -- JSON-encoded string array
    metrics_snapshot   String,                     -- JSON
    model              LowCardinality(String),
    prompt_hash        String,                     -- sha256 of the rendered prompt
    input_tokens       UInt32 DEFAULT 0,
    output_tokens      UInt32 DEFAULT 0,
    cache_read_tokens  UInt32 DEFAULT 0,
    cache_write_tokens UInt32 DEFAULT 0,
    latency_ms         UInt32 DEFAULT 0,
    generated_at       DateTime,
    updated_at         DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, week_of);
