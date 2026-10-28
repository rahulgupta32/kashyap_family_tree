-- A permanent no-create tombstone never withdraws or deletes a retained claim.
CREATE TABLE claim_creation_closures (
 account_id UUID NOT NULL REFERENCES user_accounts(id),
 creation_key UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,creation_key)
);
CREATE FUNCTION immutable_claim_creation_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CLAIM_CREATION_CLOSURE_IMMUTABLE'; END $$;
CREATE TRIGGER claim_creation_closure_immutable BEFORE UPDATE OR DELETE ON claim_creation_closures FOR EACH ROW EXECUTE FUNCTION immutable_claim_creation_closure();
-- Fence both terminal stores using the same account lock as their application writers.
CREATE FUNCTION exclusive_claim_creation_outcome() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM user_accounts WHERE id=NEW.account_id FOR UPDATE;
 IF TG_TABLE_NAME='claim_creation_closures' THEN
  IF EXISTS(SELECT 1 FROM claim_creation_receipts WHERE account_id=NEW.account_id AND creation_key=NEW.creation_key)
  THEN RAISE EXCEPTION 'CLAIM_CREATION_ALREADY_CREATED'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM claim_creation_closures WHERE account_id=NEW.account_id AND creation_key=NEW.creation_key)
  THEN RAISE EXCEPTION 'CLAIM_CREATION_PERMANENTLY_CLOSED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER claim_creation_closure_exclusive BEFORE INSERT ON claim_creation_closures FOR EACH ROW EXECUTE FUNCTION exclusive_claim_creation_outcome();
CREATE TRIGGER claim_creation_receipt_exclusive BEFORE INSERT ON claim_creation_receipts FOR EACH ROW EXECUTE FUNCTION exclusive_claim_creation_outcome();
