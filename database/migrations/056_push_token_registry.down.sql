-- Rollback requires an explicit drain; never silently discard active credentials.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM push_token_registrations) THEN
  RAISE EXCEPTION 'PUSH_TOKEN_REGISTRY_DRAIN_REQUIRED';
 END IF;
END $$;
DROP TABLE push_token_registrations;
