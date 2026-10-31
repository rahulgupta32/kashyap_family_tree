DO $$ BEGIN IF EXISTS(SELECT 1 FROM claim_creation_closures) THEN RAISE EXCEPTION 'CLAIM_CREATION_CLOSURES_RETAINED'; END IF; END $$;
DROP TRIGGER claim_creation_receipt_exclusive ON claim_creation_receipts;
DROP TABLE claim_creation_closures;
DROP FUNCTION exclusive_claim_creation_outcome();
DROP FUNCTION immutable_claim_creation_closure();
