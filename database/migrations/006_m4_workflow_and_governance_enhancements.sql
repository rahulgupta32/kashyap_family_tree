-- ============================================================================
-- Migration: 006_m4_workflow_and_governance_enhancements.sql
-- Description: Complete additive schema enhancements for Milestone 4 workflows
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

-- 1. Profile Claims 2-Tier Workflow & Resubmission Enhancements
ALTER TABLE profile_claims 
  ADD COLUMN IF NOT EXISTS tier1_reviewed_by UUID REFERENCES user_accounts(id),
  ADD COLUMN IF NOT EXISTS tier1_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier1_decision VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tier1_notes TEXT,
  ADD COLUMN IF NOT EXISTS tier2_reviewed_by UUID REFERENCES user_accounts(id),
  ADD COLUMN IF NOT EXISTS tier2_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier2_decision VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tier2_notes TEXT,
  ADD COLUMN IF NOT EXISTS correction_request_notes TEXT,
  ADD COLUMN IF NOT EXISTS resubmission_count INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 NOT NULL;

-- Normalize existing legacy statuses to M4 canonical state machine
UPDATE profile_claims SET status = 'PENDING_TIER1' WHERE status IN ('SUBMITTED', 'IN_REVIEW');
UPDATE profile_claims SET status = 'CORRECTION_REQUESTED' WHERE status = 'ADDITIONAL_INFO_REQUESTED';
UPDATE profile_claims SET status = 'WITHDRAWN' WHERE status = 'CANCELLED';
ALTER TABLE profile_claims ALTER COLUMN status SET DEFAULT 'PENDING_TIER1';

-- 2. Concurrency & Ownership Constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_claims_active_target
  ON profile_claims(target_person_id) 
  WHERE status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED', 'DISPUTED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_claims_active_user
  ON profile_claims(claimant_user_id) 
  WHERE status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_person_id_unique
  ON user_accounts(person_id) WHERE person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_persons_claimed_user_id_unique
  ON persons(claimed_user_id) WHERE claimed_user_id IS NOT NULL;

-- 3. Claim Disputes Table
CREATE TABLE IF NOT EXISTS claim_disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES profile_claims(id) ON DELETE CASCADE,
    disputant_user_id UUID NOT NULL REFERENCES user_accounts(id),
    reason TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'OPEN' NOT NULL, -- OPEN, UNDER_REVIEW, RESOLVED, DISMISSED
    resolution_notes TEXT,
    resolved_by UUID REFERENCES user_accounts(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Claim Evidence Attachments Dispute Linkage & Validation Trigger
ALTER TABLE claim_evidence_attachments
  ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES claim_disputes(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION trg_validate_dispute_attachment_claim_fn()
RETURNS TRIGGER AS $$
DECLARE
    dispute_claim_id UUID;
BEGIN
    IF NEW.dispute_id IS NOT NULL THEN
        SELECT claim_id INTO dispute_claim_id FROM claim_disputes WHERE id = NEW.dispute_id;
        IF dispute_claim_id IS NULL OR dispute_claim_id <> NEW.claim_id THEN
            RAISE EXCEPTION 'Dispute % belongs to claim %, which does not match attachment claim %', NEW.dispute_id, dispute_claim_id, NEW.claim_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_dispute_attachment_claim ON claim_evidence_attachments;
CREATE TRIGGER trg_validate_dispute_attachment_claim
BEFORE INSERT OR UPDATE ON claim_evidence_attachments
FOR EACH ROW EXECUTE FUNCTION trg_validate_dispute_attachment_claim_fn();

-- 5. Immutable Workflow State Transitions Table & Trigger
CREATE TABLE IF NOT EXISTS workflow_state_transitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- 'PROFILE_CLAIM' | 'CHANGE_REQUEST' | 'DISPUTE'
    entity_id UUID NOT NULL,
    from_state VARCHAR(30) NOT NULL,
    to_state VARCHAR(30) NOT NULL,
    actor_user_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
    reason_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE OR REPLACE FUNCTION trg_prevent_workflow_transitions_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'workflow_state_transitions records are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_state_transitions_immutable ON workflow_state_transitions;
CREATE TRIGGER trg_workflow_state_transitions_immutable
BEFORE UPDATE OR DELETE ON workflow_state_transitions
FOR EACH ROW EXECUTE FUNCTION trg_prevent_workflow_transitions_mutation();

-- 6. Genealogy Change Requests Base Versioning, Evidence & State Alignment
ALTER TABLE genealogy_change_requests
  ADD COLUMN IF NOT EXISTS base_version INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_notes TEXT,
  ADD COLUMN IF NOT EXISTS resubmission_count INT DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 NOT NULL;

UPDATE genealogy_change_requests SET status = 'PENDING' WHERE status = 'IN_REVIEW';
UPDATE genealogy_change_requests SET status = 'WITHDRAWN' WHERE status = 'CANCELLED';

-- Safe historical version backfill
UPDATE genealogy_change_requests
SET base_version = (current_snapshot->>'version')::INT
WHERE (current_snapshot->>'version') ~ '^[0-9]+$' AND target_person_id IS NOT NULL;

UPDATE genealogy_change_requests
SET base_version = 0
WHERE base_version IS NULL OR (base_version = 1 AND current_snapshot->>'version' IS NULL);

-- Change Request Evidence Attachments Table (CHG-FR-007)
CREATE TABLE IF NOT EXISTS change_request_evidence_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    change_request_id UUID NOT NULL REFERENCES genealogy_change_requests(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    sha256_hash VARCHAR(64),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Domain Rulesets Approval Evidence & Effective Window (HG-002, HG-003, HG-004)
ALTER TABLE domain_rulesets
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effective_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_by_reviewer_id UUID REFERENCES user_accounts(id),
  ADD COLUMN IF NOT EXISTS signed_by_authority_id UUID REFERENCES user_accounts(id),
  ADD COLUMN IF NOT EXISTS approval_evidence JSONB;

-- 8. Cultural Articles Lifecycle & Governance (CUL-FR-003, CUL-FR-006)
ALTER TABLE cultural_articles
  ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(30) DEFAULT 'DRAFT' NOT NULL,
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES user_accounts(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provenance JSONB;

UPDATE cultural_articles 
SET lifecycle_state = 'PUBLISHED', approved_by = author_id, approved_at = published_at
WHERE is_published = TRUE AND author_id IS NOT NULL;

-- 9. Calendar Events Audience & Provenance (CAL-FR-002, CAL-FR-011)
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS audience_scope VARCHAR(30) DEFAULT 'PRIVATE' NOT NULL,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS provenance JSONB;

UPDATE calendar_events
SET audience_scope = CASE WHEN is_public = TRUE THEN 'PUBLIC' ELSE 'PRIVATE' END;

-- 10. Additive Enhancements to Existing Notification Preferences
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL;

INSERT INTO notification_preferences(user_id, push_enabled, sms_enabled, family_events_enabled, jutho_alerts_enabled, community_posts_enabled, email_enabled)
SELECT id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM user_accounts
ON CONFLICT (user_id) DO NOTHING;
