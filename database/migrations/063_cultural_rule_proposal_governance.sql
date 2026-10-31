-- Explicit governance assignments require approved human provisioning. No authority is seeded.
-- A proposal decision never activates domain_rulesets or an HG gate.
CREATE TABLE cultural_rule_authorities (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 user_id UUID NOT NULL REFERENCES user_accounts(id),
 rule_type VARCHAR(40) NOT NULL CHECK(rule_type IN ('NATA_SAINO','JUTHO_SUTOK','TITHI_SHRADDHA','MARRIAGE_ELIGIBILITY')),
 duty VARCHAR(30) NOT NULL CHECK(duty IN ('REVIEWER','SENIOR_APPROVER')),
 assigned_by UUID NOT NULL REFERENCES user_accounts(id),
 provenance TEXT NOT NULL CHECK(length(trim(provenance)) BETWEEN 1 AND 4000),
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ,
 CHECK(revoked_at IS NULL OR revoked_at >= assigned_at)
);
CREATE UNIQUE INDEX cultural_rule_current_authority ON cultural_rule_authorities(user_id,rule_type,duty) WHERE revoked_at IS NULL;
CREATE TABLE cultural_rule_proposals (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 rule_type VARCHAR(40) NOT NULL CHECK(rule_type IN ('NATA_SAINO','JUTHO_SUTOK','TITHI_SHRADDHA','MARRIAGE_ELIGIBILITY')),
 path_code VARCHAR(200) NOT NULL CHECK(length(trim(path_code))>0),
 nepali_term VARCHAR(500) NOT NULL CHECK(length(trim(nepali_term))>0),
 english_term VARCHAR(500) NOT NULL CHECK(length(trim(english_term))>0),
 description_nepali TEXT CHECK(description_nepali IS NULL OR length(description_nepali) BETWEEN 1 AND 4000),
 proposed_by_user_id UUID NOT NULL REFERENCES user_accounts(id),
 rationale TEXT NOT NULL CHECK(length(trim(rationale)) BETWEEN 1 AND 4000),
 status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','REVIEWED','APPROVED','REJECTED')),
 reviewer_user_id UUID REFERENCES user_accounts(id),
 reviewer_notes TEXT,
 reviewed_at TIMESTAMPTZ,
 senior_authority_user_id UUID REFERENCES user_accounts(id),
 authority_comments TEXT,
 approved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(reviewer_user_id IS NULL OR reviewer_user_id<>proposed_by_user_id),
 CHECK(senior_authority_user_id IS NULL OR (senior_authority_user_id<>proposed_by_user_id AND senior_authority_user_id<>reviewer_user_id)),
 CHECK(status='PROPOSED' OR (reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewer_notes IS NOT NULL AND length(trim(reviewer_notes)) BETWEEN 1 AND 4000)),
 CHECK(status<>'APPROVED' OR senior_authority_user_id IS NOT NULL),
 CHECK(senior_authority_user_id IS NULL OR (reviewer_user_id IS NOT NULL AND approved_at IS NOT NULL AND authority_comments IS NOT NULL AND length(trim(authority_comments)) BETWEEN 1 AND 4000))
);
CREATE INDEX cultural_rule_proposals_owner_page ON cultural_rule_proposals(proposed_by_user_id,id DESC);
CREATE INDEX cultural_rule_proposals_type_page ON cultural_rule_proposals(rule_type,id DESC);
CREATE TABLE cultural_rule_proposal_events (
 sequence BIGSERIAL PRIMARY KEY,
 proposal_id UUID NOT NULL REFERENCES cultural_rule_proposals(id),
 actor_id UUID NOT NULL REFERENCES user_accounts(id),
 action VARCHAR(20) NOT NULL CHECK(action IN ('PROPOSED','REVIEWED','DECIDED')),
 from_status VARCHAR(20),
 to_status VARCHAR(20) NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 4000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(proposal_id,action)
);
CREATE FUNCTION protect_cultural_rule_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CULTURAL_PROPOSAL_RETAINED'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','reviewer_user_id','reviewer_notes','reviewed_at','senior_authority_user_id','authority_comments','approved_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','reviewer_user_id','reviewer_notes','reviewed_at','senior_authority_user_id','authority_comments','approved_at'])
 THEN RAISE EXCEPTION 'CULTURAL_PROPOSAL_CONTENT_IMMUTABLE'; END IF;
 IF OLD.status='PROPOSED' AND NEW.status IN ('REVIEWED','REJECTED') AND NEW.reviewer_user_id IS NOT NULL
   AND NEW.senior_authority_user_id IS NULL AND NEW.approved_at IS NULL AND NEW.authority_comments IS NULL THEN RETURN NEW; END IF;
 IF OLD.status='REVIEWED' AND NEW.status IN ('APPROVED','REJECTED') AND NEW.senior_authority_user_id IS NOT NULL
   AND ROW(NEW.reviewer_user_id,NEW.reviewer_notes,NEW.reviewed_at) IS NOT DISTINCT FROM ROW(OLD.reviewer_user_id,OLD.reviewer_notes,OLD.reviewed_at)
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'CULTURAL_PROPOSAL_TRANSITION_FORBIDDEN';
END $$;
CREATE TRIGGER cultural_rule_proposal_protected BEFORE UPDATE OR DELETE ON cultural_rule_proposals FOR EACH ROW EXECUTE FUNCTION protect_cultural_rule_proposal();
CREATE FUNCTION protect_cultural_rule_governance_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'CULTURAL_GOVERNANCE_EVIDENCE_IMMUTABLE'; END $$;
CREATE TRIGGER cultural_rule_events_immutable BEFORE UPDATE OR DELETE ON cultural_rule_proposal_events FOR EACH ROW EXECUTE FUNCTION protect_cultural_rule_governance_evidence();
CREATE FUNCTION protect_cultural_rule_authority() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
   AND (to_jsonb(NEW)-'revoked_at') IS NOT DISTINCT FROM (to_jsonb(OLD)-'revoked_at') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'CULTURAL_AUTHORITY_HISTORY_RETAINED';
END $$;
CREATE TRIGGER cultural_rule_authority_retained BEFORE UPDATE OR DELETE ON cultural_rule_authorities FOR EACH ROW EXECUTE FUNCTION protect_cultural_rule_authority();
