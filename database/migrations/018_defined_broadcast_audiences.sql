-- Explicit recipient IDs are a private selection basis; the separate recipient table
-- remains the immutable send-time snapshot. New members never inherit old notices.
ALTER TABLE notification_broadcasts
  ADD COLUMN target_user_ids UUID[];
ALTER TABLE notification_broadcasts DROP CONSTRAINT chk_broadcast_scope;
ALTER TABLE notification_broadcasts DROP CONSTRAINT notification_broadcasts_scope_check;
ALTER TABLE notification_broadcasts ADD CONSTRAINT notification_broadcasts_scope_check
  CHECK (scope IN ('ALL','BRANCH','GENERATION','DEFINED'));
ALTER TABLE notification_broadcasts ADD CONSTRAINT chk_broadcast_scope CHECK (
  (scope='ALL' AND branch_id IS NULL AND generation IS NULL AND target_user_ids IS NULL) OR
  (scope='BRANCH' AND branch_id IS NOT NULL AND generation IS NULL AND target_user_ids IS NULL) OR
  (scope='GENERATION' AND generation IS NOT NULL AND target_user_ids IS NULL) OR
  (scope='DEFINED' AND generation IS NULL AND cardinality(target_user_ids) BETWEEN 1 AND 100)
);
