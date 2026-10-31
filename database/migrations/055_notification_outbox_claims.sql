-- Notification ownership is independent of append-only audit delivery state.
ALTER TABLE audit_outbox ADD COLUMN notification_claim_id UUID;
ALTER TABLE audit_outbox ADD COLUMN notification_lease_expires_at TIMESTAMPTZ;
ALTER TABLE audit_outbox ADD CONSTRAINT chk_notification_claim_pair CHECK (
 (notification_claim_id IS NULL) = (notification_lease_expires_at IS NULL)
);
CREATE INDEX idx_audit_outbox_notification_claimable ON audit_outbox(created_at,id)
 WHERE notification_status IN ('PENDING','FAILED','PROCESSING');
