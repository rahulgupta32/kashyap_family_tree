CREATE TABLE media_image_jobs (
  source_asset_id UUID PRIMARY KEY REFERENCES media_assets(id),
  crop JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','FAILED','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_code VARCHAR(80),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX media_image_jobs_pending ON media_image_jobs(next_attempt_at) WHERE status='PENDING';
CREATE TABLE media_derivatives (
  source_asset_id UUID NOT NULL REFERENCES media_assets(id),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('thumbnail','display')),
  asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id),
  width INTEGER NOT NULL CHECK(width>0),
  height INTEGER NOT NULL CHECK(height>0),
  source_checksum VARCHAR(64) NOT NULL,
  transform JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(source_asset_id,kind)
);
-- Derived bytes inherit source retention; they are never independently released.
CREATE FUNCTION propagate_media_derivative_retention() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE media_assets a SET retention_status=NEW.retention_status
  FROM media_derivatives d WHERE d.source_asset_id=NEW.id AND d.asset_id=a.id;
  IF NEW.retention_status IN ('DELETED','PURGED') THEN
    INSERT INTO media_deletion_queue(asset_id,storage_path,status)
    SELECT a.id,a.storage_path,'PENDING' FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id
    WHERE d.source_asset_id=NEW.id AND a.storage_path IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM media_deletion_queue q WHERE q.asset_id=a.id AND q.status='PENDING');
    UPDATE media_image_jobs SET status='CANCELLED' WHERE source_asset_id=NEW.id AND status<>'CANCELLED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_derivative_retention AFTER UPDATE OF retention_status ON media_assets
FOR EACH ROW WHEN (OLD.retention_status IS DISTINCT FROM NEW.retention_status AND NEW.bucket<>'private-derivatives')
EXECUTE FUNCTION propagate_media_derivative_retention();
