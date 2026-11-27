DO $$ BEGIN IF EXISTS(SELECT 1 FROM claim_creation_receipts) THEN RAISE EXCEPTION 'CLAIM_CREATE_RECEIPTS_RETAINED'; END IF; END $$;
DROP TABLE claim_creation_receipts;
DROP FUNCTION immutable_claim_creation_receipt();
