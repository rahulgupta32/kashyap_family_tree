-- Additive persistence for the community workflow. Existing lineage is untouched.
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS title VARCHAR(180) NOT NULL DEFAULT '';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'DISCUSSION';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_community_posts_feed ON community_posts(branch_id, status, created_at DESC, id);
CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id),
  author_user_id UUID NOT NULL REFERENCES user_accounts(id),
  parent_comment_id UUID REFERENCES community_comments(id),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, created_at, id);
CREATE TABLE IF NOT EXISTS community_reactions (
  post_id UUID NOT NULL REFERENCES community_posts(id),
  user_id UUID NOT NULL REFERENCES user_accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id),
  reporter_user_id UUID NOT NULL REFERENCES user_accounts(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'RESOLVED')),
  reviewed_by UUID REFERENCES user_accounts(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_report_open ON community_reports(post_id, reporter_user_id) WHERE status = 'OPEN';
