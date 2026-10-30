-- Permanent no-create decisions are distinct from withdrawal of an existing dispute.
CREATE TABLE member_dispute_closures (
 account_id UUID NOT NULL REFERENCES user_accounts(id),
 submission_key UUID NOT NULL,
 target_person_id UUID NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,submission_key)
);
CREATE FUNCTION immutable_member_dispute_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MEMBER_DISPUTE_CLOSURE_RETAINED'; END $$;
CREATE TRIGGER member_dispute_closure_immutable BEFORE UPDATE OR DELETE ON member_dispute_closures
 FOR EACH ROW EXECUTE FUNCTION immutable_member_dispute_closure();
CREATE FUNCTION exclusive_member_dispute_outcome() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('member-dispute:' || NEW.account_id::text || ':' || NEW.submission_key::text,0));
 IF TG_TABLE_NAME='member_dispute_receipts' THEN
  IF EXISTS(SELECT 1 FROM member_dispute_closures WHERE account_id=NEW.account_id AND submission_key=NEW.submission_key) THEN
   RAISE EXCEPTION 'MEMBER_DISPUTE_ALREADY_ABANDONED';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM member_dispute_receipts WHERE account_id=NEW.account_id AND submission_key=NEW.submission_key) THEN
   RAISE EXCEPTION 'MEMBER_DISPUTE_ALREADY_CREATED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_dispute_receipt_exclusive BEFORE INSERT ON member_dispute_receipts
 FOR EACH ROW EXECUTE FUNCTION exclusive_member_dispute_outcome();
CREATE TRIGGER member_dispute_closure_exclusive BEFORE INSERT ON member_dispute_closures
 FOR EACH ROW EXECUTE FUNCTION exclusive_member_dispute_outcome();
