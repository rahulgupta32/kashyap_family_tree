-- ============================================================================
-- Migration: 003_audit_outbox_unique_event.down.sql
-- Description: Rollback uniqueness constraint on audit_logs(outboxId)
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

DROP INDEX IF EXISTS uq_audit_logs_outbox_id;