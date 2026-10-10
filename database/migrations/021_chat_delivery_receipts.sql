-- Delivery is a client acknowledgement, independent of reads/push provider status.
CREATE TABLE chat_message_deliveries (
 message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES user_accounts(id),
 delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(message_id,user_id)
);
CREATE INDEX idx_chat_delivery_user ON chat_message_deliveries(user_id,message_id);
-- Previously recorded reads prove delivery; no delivery is inferred from sends.
INSERT INTO chat_message_deliveries(message_id,user_id)
 SELECT m.id,p.user_id FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id
 WHERE m.sequence<=p.last_read_sequence AND m.sequence>p.history_from_sequence
 ON CONFLICT DO NOTHING;
