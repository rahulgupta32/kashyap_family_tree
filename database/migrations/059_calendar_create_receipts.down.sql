DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM calendar_create_receipts) THEN
  RAISE EXCEPTION 'CALENDAR_CREATE_RECEIPTS_RETAINED';
 END IF;
END $$;
DROP TABLE calendar_create_receipts;
DROP FUNCTION require_calendar_create_result();
DROP FUNCTION protect_calendar_create_receipt();
