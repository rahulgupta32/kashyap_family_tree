-- Index rollback preserves all authentication evidence.
DROP INDEX IF EXISTS idx_audit_outbox_otp_attempt_age;
DROP INDEX IF EXISTS idx_audit_outbox_otp_outcome_operation;
