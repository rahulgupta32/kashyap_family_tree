CREATE TABLE audit_delivery_recovery_requests (
 id UUID PRIMARY KEY,
 outbox_id UUID NOT NULL REFERENCES audit_outbox(id),
 proposed_by UUID NOT NULL REFERENCES user_accounts(id),
 reason_code TEXT NOT NULL CHECK(reason_code IN ('DEPENDENCY_RECOVERED','DELIVERY_CONFIGURATION_REPAIRED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours')
);
CREATE TABLE audit_delivery_recovery_decisions (
 request_id UUID PRIMARY KEY REFERENCES audit_delivery_recovery_requests(id),
 approved_by UUID NOT NULL REFERENCES user_accounts(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('PROCESSED','FAILED','ALREADY_PROCESSED')),
 decided_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_audit_recovery_pending ON audit_delivery_recovery_requests(created_at,id);
CREATE FUNCTION protect_audit_delivery_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit recovery evidence is immutable'; END $$;
CREATE TRIGGER protect_audit_recovery_requests BEFORE UPDATE OR DELETE OR TRUNCATE
 ON audit_delivery_recovery_requests FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_delivery_recovery();
CREATE TRIGGER protect_audit_recovery_decisions BEFORE UPDATE OR DELETE OR TRUNCATE
 ON audit_delivery_recovery_decisions FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_delivery_recovery();
