DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM genealogy_import_batches) OR EXISTS(SELECT 1 FROM genealogy_import_runs) THEN
  RAISE EXCEPTION 'Cannot discard retained genealogy import evidence';
 END IF;
END $$;
DROP TABLE genealogy_import_runs,genealogy_import_batches;
DROP FUNCTION protect_genealogy_import_evidence();
