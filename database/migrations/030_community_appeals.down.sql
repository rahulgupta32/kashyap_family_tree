DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_moderation_decisions) THEN
  RAISE EXCEPTION 'Moderation evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE community_post_appeals;
DROP TABLE community_moderation_decisions;
