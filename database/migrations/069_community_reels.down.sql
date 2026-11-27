ALTER TABLE community_post_media DROP COLUMN reel_duration_seconds;
ALTER TABLE community_posts DROP COLUMN comments_enabled;
ALTER TABLE media_upload_intents DROP CONSTRAINT media_upload_intents_byte_size_check;
-- Retain provenance for prior reel writes when rolling back application code.
ALTER TABLE media_upload_intents ADD CONSTRAINT media_upload_intents_byte_size_check
  CHECK (byte_size > 0 AND byte_size <= 10485760) NOT VALID;
