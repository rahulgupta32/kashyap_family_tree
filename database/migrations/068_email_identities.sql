-- Email identities are independent from person claims and phone verification.
ALTER TABLE user_accounts ALTER COLUMN phone_number DROP NOT NULL;
CREATE TABLE account_email_identities (
  email VARCHAR(254) PRIMARY KEY CHECK (email = lower(btrim(email))),
  user_id UUID NOT NULL UNIQUE REFERENCES user_accounts(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Email-first accounts reauthenticate deletion at their verified email.
ALTER TABLE auth_challenges ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE auth_challenges ADD COLUMN email_destination VARCHAR(254);
