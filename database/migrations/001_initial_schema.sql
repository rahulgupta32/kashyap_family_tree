-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Complete Baseline Schema for Kashyap Adhikari Family Tree
-- Author: Jyphra Technology Pvt. Ltd.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 1. Identity & Auth
CREATE TABLE IF NOT EXISTS user_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_suspended BOOLEAN DEFAULT FALSE,
    suspension_reason TEXT,
    preferred_language VARCHAR(5) DEFAULT 'ne',
    person_id UUID, -- De-linked on user deletion to preserve genealogy
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    branch_id UUID, -- Scope for branch admins/verifiers
    granted_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role, branch_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_id VARCHAR(100),
    device_platform VARCHAR(20),
    device_name VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Branches & Lineage Reference
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_nepali VARCHAR(100) NOT NULL,
    name_english VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE,
    mool_ghar VARCHAR(200),
    kuldevata VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Core Genealogy: Persons & Names
CREATE TABLE IF NOT EXISTS persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id),
    generation INT NOT NULL DEFAULT 1,
    gender VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN',
    living_status VARCHAR(10) NOT NULL DEFAULT 'LIVING',
    
    -- Dates (Bikram Sambat & Gregorian)
    birth_year_bs INT,
    birth_date_bs VARCHAR(20),
    birth_date_ad DATE,
    birth_place VARCHAR(200),
    death_year_bs INT,
    death_date_bs VARCHAR(20),
    death_date_ad DATE,
    death_place VARCHAR(200),

    -- Heritage details
    gotra VARCHAR(100) DEFAULT 'कश्यप',
    kuldevata VARCHAR(200),
    mool_ghar VARCHAR(200),
    current_address VARCHAR(255),
    occupation VARCHAR(150),
    education VARCHAR(150),
    biography TEXT,
    avatar_asset_id UUID,

    -- Privacy Visibility Settings
    phone_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY',
    address_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY',
    dob_visibility VARCHAR(30) DEFAULT 'VERIFIED_COMMUNITY',

    -- Status & Claim
    is_claimed BOOLEAN DEFAULT FALSE,
    claimed_user_id UUID REFERENCES user_accounts(id),
    is_archived BOOLEAN DEFAULT FALSE,
    archive_reason TEXT,
    
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS person_names (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    language VARCHAR(5) NOT NULL, -- 'ne' or 'en'
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Trigram Indexes for Nepali and English name searching
CREATE INDEX IF NOT EXISTS idx_person_names_fullname_trgm ON person_names USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persons_branch_gen ON persons(branch_id, generation);

-- 4. Directed Genealogy Graph Links
CREATE TABLE IF NOT EXISTS parent_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES persons(id),
    child_id UUID NOT NULL REFERENCES persons(id),
    parent_type VARCHAR(20) DEFAULT 'BIOLOGICAL', -- BIOLOGICAL, ADOPTIVE
    confidence VARCHAR(20) DEFAULT 'VERIFIED',
    notes TEXT,
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_no_self_parent CHECK (parent_id <> child_id),
    UNIQUE(parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS spouse_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id UUID NOT NULL REFERENCES persons(id),
    spouse_id UUID NOT NULL REFERENCES persons(id),
    status VARCHAR(20) DEFAULT 'CURRENT', -- CURRENT, DIVORCED, WIDOWED
    marriage_date_bs VARCHAR(20),
    marriage_date_ad DATE,
    notes TEXT,
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_no_self_spouse CHECK (person_id <> spouse_id),
    UNIQUE(person_id, spouse_id)
);

-- 5. Profile Claims & Verification
CREATE TABLE IF NOT EXISTS profile_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_person_id UUID NOT NULL REFERENCES persons(id),
    claimant_user_id UUID NOT NULL REFERENCES user_accounts(id),
    status VARCHAR(30) DEFAULT 'SUBMITTED',
    relationship_description TEXT NOT NULL,
    known_family_members JSONB,
    statement_of_truth BOOLEAN NOT NULL DEFAULT TRUE,
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim_evidence_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES profile_claims(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Governed Genealogy Change Requests
CREATE TABLE IF NOT EXISTS genealogy_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_person_id UUID REFERENCES persons(id),
    requester_user_id UUID NOT NULL REFERENCES user_accounts(id),
    request_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING',
    proposed_changes JSONB NOT NULL,
    current_snapshot JSONB,
    reason TEXT NOT NULL,
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Duplicates & Merge Management
CREATE TABLE IF NOT EXISTS duplicate_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_a_id UUID NOT NULL REFERENCES persons(id),
    person_b_id UUID NOT NULL REFERENCES persons(id),
    confidence_score NUMERIC(5, 2) NOT NULL,
    detection_signals JSONB NOT NULL,
    status VARCHAR(30) DEFAULT 'DETECTED',
    review_notes TEXT,
    reviewed_by UUID REFERENCES user_accounts(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_diff_duplicate_persons CHECK (person_a_id <> person_b_id),
    UNIQUE(person_a_id, person_b_id)
);

CREATE TABLE IF NOT EXISTS duplicate_merges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    surviving_person_id UUID NOT NULL REFERENCES persons(id),
    merged_person_id UUID NOT NULL REFERENCES persons(id),
    audit_snapshot JSONB NOT NULL,
    executed_by UUID NOT NULL REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Domain Rules & Cultural Content
CREATE TABLE IF NOT EXISTS domain_rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_type VARCHAR(50) NOT NULL, -- NATA_SAINO, JUTHO_SUTOK, etc.
    version VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    rules_data JSONB NOT NULL,
    signed_by_reviewer VARCHAR(100),
    signed_by_authority VARCHAR(100),
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
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
    is_published BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    author_id UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 9. Calendar Events, Invitations & Jutho
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
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES user_accounts(id),
    rsvp_status VARCHAR(20) DEFAULT 'INVITED',
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, invited_user_id)
);

CREATE TABLE IF NOT EXISTS jutho_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deceased_person_id UUID NOT NULL REFERENCES persons(id),
    death_date_bs VARCHAR(20) NOT NULL,
    death_date_ad DATE,
    ruleset_version VARCHAR(20) NOT NULL,
    affected_lineage_cache JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Community & Chat
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_user_id UUID NOT NULL REFERENCES user_accounts(id),
    content TEXT NOT NULL,
    media_asset_ids UUID[],
    status VARCHAR(30) DEFAULT 'PUBLISHED',
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    is_group BOOLEAN DEFAULT FALSE,
    title VARCHAR(150),
    created_by UUID REFERENCES user_accounts(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_accounts(id),
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES user_accounts(id),
    message_text TEXT NOT NULL,
    media_asset_id UUID,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. Media Assets & Devices
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_user_id UUID NOT NULL REFERENCES user_accounts(id),
    storage_key VARCHAR(500) NOT NULL,
    bucket VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    push_token VARCHAR(500),
    device_platform VARCHAR(20) NOT NULL,
    app_version VARCHAR(20),
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
    push_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    family_events_enabled BOOLEAN DEFAULT TRUE,
    jutho_alerts_enabled BOOLEAN DEFAULT TRUE,
    community_posts_enabled BOOLEAN DEFAULT TRUE
);

-- 12. Append-Only Immutable Audit Log
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
    prev_record_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Database Trigger to prevent modifications or deletions in audit_logs
CREATE OR REPLACE FUNCTION reject_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_modification();
