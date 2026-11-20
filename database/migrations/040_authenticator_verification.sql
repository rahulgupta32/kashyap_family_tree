CREATE TABLE account_authenticators (
  user_id UUID PRIMARY KEY REFERENCES user_accounts(id),
  secret_ciphertext TEXT,
  pending_ciphertext TEXT,
  pending_session_id UUID REFERENCES user_sessions(id),
  pending_expires_at TIMESTAMPTZ,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0),
  last_counter BIGINT NOT NULL DEFAULT -1,
  recovery_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  enabled_at TIMESTAMPTZ
);
ALTER TABLE user_sessions ADD COLUMN mfa_verified_at TIMESTAMPTZ;
ALTER TABLE user_sessions ADD COLUMN mfa_generation INTEGER;
