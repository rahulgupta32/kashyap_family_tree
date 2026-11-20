DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_post_media) THEN
  RAISE EXCEPTION 'Retained community media must be exported and reconciled before rollback';
 END IF;
END $$;
DROP TABLE community_revision_media;
DROP TABLE community_post_media;
