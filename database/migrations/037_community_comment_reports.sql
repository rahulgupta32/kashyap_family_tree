CREATE TABLE community_comment_reports (
 sequence BIGSERIAL PRIMARY KEY,
 comment_id UUID NOT NULL REFERENCES community_comments(id),
 reporter_user_id UUID NOT NULL REFERENCES user_accounts(id),
 category VARCHAR(30) NOT NULL CHECK(category IN ('ABUSE','PRIVACY','SPAM','OTHER')),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 1000),
 status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','KEPT','REMOVED','WITHDRAWN')),
 reviewed_by UUID REFERENCES user_accounts(id),
 review_notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_comment_report_open ON community_comment_reports(comment_id,reporter_user_id) WHERE status='OPEN';
CREATE INDEX idx_comment_report_comment ON community_comment_reports(comment_id,sequence DESC);
