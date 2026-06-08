-- Comment-to-DM keyword funnels ("comment LINK and I'll DM you").
-- A funnel maps a trigger keyword to a DM template (+ optional public reply).
-- Soft-delete via active=0 inserts (ReplacingMergeTree on funnel_id).
CREATE TABLE IF NOT EXISTS dm_funnels (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    funnel_id String,                -- app-generated stable id (uuid4 hex)
    keyword String,                  -- lowercased trigger keyword/phrase
    dm_message String,               -- private reply sent via /me/messages
    public_reply String DEFAULT '',  -- optional comment reply ("check your DMs!")
    ig_media_id String DEFAULT '',   -- scope to one post ('' = all posts)
    active UInt8 DEFAULT 1,
    created_at DateTime DEFAULT now(),
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (user_id, funnel_id);

-- One row per attempted DM. Keyed on (user, funnel, comment) so the runner can
-- dedupe — a comment is only ever DM'd once per funnel, even across restarts.
CREATE TABLE IF NOT EXISTS dm_funnel_sends (
    id UUID DEFAULT generateUUIDv4(),
    user_id UUID,
    funnel_id String,
    keyword String,
    ig_comment_id String,
    ig_media_id String,
    commenter_username String DEFAULT '',
    comment_text String DEFAULT '',
    status String,                   -- 'sent' | 'failed'
    error String DEFAULT '',
    sent_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(sent_at)
ORDER BY (user_id, funnel_id, ig_comment_id);
