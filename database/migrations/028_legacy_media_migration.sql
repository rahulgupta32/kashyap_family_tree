CREATE TABLE media_legacy_migration_queue (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 inventory_item_id BIGINT NOT NULL REFERENCES media_inventory_items(id),
 asset_id UUID NOT NULL REFERENCES media_assets(id),
 storage_scope VARCHAR(64) NOT NULL,
 source_location TEXT NOT NULL,
 source_bucket VARCHAR(80) NOT NULL,
 source_file_name VARCHAR(255) NOT NULL,
 source_checksum VARCHAR(64) NOT NULL,
 source_bytes BIGINT NOT NULL,
 source_mime_type VARCHAR(100) NOT NULL,
 approved_by UUID NOT NULL REFERENCES user_accounts(id),
 reason VARCHAR(1000) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSED','REVIEW_REQUIRED')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 error_code VARCHAR(80),
 destination_location TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 processed_at TIMESTAMPTZ,
 UNIQUE(asset_id,source_location)
);
CREATE INDEX media_legacy_migration_pending ON media_legacy_migration_queue(next_attempt_at) WHERE status='PENDING';
