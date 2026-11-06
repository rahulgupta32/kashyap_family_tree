CREATE TABLE community_post_media (
 asset_id UUID PRIMARY KEY REFERENCES media_assets(id),
 post_id UUID NOT NULL REFERENCES community_posts(id),
 client_upload_id UUID NOT NULL,
 submitted_version INTEGER NOT NULL,
 change_reason TEXT NOT NULL CHECK(length(change_reason) BETWEEN 5 AND 1000),
 removed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(post_id,client_upload_id)
);
CREATE UNIQUE INDEX community_one_current_image ON community_post_media(post_id) WHERE removed_at IS NULL;
CREATE TABLE community_revision_media (
 post_id UUID NOT NULL,
 version INTEGER NOT NULL,
 asset_id UUID NOT NULL REFERENCES community_post_media(asset_id),
 PRIMARY KEY(post_id,version,asset_id),
 FOREIGN KEY(post_id,version) REFERENCES community_post_revisions(post_id,version)
);
