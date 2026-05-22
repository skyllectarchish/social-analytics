-- Tier 4: thumbs feedback per AI artifact. ReplacingMergeTree on
-- (user_id, feature, ref_id) means a re-submit with a different rating
-- updates the existing record on merge. Reads use FINAL.
CREATE TABLE IF NOT EXISTS ai_feedback (
    user_id    UUID,
    feature    LowCardinality(String),     -- 'digest' | 'ideas' | 'diagnostic' | 'caption'
    ref_id     String,                     -- week_of / idea.id / ig_media_id / caption-hash
    rating     LowCardinality(String),     -- 'up' | 'down'
    note       String DEFAULT '',
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, feature, ref_id);
