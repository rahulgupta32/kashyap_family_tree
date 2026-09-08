-- ============================================================================
-- Migration: 000_schema_migrations.sql
-- Description: Idempotent Migration Tracking
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL,
    execution_time_ms INT NOT NULL
);
