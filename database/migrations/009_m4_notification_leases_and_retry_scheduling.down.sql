ALTER TABLE notification_dispatches
  DROP COLUMN IF EXISTS worker_id,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS provider_response;
