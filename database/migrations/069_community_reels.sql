ALTER TABLE community_posts ADD COLUMN comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE community_post_media ADD COLUMN reel_duration_seconds NUMERIC
  CHECK (reel_duration_seconds > 0 AND reel_duration_seconds <= 300);
ALTER TABLE media_upload_intents DROP CONSTRAINT media_upload_intents_byte_size_check;
ALTER TABLE media_upload_intents ADD CONSTRAINT media_upload_intents_byte_size_check
  CHECK (byte_size > 0 AND byte_size <= CASE
    WHEN bucket = 'private-community' AND mime_type = 'video/mp4' THEN 20971520
    ELSE 10485760
  END);
