-- Tier 4: telemetry sink. Append-only — never edited — so we use a
-- plain MergeTree rather than ReplacingMergeTree. The split between
-- ts (client-reported event time) and received_at (server ingest time)
-- lets us spot pipeline lag.
CREATE TABLE IF NOT EXISTS ai_events (
    event_id   UUID DEFAULT generateUUIDv4(),
    user_id    UUID,
    ts         DateTime,
    feature    LowCardinality(String),
    action     LowCardinality(String),
    ref_id     String DEFAULT '',
    meta_json  String DEFAULT '',
    latency_ms UInt32 DEFAULT 0,
    received_at DateTime DEFAULT now()
) ENGINE = MergeTree
ORDER BY (user_id, ts);
