-- S3 object versions can have encoded IDs longer than the previous path limit.
ALTER TABLE media_assets ALTER COLUMN storage_path TYPE TEXT;
ALTER TABLE media_deletion_queue ALTER COLUMN storage_path TYPE TEXT;
