-- Rollback only in an isolated rehearsal; production notices are retained.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM notification_broadcasts WHERE scope='DEFINED') THEN
    RAISE EXCEPTION 'Cannot roll back while defined-audience notices exist';
  END IF;
END $$;
ALTER TABLE notification_broadcasts DROP CONSTRAINT chk_broadcast_scope;
ALTER TABLE notification_broadcasts DROP CONSTRAINT notification_broadcasts_scope_check;
ALTER TABLE notification_broadcasts ADD CONSTRAINT notification_broadcasts_scope_check
  CHECK (scope IN ('ALL','BRANCH','GENERATION'));
ALTER TABLE notification_broadcasts ADD CONSTRAINT chk_broadcast_scope CHECK (
  (scope='ALL' AND branch_id IS NULL AND generation IS NULL) OR
  (scope='BRANCH' AND branch_id IS NOT NULL AND generation IS NULL) OR
  (scope='GENERATION' AND generation IS NOT NULL)
);
ALTER TABLE notification_broadcasts DROP COLUMN target_user_ids;
