-- Tier 2 / F3 edge case "Competitor becomes private". When the daily
-- competitor_sync job hits a 400 / private / personal-account response three
-- runs in a row, mark the handle inactive so we stop hitting the Graph API.
-- Exposed on /competitors so the FE can render a stale-data indicator before
-- the auto-disable kicks in.
ALTER TABLE competitor_handles
    ADD COLUMN IF NOT EXISTS consecutive_failures UInt8 DEFAULT 0;
