ALTER TABLE calendar_events ADD COLUMN browse_sequence BIGSERIAL;
WITH ranked AS (SELECT id,row_number() OVER(ORDER BY created_at,id) AS sequence FROM calendar_events)
 UPDATE calendar_events e SET browse_sequence=r.sequence FROM ranked r WHERE e.id=r.id;
SELECT setval(pg_get_serial_sequence('calendar_events','browse_sequence'),COALESCE((SELECT max(browse_sequence) FROM calendar_events),1),EXISTS(SELECT 1 FROM calendar_events));
ALTER TABLE calendar_events ADD CONSTRAINT calendar_browse_sequence_unique UNIQUE(browse_sequence);
