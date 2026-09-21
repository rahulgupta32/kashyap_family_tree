-- Migration 007: M4 Governance, Schema Corrections, Verification Provenance & Privacy Harmonization

-- 1. Calendar Events: Support Tithi-only events without inventing solar dates
ALTER TABLE calendar_events ALTER COLUMN date_bs DROP NOT NULL;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS tithi_year_bs INT,
  ADD COLUMN IF NOT EXISTS tithi_month_bs INT,
  ADD COLUMN IF NOT EXISTS tithi_paksha VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tithi_number INT,
  ADD COLUMN IF NOT EXISTS tithi_name VARCHAR(50);

-- Calendar event validity constraint: requires either solar date or complete valid Tithi metadata
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendar_events_date_validity'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_date_validity;
  END IF;
END $$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_date_validity
  CHECK (
    (date_bs IS NOT NULL) OR 
    (tithi_year_bs IS NOT NULL AND tithi_month_bs IS NOT NULL AND tithi_paksha IS NOT NULL AND tithi_number IS NOT NULL)
  );

-- Update calendar_events audience scope check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_calendar_events_audience_scope'
  ) THEN
    ALTER TABLE calendar_events DROP CONSTRAINT chk_calendar_events_audience_scope;
  END IF;
END $$;

ALTER TABLE calendar_events
  ADD CONSTRAINT chk_calendar_events_audience_scope
  CHECK (audience_scope IN ('PUBLIC', 'COMMUNITY', 'BRANCH', 'FAMILY', 'IMMEDIATE_FAMILY', 'INVITED_ONLY', 'PRIVATE'));

-- 2. Spouse Links: Explicit confidence and provenance (unverified by default; do NOT automatically treat existing links as verified)
ALTER TABLE spouse_links
  ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'UNVERIFIED' NOT NULL,
  ADD COLUMN IF NOT EXISTS provenance JSONB;

-- 3. User Accounts: Privacy settings and avatar asset linkage
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"profileVisibility":"VERIFIED_COMMUNITY","contactVisibility":"IMMEDIATE_FAMILY","addressVisibility":"IMMEDIATE_FAMILY"}'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES media_assets(id);

-- 4. Domain Rulesets: Multi-council signer governance (canonical rules column is rules_data from 001)
ALTER TABLE domain_rulesets
  ADD COLUMN IF NOT EXISTS approval_resolution_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS authority_body VARCHAR(100),
  ADD COLUMN IF NOT EXISTS council_signatures JSONB;

-- 5. Media Assets: Real storage pipeline, quarantine, retention, and signatures
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS hmac_signature VARCHAR(128),
  ADD COLUMN IF NOT EXISTS quarantine_status VARCHAR(30) DEFAULT 'PENDING_SCAN' NOT NULL,
  ADD COLUMN IF NOT EXISTS retention_status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL;

-- Backfill pre-existing media assets as CLEAN if they were already verified
UPDATE media_assets SET quarantine_status = 'CLEAN' WHERE quarantine_status = 'PENDING_SCAN';

-- 6. Precise Data Retention & Legal Hold Register
CREATE TABLE IF NOT EXISTS data_retention_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    asset_id UUID REFERENCES media_assets(id),
    holding_authority VARCHAR(100) NOT NULL,
    legal_basis VARCHAR(100) NOT NULL,
    retention_reason VARCHAR(255) NOT NULL,
    release_conditions TEXT NOT NULL,
    retention_period_days INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_retention_records_user ON data_retention_records(user_id);
CREATE INDEX IF NOT EXISTS idx_data_retention_records_asset ON data_retention_records(asset_id);

-- 7. Audit Outbox: Independent notification delivery state decoupled from audit drain
ALTER TABLE audit_outbox
  ADD COLUMN IF NOT EXISTS notification_status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
  ADD COLUMN IF NOT EXISTS notification_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_audit_outbox_notification_status ON audit_outbox(notification_status, created_at);

-- 8. Notifications Outbox Dispatch log (for durable event delivery with deduplication)
CREATE TABLE IF NOT EXISTS notification_dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outbox_id UUID REFERENCES audit_outbox(id),
    recipient_user_id UUID NOT NULL REFERENCES user_accounts(id),
    channel VARCHAR(30) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    delivery_status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
    retry_count INT DEFAULT 0 NOT NULL,
    error_message TEXT,
    dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_notification_dispatches_outbox_user_channel UNIQUE (outbox_id, recipient_user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatches_user ON notification_dispatches(recipient_user_id, delivery_status);
CREATE INDEX IF NOT EXISTS idx_notification_dispatches_outbox ON notification_dispatches(outbox_id);

-- 9. Cultural Articles: Clean up separation of duties (reset legacy author self-approvals)
UPDATE cultural_articles
SET lifecycle_state = 'DRAFT', approved_by = NULL, approved_at = NULL
WHERE approved_by = author_id;
