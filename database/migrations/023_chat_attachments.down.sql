DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM chat_message_attachments) THEN
  RAISE EXCEPTION 'Chat attachments exist; export and reconcile before rollback';
 END IF;
END $$;
DROP TABLE chat_message_attachments;
