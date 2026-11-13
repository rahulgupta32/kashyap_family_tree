DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM media_inventory_runs) THEN
  RAISE EXCEPTION 'Inventory evidence exists; export/reconcile before rollback';
 END IF;
END $$;
DROP TABLE media_inventory_items;
DROP TABLE media_inventory_runs;
