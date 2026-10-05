DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM notification_inbox WHERE destination='/community') THEN
  RAISE EXCEPTION 'Community notice evidence exists; reconcile before rollback';
 END IF;
END $$;
ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_destination_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_destination_check
 CHECK(destination IN ('/claims','/change-requests','/chat','/calendar','/broadcasts'));
