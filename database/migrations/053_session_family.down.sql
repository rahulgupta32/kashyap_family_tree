-- Rollback requires the previous application and all live families to be drained.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM user_sessions WHERE (revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP) OR owner_revoked_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Drain live session families before rollback';
 END IF;
END $$;
ALTER TABLE user_sessions DROP COLUMN owner_revoked_at;
DROP INDEX idx_user_sessions_owner_family;
ALTER TABLE user_sessions DROP COLUMN session_family_id;
