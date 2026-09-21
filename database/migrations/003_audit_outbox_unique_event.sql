-- ============================================================================
-- Migration: 003_audit_outbox_unique_event.sql
-- Description: Enforce database uniqueness for outbox event identity in audit_logs
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

-- Ensure each outbox event can only ever produce at most one immutable audit log entry.
-- This partial unique index enforces database-level uniqueness for the outbox event identity
-- on (new_value->>'outboxId'), preventing race conditions and duplicate audit entries under
-- concurrent processing or retry execution.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_outbox_id 
ON audit_logs ((new_value->>'outboxId')) 
WHERE (new_value->>'outboxId') IS NOT NULL;