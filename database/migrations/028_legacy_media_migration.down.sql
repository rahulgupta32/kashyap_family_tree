DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM media_legacy_migration_queue) THEN
  RAISE EXCEPTION 'Legacy migration evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE media_legacy_migration_queue;
