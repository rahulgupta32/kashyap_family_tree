DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM calendar_audience_previews) THEN
  RAISE EXCEPTION 'Export and reconcile audience evidence before rollback';
 END IF;
END $$;
ALTER TABLE calendar_events DROP COLUMN audience_preview_id;
DROP TABLE calendar_audience_previews;
DROP FUNCTION protect_calendar_audience_evidence();
