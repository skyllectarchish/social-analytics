-- Editorial trending-audio feed. Curated weekly from public roundups (Buffer,
-- Later, HeyOrca, etc.) and refreshed by hand — NOT scraped from Meta: the
-- Instagram Graph API exposes no trending-audio data at all. Global, not
-- user-scoped. ReplacingMergeTree on (week, rank) so re-publishing a week
-- overwrites it in place; reads take the most recent week.
CREATE TABLE IF NOT EXISTS trending_audio (
    id UUID DEFAULT generateUUIDv4(),
    week Date,                      -- Monday of the editorial week
    rank UInt8,                     -- 1..N within the week
    title String,
    artist String DEFAULT '',
    reels_count String DEFAULT '',  -- display string, e.g. "412K"
    delta String DEFAULT '',        -- display string, e.g. "+18%"
    use_case String DEFAULT '',     -- what creators use it for
    source String DEFAULT '',       -- editorial attribution
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (week, rank);
