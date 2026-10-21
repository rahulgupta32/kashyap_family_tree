DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_comments WHERE moderation_version>1 OR removal_kind IN ('AUTHOR','MODERATOR','CASE')) THEN
 RAISE EXCEPTION 'Comment restoration evidence exists; export and reconcile before rollback';
 END IF;
END $$;
ALTER TABLE community_comments DROP COLUMN removal_kind;
ALTER TABLE community_comments DROP COLUMN moderation_version;
