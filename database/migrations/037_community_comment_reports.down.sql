DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_comment_reports) THEN
 RAISE EXCEPTION 'Comment report evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE community_comment_reports;
