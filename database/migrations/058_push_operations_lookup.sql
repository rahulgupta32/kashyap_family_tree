-- Restrict monitoring/reconciliation lookups to open push dispatches.
CREATE INDEX idx_push_dispatch_operations ON notification_dispatches(delivery_status,created_at,id)
 WHERE channel='PUSH' AND delivery_status IN ('PENDING','PROCESSING','FAILED','RECONCILIATION_REQUIRED');
