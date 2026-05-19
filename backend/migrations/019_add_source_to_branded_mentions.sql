-- Tier 2 / F2: distinguish post-caption uses from commenter mentions in
-- branded_hashtag_comment_mentions. The original table only captured
-- comment-level matches; we now also include posts where the user
-- themselves used the brand tag in a caption.
-- Values: 'comment' (legacy default) or 'post' (your own caption used the tag).
ALTER TABLE branded_hashtag_comment_mentions ADD COLUMN IF NOT EXISTS source String DEFAULT 'comment';
