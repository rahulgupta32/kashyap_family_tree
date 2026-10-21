-- Refuse loss of recipient evidence after this workflow has been used.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM chat_message_deliveries d JOIN chat_messages m ON m.id=d.message_id
  JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=d.user_id
  WHERE m.sequence>p.last_read_sequence) THEN
  RAISE EXCEPTION 'Unread delivery evidence exists; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE chat_message_deliveries;
