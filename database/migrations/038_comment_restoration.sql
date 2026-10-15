ALTER TABLE community_comments ADD COLUMN moderation_version INTEGER NOT NULL DEFAULT 1 CHECK(moderation_version>0);
ALTER TABLE community_comments ADD COLUMN removal_kind VARCHAR(20) CHECK(removal_kind IN ('AUTHOR','MODERATOR','CASE','LEGACY_UNKNOWN'));
UPDATE community_comments SET removal_kind='LEGACY_UNKNOWN' WHERE deleted_at IS NOT NULL;
