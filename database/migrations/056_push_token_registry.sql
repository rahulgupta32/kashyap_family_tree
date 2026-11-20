-- Ephemeral delivery credentials. Legacy devices.push_token is deliberately not imported.
CREATE TABLE push_token_registrations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
 session_family_id UUID NOT NULL,
 platform VARCHAR(7) NOT NULL CHECK (platform IN ('ANDROID','IOS')),
 token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 token_envelope TEXT NOT NULL,
 generation UUID NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (user_id,session_family_id),
 CHECK (expires_at > updated_at)
);
CREATE INDEX idx_push_token_expiry ON push_token_registrations(expires_at);
