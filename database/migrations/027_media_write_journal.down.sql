DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM media_upload_intents) OR EXISTS(SELECT 1 FROM media_orphan_deletion_queue) THEN
  RAISE EXCEPTION 'Media write/cleanup evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TRIGGER media_upload_link ON media_assets;
DROP FUNCTION fence_media_upload_link();
DROP TABLE media_orphan_deletion_queue;
ALTER TABLE media_inventory_items DROP COLUMN upload_intent_id;
DROP TABLE media_upload_intents;
