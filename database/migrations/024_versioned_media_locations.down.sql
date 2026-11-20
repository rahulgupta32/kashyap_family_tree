-- Refuse truncating storage pointers or pending cleanup evidence.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM media_assets WHERE length(storage_path)>500)
     OR EXISTS (SELECT 1 FROM media_deletion_queue WHERE length(storage_path)>500) THEN
    RAISE EXCEPTION 'Reconcile long versioned media locations before rollback';
  END IF;
END $$;
ALTER TABLE media_assets ALTER COLUMN storage_path TYPE VARCHAR(500);
ALTER TABLE media_deletion_queue ALTER COLUMN storage_path TYPE VARCHAR(500);
