DROP TABLE IF EXISTS chat_blocks;
DROP INDEX IF EXISTS idx_chat_message_sequence;
DROP INDEX IF EXISTS uq_chat_message_retry;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS client_message_id, DROP COLUMN IF EXISTS sequence;
ALTER TABLE chat_participants DROP COLUMN IF EXISTS last_read_sequence, DROP COLUMN IF EXISTS left_at;
DROP INDEX IF EXISTS uq_chat_direct_pair;
DROP INDEX IF EXISTS uq_chat_branch_group;
ALTER TABLE chat_conversations DROP COLUMN IF EXISTS direct_key, DROP COLUMN IF EXISTS branch_id, DROP COLUMN IF EXISTS conversation_type;
