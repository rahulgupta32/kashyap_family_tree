DROP TABLE IF EXISTS calendar_event_reminders;
DROP TABLE IF EXISTS calendar_notification_recipients;
DROP TABLE IF EXISTS calendar_event_revisions;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_reminder_instant;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS reminder_offsets;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS starts_at;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS lifecycle_state;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS version;
