-- Tier 4 / Phase D: per-post diagnostic cache. 5-minute soft TTL — the
-- same post + same baseline rarely shifts within 5 minutes, and this
-- saves us re-running synthesis when the user accidentally closes and
-- re-opens the drawer. ReplacingMergeTree(updated_at) dedupes on merge.
CREATE TABLE IF NOT EXISTS ai_diagnostics (
    user_id            UUID,
    ig_media_id        String,
    response_json      String,                 -- full DiagnosticResponse payload
    underperformed     UInt8,
    factor_count       UInt16,
    model              LowCardinality(String),
    prompt_hash        String,
    input_tokens       UInt32 DEFAULT 0,
    output_tokens      UInt32 DEFAULT 0,
    cache_read_tokens  UInt32 DEFAULT 0,
    cache_write_tokens UInt32 DEFAULT 0,
    latency_ms         UInt32 DEFAULT 0,
    generated_at       DateTime,
    updated_at         DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, ig_media_id);
