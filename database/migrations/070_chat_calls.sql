CREATE TABLE chat_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id),
  caller_id UUID NOT NULL REFERENCES user_accounts(id),
  media TEXT NOT NULL CHECK (media IN ('VOICE', 'VIDEO')),
  state TEXT NOT NULL CHECK (state IN ('RINGING', 'ACTIVE', 'DECLINED', 'MISSED', 'ENDED')),
  ring_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_calls_one_open ON chat_calls(conversation_id) WHERE state IN ('RINGING', 'ACTIVE');
CREATE TABLE chat_call_participants (
  call_id UUID NOT NULL REFERENCES chat_calls(id),
  user_id UUID NOT NULL REFERENCES user_accounts(id),
  PRIMARY KEY (call_id, user_id)
);

CREATE FUNCTION revoke_chat_call_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.left_at IS NULL AND NEW.removed_at IS NULL THEN RETURN NEW; END IF;
  DELETE FROM chat_call_participants p USING chat_calls c
  WHERE p.call_id=c.id AND p.user_id=NEW.user_id
    AND c.conversation_id=NEW.conversation_id AND c.state IN ('RINGING','ACTIVE');
  UPDATE chat_calls c SET state='ENDED'
  WHERE c.conversation_id=NEW.conversation_id AND c.state IN ('RINGING','ACTIVE')
    AND (NOT EXISTS (SELECT 1 FROM chat_call_participants p WHERE p.call_id=c.id)
      OR EXISTS (SELECT 1 FROM chat_conversations chat
        WHERE chat.id=c.conversation_id AND chat.conversation_type='DIRECT'));
  DELETE FROM chat_call_participants p USING chat_calls c
  WHERE p.call_id=c.id AND c.conversation_id=NEW.conversation_id AND c.state='ENDED';
  RETURN NEW;
END $$;

CREATE TRIGGER revoke_chat_call_membership
AFTER UPDATE OF left_at, removed_at ON chat_participants
FOR EACH ROW EXECUTE FUNCTION revoke_chat_call_membership();
