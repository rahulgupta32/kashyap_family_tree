CREATE TABLE chat_message_reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 message_id UUID NOT NULL REFERENCES chat_messages(id),
 reporter_id UUID NOT NULL REFERENCES user_accounts(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DISMISSED','REMOVED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 resolved_by UUID REFERENCES user_accounts(id),
 resolved_at TIMESTAMPTZ,
 resolution_note TEXT,
 UNIQUE(message_id,reporter_id),
 CHECK((status='OPEN' AND resolved_by IS NULL AND resolved_at IS NULL AND resolution_note IS NULL)
 OR (status<>'OPEN' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution_note IS NOT NULL AND length(resolution_note) BETWEEN 1 AND 1000))
);
CREATE INDEX idx_chat_reports_status ON chat_message_reports(status,created_at,id);
