-- Rollback Migration 007

DROP TABLE IF EXISTS notification_dispatches CASCADE;
DROP TABLE IF EXISTS data_retention_records CASCADE;

ALTER TABLE audit_outbox
  DROP COLUMN IF EXISTS notification_status,
  DROP COLUMN IF EXISTS notification_processed_at;

ALTER TABLE domain_rulesets
  DROP COLUMN IF EXISTS approval_resolution_number,
  DROP COLUMN IF EXISTS authority_body,
  DROP COLUMN IF EXISTS council_signatures;

ALTER TABLE media_assets
  DROP COLUMN IF EXISTS storage_path,
  DROP COLUMN IF EXISTS hmac_signature,
  DROP COLUMN IF EXISTS quarantine_status,
  DROP COLUMN IF EXISTS retention_status;

ALTER TABLE user_accounts
  DROP COLUMN IF EXISTS privacy_settings,
  DROP COLUMN IF EXISTS avatar_asset_id;

ALTER TABLE spouse_links
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS provenance;

ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS chk_calendar_events_date_validity,
  DROP COLUMN IF EXISTS tithi_year_bs,
  DROP COLUMN IF EXISTS tithi_month_bs,
  DROP COLUMN IF EXISTS tithi_paksha,
  DROP COLUMN IF EXISTS tithi_number,
  DROP COLUMN IF EXISTS tithi_name;

UPDATE calendar_events SET date_bs = '2083-01-01' WHERE date_bs IS NULL;
ALTER TABLE calendar_events ALTER COLUMN date_bs SET NOT NULL;
