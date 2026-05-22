-- Tier 4: per-call AI quota usage. One row per LLM invocation. The
-- /api/ai/quota endpoint aggregates count() over the current calendar
-- month. cost_usd_micros = USD * 1e6 (integer micros) so we can sum
-- without floating-point drift.
CREATE TABLE IF NOT EXISTS ai_quota_usage (
    user_id          UUID,
    call_id          UUID,                       -- unique per invocation
    feature          LowCardinality(String),     -- 'digest' | 'digest_auto' | 'ideas' | 'diagnostic' | 'caption'
    model            LowCardinality(String),
    input_tokens     UInt32 DEFAULT 0,
    output_tokens    UInt32 DEFAULT 0,
    cache_read_tokens UInt32 DEFAULT 0,
    cache_write_tokens UInt32 DEFAULT 0,
    cost_usd_micros  UInt64 DEFAULT 0,
    called_at        DateTime DEFAULT now(),
    updated_at       DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, called_at, call_id);
