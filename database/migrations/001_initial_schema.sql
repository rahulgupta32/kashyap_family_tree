-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Complete Baseline Schema for Kashyap Adhikari Family Tree
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Identity & Auth (AUTH-FR-001..012, PRIV-FR-001..008)
CREATE TABLE IF NOT EXISTS user_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    is_phone_verified BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_suspended BOOLEAN DEFAULT FALSE NOT NULL,
    suspension_reason TEXT,
    preferred_language VARCHAR(5) DEFAULT 'ne' NOT NULL,
    person_id UUID, -- De-linked on user deletion/deactivation to preserve immutable genealogy
    consent_given BOOLEAN DEFAULT FALSE NOT NULL,
    consent_version VARCHAR(20),
    consent_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    branch_id UUID, -- Tenant/branch scope for branch admins/verifiers
    granted_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, role, branch_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_id VARCHAR(100),
    device_platform VARCHAR(20) NOT NULL, -- 'android' | 'ios' | 'web'
    device_name VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Branches & Lineage Reference (GEN-FR-011, GEN-FR-012)
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_nepali VARCHAR(100) NOT NULL,
    name_english VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    mool_ghar VARCHAR(200),
    kuldevata VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Core Genealogy: Persons & Names (GEN-FR-001..018, PROF-FR-001..012)
CREATE TABLE IF NOT EXISTS persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id),
    generation INT NOT NULL DEFAULT 1 CHECK (generation >= 1 AND generation <= 100),
    gender VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN',
    living_status VARCHAR(10) NOT NULL DEFAULT 'LIVING',
    
    -- Dates (Bikram Sambat & Gregorian)
    birth_year_bs INT CHECK (birth_year_bs >= 1500 AND birth_year_bs <= 2200),
    birth_date_bs VARCHAR(20),
    birth_date_ad DATE,
    birth_place VARCHAR(200),
    death_year_bs INT CHECK (death_year_bs >= 1500 AND death_year_bs <= 2200),
    death_date_bs VARCHAR(20),
    death_date_ad DATE,
    death_place VARCHAR(200),

    -- Heritage details
    gotra VARCHAR(100) DEFAULT 'कश्यप' NOT NULL,
    kuldevata VARCHAR(200),
    mool_ghar VARCHAR(200),
    current_address VARCHAR(255),
    occupation VARCHAR(150),
    education VARCHAR(150),
    biography TEXT,
    avatar_asset_id UUID,

    -- Privacy Visibility Classifications (PROF-FR-005, PRIV-FR-001..008)
    phone_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY' NOT NULL,
    address_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY' NOT NULL,
    dob_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY' NOT NULL,
    is_minor_protected BOOLEAN DEFAULT FALSE NOT NULL,

    -- Status, Claim & Retention
    is_claimed BOOLEAN DEFAULT FALSE NOT NULL,
    claimed_user_id UUID REFERENCES user_accounts(id),
    is_archived BOOLEAN DEFAULT FALSE NOT NULL,
    archive_reason TEXT,
    
    created_by UUID REFERENCES user_accounts(id),
    updated_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_death_after_birth CHECK (
        death_year_bs IS NULL OR birth_year_bs IS NULL OR death_year_bs >= birth_year_bs
    )
);

CREATE TABLE IF NOT EXISTS person_names (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    language VARCHAR(5) NOT NULL, -- 'ne' or 'en'
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(person_id, language, is_primary) DEFERRABLE INITIALLY DEFERRED
);

-- Trigram Indexes for Nepali and English name searching (SRCH-FR-001..008)
CREATE INDEX IF NOT EXISTS idx_person_names_fullname_trgm ON person_names USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persons_branch_gen ON persons(branch_id, generation);
CREATE INDEX IF NOT EXISTS idx_persons_claimed_user ON persons(claimed_user_id) WHERE claimed_user_id IS NOT NULL;

-- 4. Directed Genealogy Graph Links (GEN-FR-005..008)
CREATE TABLE IF NOT EXISTS parent_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES persons(id),
    child_id UUID NOT NULL REFERENCES persons(id),
    parent_type VARCHAR(20) DEFAULT 'BIOLOGICAL' NOT NULL, -- BIOLOGICAL, ADOPTIVE
    confidence VARCHAR(20) DEFAULT 'VERIFIED' NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_no_self_parent CHECK (parent_id <> child_id),
    UNIQUE(parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS spouse_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id UUID NOT NULL REFERENCES persons(id),
    spouse_id UUID NOT NULL REFERENCES persons(id),
    status VARCHAR(20) DEFAULT 'CURRENT' NOT NULL, -- CURRENT, DIVORCED, WIDOWED, SEPARATED
    marriage_date_bs VARCHAR(20),
    marriage_date_ad DATE,
    notes TEXT,
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_no_self_spouse CHECK (person_id <> spouse_id),
    UNIQUE(person_id, spouse_id)
);

