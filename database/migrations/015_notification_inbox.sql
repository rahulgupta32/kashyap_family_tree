-- Durable member inbox. Events retain generic text only; private message bodies and
-- relationship evidence never enter the inbox. A unique outbox/recipient pair prevents
-- duplicate entries across overlapping workers and process restarts.
ALTER TABLE notification_preferences
  ADD COLUMN in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN workflow_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN chat_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE notification_inbox (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbox_id UUID NOT NULL REFERENCES audit_outbox(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL CHECK (category IN ('WORKFLOW','CHAT','EVENT')),
  action VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  destination VARCHAR(40) NOT NULL CHECK (destination IN ('/claims','/change-requests','/chat','/calendar')),
  chat_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CONSTRAINT uq_notification_inbox_event_recipient UNIQUE (outbox_id, recipient_user_id)
);
CREATE INDEX idx_notification_inbox_user_page ON notification_inbox (recipient_user_id, created_at DESC, id DESC);
