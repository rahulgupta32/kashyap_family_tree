-- Refuse rollback while email-first accounts exist. Never destroy identities implicitly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth_challenges WHERE phone_number IS NULL) OR EXISTS (SELECT 1 FROM account_email_identities) OR EXISTS (SELECT 1 FROM user_accounts WHERE phone_number IS NULL) THEN
    RAISE EXCEPTION 'Email identity rollback requires explicit account reconciliation';
  END IF;
END $$;
ALTER TABLE auth_challenges DROP COLUMN email_destination;
ALTER TABLE auth_challenges ALTER COLUMN phone_number SET NOT NULL;
DROP TABLE account_email_identities;
ALTER TABLE user_accounts ALTER COLUMN phone_number SET NOT NULL;
