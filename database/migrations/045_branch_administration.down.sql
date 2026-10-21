DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM branch_administration_revisions) OR EXISTS(SELECT 1 FROM branch_generation_catalogue)
  OR EXISTS(SELECT 1 FROM branches WHERE metadata_version>1) THEN
  RAISE EXCEPTION 'Export and reconcile branch administration records before rollback';
 END IF;
END $$;
DROP TABLE branch_administration_revisions;
DROP FUNCTION protect_branch_administration_history();
DROP TABLE branch_generation_catalogue;
ALTER TABLE branches DROP COLUMN metadata_version;
