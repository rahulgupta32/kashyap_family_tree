-- Existing refresh chains have no reliable original authentication timestamp.
-- Leave those NULL: privileged access requires a fresh OTP authentication.
ALTER TABLE user_sessions ADD COLUMN authenticated_at TIMESTAMPTZ;
ALTER TABLE user_sessions ALTER COLUMN authenticated_at SET DEFAULT CURRENT_TIMESTAMP;
