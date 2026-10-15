DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM calendar_create_receipts WHERE abandoned) THEN
  RAISE EXCEPTION 'CALENDAR_ABANDONED_KEYS_RETAINED';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION require_calendar_create_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM calendar_create_receipts WHERE account_id=NEW.account_id
   AND operation=NEW.operation AND creation_key=NEW.creation_key AND event_id IS NULL) THEN
  RAISE EXCEPTION 'Calendar creation receipt requires a committed event';
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION protect_calendar_create_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.event_id IS NOT NULL OR
   NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.operation IS DISTINCT FROM OLD.operation OR
   NEW.creation_key IS DISTINCT FROM OLD.creation_key OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash THEN
  RAISE EXCEPTION 'Calendar creation receipt is immutable';
 END IF;
 RETURN NEW;
END $$;
ALTER TABLE calendar_create_receipts DROP CONSTRAINT calendar_create_abandoned_has_no_event;
ALTER TABLE calendar_create_receipts DROP COLUMN abandoned;
