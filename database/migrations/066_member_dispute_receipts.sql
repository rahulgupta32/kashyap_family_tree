-- Account-bound, immutable replay receipts; only complete disputes commit.
CREATE TABLE member_dispute_receipts (
 account_id UUID NOT NULL REFERENCES user_accounts(id),
 submission_key UUID NOT NULL,
 target_person_id UUID NOT NULL REFERENCES persons(id),
 payload_hash CHAR(64) NOT NULL,
 dispute_id UUID NOT NULL REFERENCES claim_disputes(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,submission_key)
);
CREATE FUNCTION immutable_member_dispute_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MEMBER_DISPUTE_RECEIPT_RETAINED'; END $$;
CREATE TRIGGER member_dispute_receipt_immutable BEFORE UPDATE OR DELETE ON member_dispute_receipts
 FOR EACH ROW EXECUTE FUNCTION immutable_member_dispute_receipt();
CREATE INDEX idx_disputes_owner_history ON claim_disputes(disputant_user_id,created_at DESC,id DESC);
