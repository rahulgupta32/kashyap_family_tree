-- Closing an unused key is permanent, so a delayed create cannot commit later.
ALTER TABLE calendar_create_receipts ADD COLUMN abandoned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calendar_create_receipts ADD CONSTRAINT calendar_create_abandoned_has_no_event
 CHECK(NOT abandoned OR event_id IS NULL);
CREATE OR REPLACE FUNCTION require_calendar_create_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM calendar_create_receipts WHERE account_id=NEW.account_id
   AND operation=NEW.operation AND creation_key=NEW.creation_key AND event_id IS NULL AND NOT abandoned) THEN
  RAISE EXCEPTION 'Calendar creation receipt requires a committed event';
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION protect_calendar_create_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.event_id IS NOT NULL OR OLD.abandoned OR
   NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.operation IS DISTINCT FROM OLD.operation OR
   NEW.creation_key IS DISTINCT FROM OLD.creation_key OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR
   NEW.abandoned IS DISTINCT FROM OLD.abandoned THEN
  RAISE EXCEPTION 'Calendar creation receipt is immutable';
 END IF;
 RETURN NEW;
END $$;
