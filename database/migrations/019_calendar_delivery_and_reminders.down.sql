-- Refuse rollback while AD-only events exist; never invent a BS/Tithi date.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM calendar_events WHERE date_bs IS NULL AND
    (tithi_year_bs IS NULL OR tithi_month_bs IS NULL OR tithi_paksha IS NULL OR tithi_number IS NULL)) THEN
    RAISE EXCEPTION 'Cannot roll back calendar AD scheduling while AD-only events exist';
  END IF;
END $$;
ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_date_validity;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_events_date_validity CHECK (
  date_bs IS NOT NULL OR
  (tithi_year_bs IS NOT NULL AND tithi_month_bs IS NOT NULL AND tithi_paksha IS NOT NULL AND tithi_number IS NOT NULL)
);
DROP TABLE IF EXISTS calendar_event_reminders;
DROP TABLE IF EXISTS calendar_notification_recipients;
DROP TABLE IF EXISTS calendar_event_revisions;
ALTER TABLE event_invitations DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_reminder_instant;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS reminder_offsets;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS starts_at;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS lifecycle_state;
ALTER TABLE calendar_events DROP COLUMN IF EXISTS version;
