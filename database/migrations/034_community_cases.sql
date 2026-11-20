ALTER TABLE community_reports ADD COLUMN evidence_sequence BIGSERIAL UNIQUE,
 ADD COLUMN reported_version INTEGER CHECK(reported_version > 0);
CREATE INDEX community_report_evidence ON community_reports(post_id,evidence_sequence DESC);
CREATE TABLE community_escalations (
 sequence BIGSERIAL PRIMARY KEY,
 post_id UUID NOT NULL REFERENCES community_posts(id),
 submitted_by UUID NOT NULL REFERENCES user_accounts(id),
 submitted_version INTEGER NOT NULL CHECK(submitted_version>0),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 1000),
 status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','WITHDRAWN')),
 resolved_by UUID REFERENCES user_accounts(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX community_open_escalation ON community_escalations(post_id) WHERE status='OPEN';
CREATE INDEX community_escalation_history ON community_escalations(post_id,sequence DESC);
