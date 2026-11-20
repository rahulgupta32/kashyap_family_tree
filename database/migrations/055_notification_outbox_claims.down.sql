-- Stop all notification workers and drain claims before reverting application/schema.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM audit_outbox WHERE notification_status='PROCESSING' OR notification_claim_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Drain notification claims before rollback';
 END IF;
END $$;
DROP INDEX idx_audit_outbox_notification_claimable;
ALTER TABLE audit_outbox DROP CONSTRAINT chk_notification_claim_pair;
ALTER TABLE audit_outbox DROP COLUMN notification_lease_expires_at;
ALTER TABLE audit_outbox DROP COLUMN notification_claim_id;
