DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM audit_outbox WHERE next_attempt_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Audit retry schedule exists; export and reconcile before rollback';
 END IF;
END $$;
DROP INDEX IF EXISTS idx_audit_outbox_delivery_due;
ALTER TABLE audit_outbox DROP COLUMN IF EXISTS next_attempt_at;
