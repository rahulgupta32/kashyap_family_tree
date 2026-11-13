CREATE TABLE claim_creation_receipts (
 account_id uuid NOT NULL REFERENCES user_accounts(id),
 creation_key uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 claim_id uuid NOT NULL UNIQUE REFERENCES profile_claims(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,creation_key)
);
CREATE FUNCTION immutable_claim_creation_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CLAIM_CREATE_RECEIPT_IMMUTABLE'; END $$;
CREATE TRIGGER claim_creation_receipt_immutable BEFORE UPDATE OR DELETE ON claim_creation_receipts FOR EACH ROW EXECUTE FUNCTION immutable_claim_creation_receipt();
