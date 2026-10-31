-- A private group cannot safely become a legacy direct or branch conversation.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM chat_conversations WHERE conversation_type='GROUP') THEN
    RAISE EXCEPTION 'Cannot roll back group management while private groups exist';
  END IF;
END $$;
DROP INDEX IF EXISTS idx_chat_active_members;
DROP INDEX IF EXISTS uq_chat_active_owner;
ALTER TABLE chat_participants DROP COLUMN history_from_sequence;
ALTER TABLE chat_participants DROP COLUMN removed_at;
ALTER TABLE chat_participants DROP COLUMN group_role;
ALTER TABLE chat_conversations DROP COLUMN description;
ALTER TABLE chat_conversations DROP COLUMN version;
