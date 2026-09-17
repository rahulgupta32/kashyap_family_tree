-- ============================================================================
-- Migration: 009_m4_notification_leases_and_retry_scheduling.sql
-- Description: Notification worker leasing, exponential backoff, and provider response tracking
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

ALTER TABLE notification_dispatches
  ADD COLUMN IF NOT EXISTS worker_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_response JSONB;

CREATE INDEX IF NOT EXISTS idx_notification_dispatches_retry_claiming 
  ON notification_dispatches(delivery_status, next_retry_at, lease_expires_at);
