-- Destructive rollback removes revision history; export it before an approved rollback.
DROP TABLE IF EXISTS community_post_revisions;
