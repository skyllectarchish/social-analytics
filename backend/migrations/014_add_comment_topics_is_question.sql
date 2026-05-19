-- Tier 2 / F4: tag a topic cluster as a "question topic" so the FE can render
-- a HelpCircle icon next to questions like "where's your dress from?". The
-- topic_clustering job sets this when >50% of the cluster's comments have
-- is_question=1 in comment_sentiment.
ALTER TABLE comment_topics ADD COLUMN IF NOT EXISTS is_question UInt8 DEFAULT 0;
