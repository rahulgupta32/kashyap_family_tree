CREATE TABLE calendar_recurrence_rules (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 owner_id uuid NOT NULL REFERENCES user_accounts(id),
 source_event_id uuid NOT NULL REFERENCES calendar_events(id),
 source_version integer NOT NULL CHECK(source_version>0),
 source_date varchar(10) NOT NULL,
 local_time varchar(5) NOT NULL,
 leap_policy varchar(20) NOT NULL CHECK(leap_policy IN ('SKIP_YEAR','FEBRUARY_28','MARCH_01')),
 rule_version varchar(40) NOT NULL CHECK(rule_version='gregorian-annual-1'),
 source_ref varchar(500) NOT NULL,
 consent_granted boolean NOT NULL CHECK(consent_granted=TRUE),
 state varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reviewer_id uuid REFERENCES user_accounts(id),
 review_reason varchar(1000),
 next_check_at timestamptz NOT NULL DEFAULT NOW(),
 created_at timestamptz NOT NULL DEFAULT NOW(),
 CHECK(reviewer_id IS NULL OR reviewer_id<>owner_id),
 CHECK(state NOT IN ('APPROVED','REJECTED') OR (reviewer_id IS NOT NULL AND review_reason IS NOT NULL))
);
CREATE UNIQUE INDEX calendar_recurrence_active_source ON calendar_recurrence_rules(source_event_id) WHERE state IN ('PENDING','APPROVED');
CREATE TABLE calendar_recurrence_decisions (
 rule_id uuid NOT NULL REFERENCES calendar_recurrence_rules(id),
 version integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES user_accounts(id),
 action varchar(30) NOT NULL,
 reason varchar(1000) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW(),
 PRIMARY KEY(rule_id,version)
);
ALTER TABLE calendar_events ADD COLUMN recurrence_rule_id uuid REFERENCES calendar_recurrence_rules(id);
ALTER TABLE calendar_events ADD COLUMN recurrence_year integer;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_recurrence_year_pair CHECK(
 (recurrence_rule_id IS NULL AND recurrence_year IS NULL) OR
 (recurrence_rule_id IS NOT NULL AND recurrence_year BETWEEN 2000 AND 2090 AND audience_scope='PRIVATE'));
CREATE UNIQUE INDEX calendar_recurrence_occurrence ON calendar_events(recurrence_rule_id,recurrence_year) WHERE recurrence_rule_id IS NOT NULL;
CREATE INDEX calendar_recurrence_work ON calendar_recurrence_rules(next_check_at,id) WHERE state='APPROVED';

-- Recheck approval and source at calendar reads, emission, inbox and delivery retries.
CREATE FUNCTION calendar_recurrence_current(rule_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM calendar_recurrence_rules r
 JOIN calendar_events s ON s.id=r.source_event_id
 JOIN user_accounts owner ON owner.id=r.owner_id
 JOIN user_accounts reviewer ON reviewer.id=r.reviewer_id
 WHERE r.id=rule_id AND r.state='APPROVED'
 AND s.version=r.source_version AND s.lifecycle_state='ACTIVE' AND s.host_user_id=r.owner_id
 AND s.recurrence_rule_id IS NULL AND s.event_type IN ('GENERAL_EVENT','COMMUNITY_MEETING')
 AND to_char(s.starts_at AT TIME ZONE 'Asia/Kathmandu','YYYY-MM-DD')=r.source_date
 AND s.starts_at IS NOT NULL AND s.provenance->>'source'='ORGANIZER_SUPPLIED_AD'
 AND owner.is_active AND owner.is_phone_verified AND NOT owner.is_suspended AND owner.deleted_at IS NULL
 AND reviewer.is_active AND reviewer.is_phone_verified AND NOT reviewer.is_suspended AND reviewer.deleted_at IS NULL
 AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=owner.id AND ur.role NOT IN ('GUEST','REGISTERED_USER'))
 AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=reviewer.id AND ur.role='SUPER_ADMIN')
 AND (owner.person_id IS NULL OR reviewer.person_id IS NULL OR (owner.person_id<>reviewer.person_id
 AND NOT EXISTS(SELECT 1 FROM parent_links pl WHERE
 (pl.parent_id=owner.person_id AND pl.child_id=reviewer.person_id) OR (pl.parent_id=reviewer.person_id AND pl.child_id=owner.person_id))
 AND NOT EXISTS(SELECT 1 FROM spouse_links sl WHERE
 (sl.person_id=owner.person_id AND sl.spouse_id=reviewer.person_id) OR (sl.person_id=reviewer.person_id AND sl.spouse_id=owner.person_id)))))
$$;

CREATE FUNCTION protect_calendar_recurrence_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='calendar_recurrence_decisions' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Recurrence evidence is append-only'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','version','reviewer_id','review_reason','next_check_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','version','reviewer_id','review_reason','next_check_at']) THEN
   RAISE EXCEPTION 'Recurrence source snapshot is immutable';
 END IF;
 IF NEW.state=OLD.state THEN
  IF NEW.version<>OLD.version OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
   RAISE EXCEPTION 'Recurrence decision is immutable';
  END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR NOT ((OLD.state='PENDING' AND NEW.state IN ('APPROVED','REJECTED','WITHDRAWN')) OR (OLD.state='APPROVED' AND NEW.state='WITHDRAWN')) THEN
   RAISE EXCEPTION 'Invalid recurrence decision transition';
  END IF;
  IF NEW.state='WITHDRAWN' AND (NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id OR NEW.review_reason IS DISTINCT FROM OLD.review_reason) THEN
   RAISE EXCEPTION 'Retained reviewer evidence is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recurrence_source_immutable BEFORE UPDATE OR DELETE ON calendar_recurrence_rules FOR EACH ROW EXECUTE FUNCTION protect_calendar_recurrence_evidence();
CREATE TRIGGER recurrence_decisions_immutable BEFORE UPDATE OR DELETE ON calendar_recurrence_decisions FOR EACH ROW EXECUTE FUNCTION protect_calendar_recurrence_evidence();
