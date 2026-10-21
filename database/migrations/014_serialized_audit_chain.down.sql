-- Downgrade only after exporting the versioned chain for retention.
DROP INDEX IF EXISTS uq_audit_v2_predecessor;
DROP INDEX IF EXISTS uq_audit_chain_position;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS chk_audit_hash_version;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS hash_version;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS chain_position;
