-- ============================================================================
-- Migration: 001_initial_schema.down.sql
-- Description: Reversible Rollback Script for 001_initial_schema.sql
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
DROP FUNCTION IF EXISTS reject_audit_log_modification();

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS media_assets CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_participants CASCADE;
DROP TABLE IF EXISTS chat_conversations CASCADE;
DROP TABLE IF EXISTS community_posts CASCADE;
DROP TABLE IF EXISTS jutho_records CASCADE;
DROP TABLE IF EXISTS event_invitations CASCADE;
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS cultural_articles CASCADE;
DROP TABLE IF EXISTS domain_rulesets CASCADE;
DROP TABLE IF EXISTS duplicate_merges CASCADE;
DROP TABLE IF EXISTS duplicate_candidates CASCADE;
DROP TABLE IF EXISTS genealogy_change_requests CASCADE;
DROP TABLE IF EXISTS claim_evidence_attachments CASCADE;
DROP TABLE IF EXISTS profile_claims CASCADE;
DROP TABLE IF EXISTS spouse_links CASCADE;
DROP TABLE IF EXISTS parent_links CASCADE;
DROP TABLE IF EXISTS person_names CASCADE;
DROP TABLE IF EXISTS persons CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS user_accounts CASCADE;