-- 5. Profile Claims & Verification (CLAIM-FR-001..012)
CREATE TABLE IF NOT EXISTS profile_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_person_id UUID NOT NULL REFERENCES persons(id),
    claimant_user_id UUID NOT NULL REFERENCES user_accounts(id),
    status VARCHAR(30) DEFAULT 'SUBMITTED' NOT NULL,
    relationship_description TEXT NOT NULL,
    known_family_members JSONB,
    statement_of_truth BOOLEAN NOT NULL DEFAULT TRUE,
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_statement_of_truth CHECK (statement_of_truth = TRUE)
);

CREATE TABLE IF NOT EXISTS claim_evidence_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES profile_claims(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL, -- 'citizenship' | 'birth_certificate' | 'family_photo' | 'other'
    sha256_hash VARCHAR(64),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Governed Genealogy Change Requests (CHG-FR-001..015)
CREATE TABLE IF NOT EXISTS genealogy_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_person_id UUID REFERENCES persons(id),
    requester_user_id UUID NOT NULL REFERENCES user_accounts(id),
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
    proposed_changes JSONB NOT NULL,
    current_snapshot JSONB,
    reason TEXT NOT NULL,
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Duplicates & Merge Management (DUP-FR-001..009)
CREATE TABLE IF NOT EXISTS duplicate_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_a_id UUID NOT NULL REFERENCES persons(id),
    person_b_id UUID NOT NULL REFERENCES persons(id),
    confidence_score NUMERIC(5, 2) NOT NULL,
    detection_signals JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'DETECTED' NOT NULL,
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_diff_duplicate_persons CHECK (person_a_id <> person_b_id),
    UNIQUE(person_a_id, person_b_id)
);

CREATE TABLE IF NOT EXISTS duplicate_merges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    surviving_person_id UUID NOT NULL REFERENCES persons(id),
    merged_person_id UUID NOT NULL REFERENCES persons(id),
    audit_snapshot JSONB NOT NULL,
    executed_by UUID NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 8. Domain Rules & Cultural Content (REL-FR-001..013, CUL-FR-001..010)
CREATE TABLE IF NOT EXISTS domain_rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(50) NOT NULL, -- NATA_SAINO, JUTHO_SUTOK, TITHI_SHRADDHA
    version VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    rules_data JSONB NOT NULL,
    signed_by_reviewer VARCHAR(100),
    signed_by_authority VARCHAR(100),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(rule_type, version)
);

CREATE TABLE IF NOT EXISTS cultural_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title_nepali VARCHAR(255) NOT NULL,
    title_english VARCHAR(255),
    slug VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    content_nepali TEXT NOT NULL,
    content_english TEXT,
    cover_image_id UUID,
    is_published BOOLEAN DEFAULT FALSE NOT NULL,
    published_at TIMESTAMPTZ,
    author_id UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. Calendar Events, Invitations & Jutho (CAL-FR-001..013, JUT-FR-001..009, INV-FR-001..012)
CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    description TEXT,
    date_bs VARCHAR(20) NOT NULL,
    date_ad DATE,
    tithi VARCHAR(50),
    location VARCHAR(255),
    host_user_id UUID NOT NULL REFERENCES user_accounts(id),
    is_public BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS event_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES user_accounts(id),
    rsvp_status VARCHAR(20) DEFAULT 'INVITED' NOT NULL,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(event_id, invited_user_id)
);

CREATE TABLE IF NOT EXISTS jutho_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deceased_person_id UUID NOT NULL REFERENCES persons(id),
    death_date_bs VARCHAR(20) NOT NULL,
    death_date_ad DATE,
    ruleset_version VARCHAR(20) NOT NULL,
    affected_lineage_cache JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 10. Community & Chat (COM-FR-001..014, CHAT-FR-001..014)
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_user_id UUID NOT NULL REFERENCES user_accounts(id),
    content TEXT NOT NULL,
    media_asset_ids UUID[],
    status VARCHAR(30) DEFAULT 'PUBLISHED' NOT NULL,
    likes_count INT DEFAULT 0 NOT NULL,
    comments_count INT DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_group BOOLEAN DEFAULT FALSE NOT NULL,
    title VARCHAR(150),
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(id),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES user_accounts(id),
    message_text TEXT NOT NULL,
    media_asset_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 11. Media Assets & Devices (MEDIA-FR-001..006, NOT-FR-001..011)
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_user_id UUID NOT NULL REFERENCES user_accounts(id),
    storage_key VARCHAR(500) NOT NULL,
    bucket VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256_checksum VARCHAR(64),
    is_private BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    push_token VARCHAR(500),
    device_platform VARCHAR(20) NOT NULL,
    app_version VARCHAR(20),
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    sms_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    family_events_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    jutho_alerts_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    community_posts_enabled BOOLEAN DEFAULT TRUE NOT NULL
);

-- 12. Append-Only Immutable Audit Log (AUD-FR-001..005, ADR-011)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES user_accounts(id),
    actor_role VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    prev_record_hash VARCHAR(64) NOT NULL,
    current_record_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Database Trigger rejecting modifications/deletions on audit_logs
CREATE OR REPLACE FUNCTION reject_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are strictly prohibited per ADR-011.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_modification();
