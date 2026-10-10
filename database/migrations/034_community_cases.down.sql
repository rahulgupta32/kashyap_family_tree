DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM community_escalations) OR EXISTS(SELECT 1 FROM community_reports WHERE reported_version IS NOT NULL) THEN
  RAISE EXCEPTION 'Export and reconcile community case evidence before rollback';
 END IF;
END $$;
DROP TABLE community_escalations;
ALTER TABLE community_reports DROP COLUMN evidence_sequence,DROP COLUMN reported_version;
