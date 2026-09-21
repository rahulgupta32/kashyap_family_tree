-- ============================================================================
-- Migration: 006_m4_workflow_and_governance_enhancements.down.sql
-- Description: Rollback additive schema enhancements for Milestone 4 workflows
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_workflow_state_transitions_immutable ON workflow_state_transitions;
DROP FUNCTION IF EXISTS trg_prevent_workflow_transitions_mutation();
DROP TABLE IF EXISTS workflow_state_transitions CASCADE;

DROP TRIGGER IF EXISTS trg_validate_dispute_attachment_claim ON claim_evidence_attachments;
DROP FUNCTION IF EXISTS trg_validate_dispute_attachment_claim_fn();

DROP TABLE IF EXISTS change_request_evidence_attachments CASCADE;
DROP TABLE IF EXISTS claim_disputes CASCADE;

DROP INDEX IF EXISTS idx_profile_claims_active_target;
DROP INDEX IF EXISTS idx_profile_claims_active_user;
DROP INDEX IF EXISTS idx_user_accounts_person_id_unique;
DROP INDEX IF EXISTS idx_persons_claimed_user_id_unique;

ALTER TABLE claim_evidence_attachments DROP COLUMN IF EXISTS dispute_id;

ALTER TABLE profile_claims
  DROP COLUMN IF EXISTS tier1_reviewed_by,
  DROP COLUMN IF EXISTS tier1_reviewed_at,
  DROP COLUMN IF EXISTS tier1_decision,
  DROP COLUMN IF EXISTS tier1_notes,
  DROP COLUMN IF EXISTS tier2_reviewed_by,
  DROP COLUMN IF EXISTS tier2_reviewed_at,
  DROP COLUMN IF EXISTS tier2_decision,
  DROP COLUMN IF EXISTS tier2_notes,
  DROP COLUMN IF EXISTS correction_request_notes,
  DROP COLUMN IF EXISTS resubmission_count,
  DROP COLUMN IF EXISTS version;

ALTER TABLE genealogy_change_requests
  DROP COLUMN IF EXISTS base_version,
  DROP COLUMN IF EXISTS correction_notes,
  DROP COLUMN IF EXISTS resubmission_count,
  DROP COLUMN IF EXISTS version;

ALTER TABLE domain_rulesets
  DROP COLUMN IF EXISTS effective_from,
  DROP COLUMN IF EXISTS effective_until,
  DROP COLUMN IF EXISTS signed_by_reviewer_id,
  DROP COLUMN IF EXISTS signed_by_authority_id,
  DROP COLUMN IF EXISTS approval_evidence;

ALTER TABLE cultural_articles
  DROP COLUMN IF EXISTS lifecycle_state,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS provenance;

ALTER TABLE calendar_events
  DROP COLUMN IF EXISTS audience_scope,
  DROP COLUMN IF EXISTS branch_id,
  DROP COLUMN IF EXISTS provenance;

ALTER TABLE notification_preferences
  DROP COLUMN IF EXISTS email_enabled;
