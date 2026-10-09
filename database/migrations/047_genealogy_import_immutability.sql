-- Never reference a batch-only record field while handling a report trigger.
-- Keep 046 unchanged for databases that have already recorded its checksum.
CREATE OR REPLACE FUNCTION protect_genealogy_import_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='genealogy_import_batches' AND TG_OP='UPDATE' THEN
  IF NEW.payload IS NULL AND (to_jsonb(NEW)-'payload')=(to_jsonb(OLD)-'payload') THEN
   RETURN NEW;
  END IF;
 END IF;
 RAISE EXCEPTION 'Genealogy import evidence is append-only';
END $$;
