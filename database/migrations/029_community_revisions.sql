-- Preserve the current snapshot of existing posts; older edits cannot be reconstructed.
CREATE TABLE community_post_revisions (
  post_id UUID NOT NULL REFERENCES community_posts(id),
  version INTEGER NOT NULL CHECK (version > 0),
  editor_user_id UUID NOT NULL REFERENCES user_accounts(id),
  title VARCHAR(180) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, version)
);
INSERT INTO community_post_revisions(post_id,version,editor_user_id,title,content,category,reason)
SELECT id,version,author_user_id,title,content,category,'Snapshot at revision-history rollout'
FROM community_posts;
