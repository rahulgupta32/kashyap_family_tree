DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM policy_documents) OR EXISTS(SELECT 1 FROM policy_acknowledgements) THEN RAISE EXCEPTION 'POLICY_EVIDENCE_RETAINED'; END IF;
END $$;
DROP TABLE policy_acknowledgements;
DROP FUNCTION immutable_policy_acknowledgement();
DROP TABLE policy_documents;
DROP FUNCTION immutable_policy_document();
