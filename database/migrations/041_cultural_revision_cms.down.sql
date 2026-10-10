DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM cultural_documents) THEN
  RAISE EXCEPTION 'Cultural revision evidence exists; export/reconcile before rollback';
 END IF;
END $$;
DROP TABLE cultural_revision_events;
ALTER TABLE cultural_documents DROP CONSTRAINT cultural_published_revision_fk;
DROP TABLE cultural_revisions;
DROP TABLE cultural_documents;
