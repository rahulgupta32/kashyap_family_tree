CREATE TABLE media_inventory_runs (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 actor_id UUID NOT NULL REFERENCES user_accounts(id),
 storage_scope VARCHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','COMPLETE','CANCELLED')),
 phase VARCHAR(20) NOT NULL DEFAULT 'ASSETS' CHECK(phase IN ('ASSETS','OBJECTS','COMPLETE')),
 last_asset_id UUID,
 object_cursor JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX media_inventory_one_running ON media_inventory_runs((status)) WHERE status='RUNNING';
CREATE TABLE media_inventory_items (
 id BIGSERIAL PRIMARY KEY,
 run_id UUID NOT NULL REFERENCES media_inventory_runs(id),
 item_key VARCHAR(64) NOT NULL,
 asset_id UUID REFERENCES media_assets(id),
 finding VARCHAR(60) NOT NULL,
 bucket VARCHAR(80),
 observed_location TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(run_id,item_key,finding)
);
CREATE INDEX media_inventory_items_run ON media_inventory_items(run_id,id);
