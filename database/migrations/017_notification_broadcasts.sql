-- Governed administrative notices. Recipient snapshots make retries idempotent and
-- stop newly joined members from receiving an earlier, scoped announcement.
CREATE TABLE notification_broadcasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by_user_id UUID NOT NULL REFERENCES user_accounts(id),
  request_id UUID NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  scope VARCHAR(16) NOT NULL CHECK (scope IN ('ALL','BRANCH','GENERATION')),
  branch_id UUID REFERENCES branches(id),
  generation INT CHECK (generation BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_broadcast_scope CHECK (
    (scope='ALL' AND branch_id IS NULL AND generation IS NULL) OR
    (scope='BRANCH' AND branch_id IS NOT NULL AND generation IS NULL) OR
    (scope='GENERATION' AND generation IS NOT NULL)
  ),
  CONSTRAINT uq_broadcast_request UNIQUE (created_by_user_id,request_id)
);
CREATE TABLE notification_broadcast_recipients (
  broadcast_id UUID NOT NULL REFERENCES notification_broadcasts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_accounts(id),
  PRIMARY KEY (broadcast_id,user_id)
);
CREATE INDEX idx_broadcast_recipient_user ON notification_broadcast_recipients (user_id,broadcast_id);
ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_category_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_category_check
  CHECK (category IN ('WORKFLOW','CHAT','EVENT','BROADCAST'));
ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_destination_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_destination_check
  CHECK (destination IN ('/claims','/change-requests','/chat','/calendar','/broadcasts'));
