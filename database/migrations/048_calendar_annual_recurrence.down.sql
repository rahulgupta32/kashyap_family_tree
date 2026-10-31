DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM calendar_recurrence_rules) THEN RAISE EXCEPTION 'Cannot discard retained recurrence evidence'; END IF;
END $$;
ALTER TABLE calendar_events DROP CONSTRAINT calendar_recurrence_year_pair;
DROP INDEX calendar_recurrence_occurrence;
ALTER TABLE calendar_events DROP COLUMN recurrence_rule_id, DROP COLUMN recurrence_year;
DROP FUNCTION calendar_recurrence_current(uuid);
DROP TABLE calendar_recurrence_decisions,calendar_recurrence_rules;
DROP FUNCTION protect_calendar_recurrence_evidence();
