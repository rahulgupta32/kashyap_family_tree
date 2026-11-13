DROP TABLE IF EXISTS community_reports;
DROP TABLE IF EXISTS community_reactions;
DROP TABLE IF EXISTS community_comments;
DROP INDEX IF EXISTS idx_community_posts_feed;
ALTER TABLE community_posts DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS branch_id, DROP COLUMN IF EXISTS category, DROP COLUMN IF EXISTS title;
