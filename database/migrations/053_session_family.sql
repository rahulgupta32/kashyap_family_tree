-- Server-created login families survive refresh rotation; never supplied by clients.
ALTER TABLE user_sessions ADD COLUMN session_family_id uuid;
UPDATE user_sessions SET session_family_id=id;
ALTER TABLE user_sessions ALTER COLUMN session_family_id SET DEFAULT gen_random_uuid();
ALTER TABLE user_sessions ALTER COLUMN session_family_id SET NOT NULL;
CREATE INDEX idx_user_sessions_owner_family ON user_sessions(user_id,session_family_id);
-- Explicit owner revocation is not evidence of refresh-token theft/replay.
ALTER TABLE user_sessions ADD COLUMN owner_revoked_at timestamptz;
