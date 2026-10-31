-- Durable retry timing; retained evidence and exhausted rows are never deleted.
ALTER TABLE audit_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_audit_outbox_delivery_due
 ON audit_outbox(next_attempt_at,created_at)
 WHERE status IN ('PENDING','FAILED') AND retry_count < 10;
