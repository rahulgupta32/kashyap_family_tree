DO $$ BEGIN IF EXISTS(SELECT 1 FROM member_dispute_receipts) THEN RAISE EXCEPTION 'MEMBER_DISPUTE_RECEIPTS_RETAINED'; END IF; END $$;
DROP TRIGGER member_dispute_receipt_immutable ON member_dispute_receipts;
DROP TABLE member_dispute_receipts;
DROP FUNCTION immutable_member_dispute_receipt();
DROP INDEX idx_disputes_owner_history;
