ALTER TABLE youtube_title_history ADD COLUMN IF NOT EXISTS yt_channel_id String DEFAULT '' AFTER user_id;
