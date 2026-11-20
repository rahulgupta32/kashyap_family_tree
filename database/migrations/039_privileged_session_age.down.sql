-- Removing this column would remove a security boundary. Revoke sessions first.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM user_sessions WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'Revoke active sessions before removing privileged authentication age';
  END IF;
END $$;
ALTER TABLE user_sessions DROP COLUMN authenticated_at;
