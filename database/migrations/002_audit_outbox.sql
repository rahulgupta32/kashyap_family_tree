-- ============================================================================
-- Migration: 002_audit_outbox.sql
-- Description: Durable Audit Outbox for Asynchronous / Fail-Safe Security Audits
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    actor_id VARCHAR(100),
    actor_role VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_outbox_status_created ON audit_outbox(status, created_at) WHERE status = 'PENDING';
