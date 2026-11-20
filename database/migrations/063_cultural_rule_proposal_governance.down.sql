DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM cultural_rule_proposals) OR EXISTS(SELECT 1 FROM cultural_rule_authorities) OR EXISTS(SELECT 1 FROM cultural_rule_proposal_events)
 THEN RAISE EXCEPTION 'CULTURAL_GOVERNANCE_EVIDENCE_RETAINED'; END IF;
END $$;
DROP TABLE cultural_rule_proposal_events;
DROP TABLE cultural_rule_proposals;
DROP TABLE cultural_rule_authorities;
DROP FUNCTION protect_cultural_rule_proposal();
DROP FUNCTION protect_cultural_rule_governance_evidence();
DROP FUNCTION protect_cultural_rule_authority();
