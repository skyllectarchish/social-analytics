-- Inbox upgrade: brand-collab inquiry flag, scored by the sentiment_batch job
-- alongside sentiment/question/spam. Backfilled lazily — old rows stay 0 and
-- the inbox query supplements with a keyword heuristic.
ALTER TABLE comment_sentiment ADD COLUMN IF NOT EXISTS is_collab UInt8 DEFAULT 0;
