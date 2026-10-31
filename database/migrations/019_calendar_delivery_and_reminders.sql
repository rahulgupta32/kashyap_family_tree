-- Explicit AD instants are organizer-supplied, never inferred from BS/Tithi.
ALTER TABLE calendar_events ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0);
ALTER TABLE calendar_events ADD COLUMN lifecycle_state VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK(lifecycle_state IN ('ACTIVE','CANCELLED'));
ALTER TABLE calendar_events ADD COLUMN starts_at TIMESTAMPTZ;
ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_date_validity;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_events_date_validity CHECK (
  date_bs IS NOT NULL OR starts_at IS NOT NULL OR
  (tithi_year_bs IS NOT NULL AND tithi_month_bs IS NOT NULL AND tithi_paksha IS NOT NULL AND tithi_number IS NOT NULL)
);
ALTER TABLE calendar_events ADD COLUMN reminder_offsets INTEGER[] NOT NULL DEFAULT '{}'
  CHECK(cardinality(reminder_offsets)<=3 AND reminder_offsets <@ ARRAY[30,60,1440,10080]);
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_reminder_instant CHECK(cardinality(reminder_offsets)=0 OR starts_at IS NOT NULL);
ALTER TABLE event_invitations ADD COLUMN revoked_at TIMESTAMPTZ;
CREATE TABLE calendar_event_revisions (
  event_id UUID NOT NULL REFERENCES calendar_events(id), version INTEGER NOT NULL,
  actor_id UUID NOT NULL REFERENCES user_accounts(id), action VARCHAR(50) NOT NULL,
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(event_id,version)
);
CREATE TABLE calendar_notification_recipients (
  outbox_id UUID NOT NULL REFERENCES audit_outbox(id), user_id UUID NOT NULL REFERENCES user_accounts(id),
  event_id UUID NOT NULL REFERENCES calendar_events(id), event_version INTEGER NOT NULL,
  PRIMARY KEY(outbox_id,user_id)
);
CREATE INDEX idx_calendar_notice_event ON calendar_notification_recipients(event_id,event_version);
CREATE TABLE calendar_event_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES calendar_events(id),
  event_version INTEGER NOT NULL, recipient_user_id UUID NOT NULL REFERENCES user_accounts(id),
  offset_minutes INTEGER NOT NULL CHECK(offset_minutes IN (30,60,1440,10080)), due_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','EMITTED','CANCELLED','SKIPPED')),
  outbox_id UUID REFERENCES audit_outbox(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id,event_version,recipient_user_id,offset_minutes)
);
CREATE INDEX idx_calendar_reminder_due ON calendar_event_reminders(due_at,event_id) WHERE status='PENDING';
