ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_destination_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_destination_check
 CHECK(destination IN ('/claims','/change-requests','/chat','/calendar','/broadcasts','/community'));
