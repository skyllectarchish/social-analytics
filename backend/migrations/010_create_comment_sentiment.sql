-- Tier 2 / F4: per-comment sentiment + question/spam flags + optional embedding.
-- `sentiment` stored as a String (not Enum) so ALTER additions ("mixed") don't
-- require a migration. We constrain values at write time.
CREATE TABLE IF NOT EXISTS comment_sentiment (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    ig_comment_id String,
    ig_media_id String,
    sentiment String,                     -- 'positive' | 'neutral' | 'negative'
    score Float32 DEFAULT 0,              -- -1..+1 normalized
    is_question UInt8 DEFAULT 0,
    is_spam UInt8 DEFAULT 0,
    language String DEFAULT '',
    embedding Array(Float32) DEFAULT [],  -- empty until embedding job runs
    model String DEFAULT '',
    computed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(computed_at)
ORDER BY (user_id, ig_comment_id);
