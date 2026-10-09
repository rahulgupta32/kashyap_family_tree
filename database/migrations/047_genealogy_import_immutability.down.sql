-- Do not restore the defective cross-table field reference from 046.
-- Empty staging can be rolled back to a stricter no-erasure guard before 046 removal.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM genealogy_import_batches) OR EXISTS(SELECT 1 FROM genealogy_import_runs) THEN
  RAISE EXCEPTION 'Cannot weaken retained genealogy import evidence';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_genealogy_import_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Genealogy import evidence is append-only'; END $$;
