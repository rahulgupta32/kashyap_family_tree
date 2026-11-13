CREATE TABLE media_upload_intents (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 storage_scope VARCHAR(64) NOT NULL,
 uploader_user_id UUID REFERENCES user_accounts(id),
 bucket VARCHAR(80) NOT NULL,
 file_name VARCHAR(255) NOT NULL,
 byte_size BIGINT NOT NULL CHECK(byte_size>0 AND byte_size<=10485760),
 sha256_checksum VARCHAR(64) NOT NULL,
 mime_type VARCHAR(100) NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'WRITING' CHECK(state IN ('WRITING','STORED','COMMITTED','ABANDONED')),
 object_location TEXT,
 asset_id UUID REFERENCES media_assets(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
 UNIQUE(bucket,file_name)
);
ALTER TABLE media_inventory_items ADD COLUMN upload_intent_id UUID REFERENCES media_upload_intents(id);
CREATE TABLE media_orphan_deletion_queue (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 inventory_item_id BIGINT NOT NULL REFERENCES media_inventory_items(id),
 intent_id UUID NOT NULL REFERENCES media_upload_intents(id),
 object_location TEXT NOT NULL UNIQUE,
 approved_by UUID NOT NULL REFERENCES user_accounts(id),
 reason VARCHAR(1000) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSED','REVIEW_REQUIRED')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 processed_at TIMESTAMPTZ
);
CREATE INDEX media_orphan_pending ON media_orphan_deletion_queue(next_attempt_at) WHERE status='PENDING';
-- Fencing serializes an asset link against abandonment. Legacy unjournaled assets remain supported.
CREATE FUNCTION fence_media_upload_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE intent media_upload_intents%ROWTYPE;
BEGIN
 SELECT * INTO intent FROM media_upload_intents WHERE bucket=NEW.bucket AND file_name=NEW.file_name FOR UPDATE;
 IF FOUND THEN
  IF intent.state='ABANDONED' OR intent.state='WRITING' THEN
   RAISE EXCEPTION 'Media write is not linkable';
  END IF;
  IF intent.state='STORED' THEN
   IF intent.object_location IS DISTINCT FROM NEW.storage_path OR intent.byte_size<>NEW.byte_size OR intent.sha256_checksum<>NEW.sha256_checksum OR intent.mime_type<>NEW.mime_type THEN
    RAISE EXCEPTION 'Media write provenance mismatch';
   END IF;
   UPDATE media_upload_intents SET state='COMMITTED',asset_id=NEW.id WHERE id=intent.id;
  ELSIF TG_OP='INSERT' AND intent.asset_id IS DISTINCT FROM NEW.id THEN
   RAISE EXCEPTION 'Media write already linked';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM media_orphan_deletion_queue WHERE object_location=NEW.storage_path) THEN
  RAISE EXCEPTION 'Media location fenced for cleanup';
 END IF;
 RETURN NEW;
END $$;
-- AFTER INSERT allows the asset FK in the journal to be set inside the same transaction.
CREATE TRIGGER media_upload_link AFTER INSERT OR UPDATE OF bucket,file_name,storage_path ON media_assets
FOR EACH ROW EXECUTE FUNCTION fence_media_upload_link();
