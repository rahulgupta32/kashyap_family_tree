ALTER TABLE chat_conversations ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE chat_conversations ADD COLUMN description VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE chat_participants ADD COLUMN group_role VARCHAR(10) NOT NULL DEFAULT 'MEMBER'
  CHECK(group_role IN ('OWNER','ADMIN','MEMBER'));
ALTER TABLE chat_participants ADD COLUMN removed_at TIMESTAMPTZ;
ALTER TABLE chat_participants ADD COLUMN history_from_sequence BIGINT NOT NULL DEFAULT 0 CHECK(history_from_sequence>=0);
UPDATE chat_participants p SET group_role='OWNER' FROM chat_conversations c
  WHERE c.id=p.conversation_id AND c.is_group=TRUE AND c.created_by=p.user_id AND p.left_at IS NULL;
CREATE UNIQUE INDEX uq_chat_active_owner ON chat_participants(conversation_id)
  WHERE group_role='OWNER' AND left_at IS NULL;
CREATE INDEX idx_chat_active_members ON chat_participants(conversation_id,user_id) WHERE left_at IS NULL;
