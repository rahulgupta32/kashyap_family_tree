DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM account_authenticators) THEN
    RAISE EXCEPTION 'Authenticator evidence exists; export/reconcile and revoke sessions before rollback';
  END IF;
END $$;
ALTER TABLE user_sessions DROP COLUMN mfa_generation;
ALTER TABLE user_sessions DROP COLUMN mfa_verified_at;
DROP TABLE account_authenticators;
