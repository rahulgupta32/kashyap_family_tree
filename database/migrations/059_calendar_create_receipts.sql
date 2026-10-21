-- No expiry: deleting a receipt would allow a late retry to create another event.
CREATE TABLE calendar_create_receipts (
 account_id UUID NOT NULL REFERENCES user_accounts(id),
 operation TEXT NOT NULL CHECK(operation='CREATE_EVENT'),
 creation_key UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 event_id UUID REFERENCES calendar_events(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,operation,creation_key),
 UNIQUE(event_id)
);
-- A reservation is allowed only inside an uncommitted transaction.
CREATE FUNCTION require_calendar_create_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM calendar_create_receipts WHERE account_id=NEW.account_id
   AND operation=NEW.operation AND creation_key=NEW.creation_key AND event_id IS NULL) THEN
  RAISE EXCEPTION 'Calendar creation receipt requires a committed event';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER calendar_create_result_required AFTER INSERT OR UPDATE ON calendar_create_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_calendar_create_result();
-- Finalized receipts are durable evidence; application cleanup must not reopen a key.
CREATE FUNCTION protect_calendar_create_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.event_id IS NOT NULL OR
   NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.operation IS DISTINCT FROM OLD.operation OR
   NEW.creation_key IS DISTINCT FROM OLD.creation_key OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash THEN
  RAISE EXCEPTION 'Calendar creation receipt is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER calendar_create_receipt_immutable BEFORE UPDATE OR DELETE ON calendar_create_receipts
 FOR EACH ROW EXECUTE FUNCTION protect_calendar_create_receipt();
