-- Only for isolated rollback verification; never remove sent production notices.
DELETE FROM notification_inbox WHERE category='BROADCAST';
ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_category_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_category_check CHECK (category IN ('WORKFLOW','CHAT','EVENT'));
ALTER TABLE notification_inbox DROP CONSTRAINT notification_inbox_destination_check;
ALTER TABLE notification_inbox ADD CONSTRAINT notification_inbox_destination_check CHECK (destination IN ('/claims','/change-requests','/chat','/calendar'));
DROP TABLE notification_broadcast_recipients;
DROP TABLE notification_broadcasts;
