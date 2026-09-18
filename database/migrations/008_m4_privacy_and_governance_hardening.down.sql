-- Rollback Migration 008
DROP TABLE IF EXISTS auth_challenges CASCADE;
DROP TABLE IF EXISTS media_deletion_queue CASCADE;
ALTER TABLE data_retention_records DROP COLUMN IF EXISTS released_at;
ALTER TABLE data_retention_records DROP COLUMN IF EXISTS released_by;
ALTER TABLE data_retention_records DROP COLUMN IF EXISTS review_scheduled_at;
ALTER TABLE media_assets DROP COLUMN IF EXISTS scan_evidence;
ALTER TABLE persons DROP CONSTRAINT IF EXISTS chk_persons_profile_visibility;
ALTER TABLE persons DROP COLUMN IF EXISTS profile_visibility;
