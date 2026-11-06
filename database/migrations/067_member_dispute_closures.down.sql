DO $$ BEGIN IF EXISTS(SELECT 1 FROM member_dispute_closures) THEN RAISE EXCEPTION 'MEMBER_DISPUTE_CLOSURES_RETAINED'; END IF; END $$;
DROP TRIGGER member_dispute_receipt_exclusive ON member_dispute_receipts;
DROP TRIGGER member_dispute_closure_exclusive ON member_dispute_closures;
DROP TRIGGER member_dispute_closure_immutable ON member_dispute_closures;
DROP TABLE member_dispute_closures;
DROP FUNCTION exclusive_member_dispute_outcome();
DROP FUNCTION immutable_member_dispute_closure();
