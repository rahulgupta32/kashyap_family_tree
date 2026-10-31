-- Durable device roster and one-shot provider claims; no raw credential/payload/receipt copies.
CREATE TABLE push_delivery_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 dispatch_id UUID NOT NULL REFERENCES notification_dispatches(id) ON DELETE RESTRICT,
 registration_id UUID NOT NULL,
 token_generation UUID NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
  CHECK(status IN ('PLANNED','SENDING','ACCEPTED','INVALID_TOKEN','REJECTED','UNKNOWN','SKIPPED')),
 claim_id UUID,
 lease_expires_at TIMESTAMPTZ,
 receipt_hash CHAR(64) CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TIMESTAMPTZ,
 UNIQUE(dispatch_id,registration_id),
 CHECK((claim_id IS NULL)=(lease_expires_at IS NULL)),
 CHECK(status<>'SENDING' OR claim_id IS NOT NULL),
 CHECK(status<>'ACCEPTED' OR receipt_hash IS NOT NULL)
);
CREATE TABLE push_provider_observations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 attempt_id UUID NOT NULL REFERENCES push_delivery_attempts(id) ON DELETE RESTRICT,
 claim_id UUID NOT NULL,
 outcome VARCHAR(20) NOT NULL CHECK(outcome IN ('ACCEPTED','INVALID_TOKEN','REJECTED','UNKNOWN','SKIPPED')),
 receipt_hash CHAR(64) CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(attempt_id,claim_id),
 CHECK(outcome<>'ACCEPTED' OR receipt_hash IS NOT NULL)
);
CREATE INDEX idx_push_delivery_dispatch ON push_delivery_attempts(dispatch_id,status);
CREATE FUNCTION protect_push_delivery_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='push_provider_observations' THEN
  RAISE EXCEPTION 'PUSH_PROVIDER_EVIDENCE_IMMUTABLE';
 END IF;
 IF OLD.status NOT IN ('PLANNED','SENDING') OR
    NEW.id<>OLD.id OR NEW.dispatch_id<>OLD.dispatch_id OR NEW.registration_id<>OLD.registration_id OR
    NEW.token_generation<>OLD.token_generation OR NEW.created_at<>OLD.created_at OR
    (OLD.status='PLANNED' AND NEW.status NOT IN ('SENDING','SKIPPED')) OR
    (OLD.status='SENDING' AND (NEW.status IN ('PLANNED','SENDING') OR NEW.claim_id IS DISTINCT FROM OLD.claim_id OR NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at)) THEN
  RAISE EXCEPTION 'PUSH_PROVIDER_EVIDENCE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_push_attempt_evidence BEFORE UPDATE OR DELETE ON push_delivery_attempts
 FOR EACH ROW EXECUTE FUNCTION protect_push_delivery_evidence();
CREATE TRIGGER trg_push_observation_evidence BEFORE UPDATE OR DELETE ON push_provider_observations
 FOR EACH ROW EXECUTE FUNCTION protect_push_delivery_evidence();
