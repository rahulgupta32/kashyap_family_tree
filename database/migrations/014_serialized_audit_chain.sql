-- Preserve historical hashes verbatim. Version 2 starts a deterministic,
-- serialized suffix; this migration does not certify legacy hash integrity.
CREATE SEQUENCE audit_chain_position_seq;
ALTER TABLE audit_logs ADD COLUMN chain_position BIGINT;
ALTER TABLE audit_logs ALTER COLUMN chain_position SET DEFAULT nextval('audit_chain_position_seq');
ALTER SEQUENCE audit_chain_position_seq OWNED BY audit_logs.chain_position;
ALTER TABLE audit_logs ADD COLUMN hash_version SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_hash_version CHECK (hash_version IN (1,2));
CREATE UNIQUE INDEX uq_audit_chain_position ON audit_logs(chain_position) WHERE chain_position IS NOT NULL;
CREATE UNIQUE INDEX uq_audit_v2_predecessor ON audit_logs(prev_record_hash) WHERE hash_version=2;
