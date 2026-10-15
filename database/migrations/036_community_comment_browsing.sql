CREATE INDEX idx_community_comments_browse ON community_comments(post_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
