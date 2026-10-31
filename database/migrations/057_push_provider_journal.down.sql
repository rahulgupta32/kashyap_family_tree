DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM push_delivery_attempts) OR EXISTS(SELECT 1 FROM push_provider_observations) THEN
  RAISE EXCEPTION 'PUSH_PROVIDER_EVIDENCE_RETAINED';
 END IF;
END $$;
DROP TABLE push_provider_observations;
DROP TABLE push_delivery_attempts;
DROP FUNCTION protect_push_delivery_evidence();
