DROP TABLE IF EXISTS notification_inbox;
ALTER TABLE notification_preferences
  DROP COLUMN IF EXISTS in_app_enabled,
  DROP COLUMN IF EXISTS workflow_enabled,
  DROP COLUMN IF EXISTS chat_enabled;
