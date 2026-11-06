ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS conversation_type VARCHAR(30) NOT NULL DEFAULT 'DIRECT';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS direct_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_direct_pair ON chat_conversations(direct_key) WHERE direct_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_branch_group ON chat_conversations(branch_id) WHERE conversation_type='FAMILY_BRANCH';
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS last_read_sequence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sequence BIGSERIAL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS client_message_id UUID;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_message_retry ON chat_messages(conversation_id,sender_id,client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_message_sequence ON chat_messages(conversation_id,sequence DESC);
CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id UUID NOT NULL REFERENCES user_accounts(id),
  blocked_id UUID NOT NULL REFERENCES user_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
