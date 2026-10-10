CREATE TABLE community_moderation_decisions (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 post_id UUID NOT NULL REFERENCES community_posts(id),
 version INTEGER NOT NULL,
 reviewer_user_id UUID NOT NULL REFERENCES user_accounts(id),
 decision VARCHAR(20) NOT NULL CHECK(decision IN ('PUBLISHED','REJECTED')),
 notes TEXT NOT NULL CHECK(char_length(notes) BETWEEN 5 AND 1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(post_id,version)
);
CREATE TABLE community_post_appeals (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 decision_id UUID NOT NULL UNIQUE REFERENCES community_moderation_decisions(id),
 post_id UUID NOT NULL REFERENCES community_posts(id),
 author_user_id UUID NOT NULL REFERENCES user_accounts(id),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 1000),
 status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED','WITHDRAWN')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX community_one_open_appeal ON community_post_appeals(post_id) WHERE status='OPEN';
