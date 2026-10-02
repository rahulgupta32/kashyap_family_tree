import { validateGregorianInstant } from '../src/modules/calendar/calendar.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';

describe('Explicit Gregorian event scheduling',()=>{
  it('preserves an explicitly supplied offset as a UTC instant without converting Tithi',()=>{
    expect(validateGregorianInstant('2026-10-02T16:00:00+05:45')).toBe('2026-10-02T10:15:00.000Z');
  });
  it.each(['2026-02-30T10:00:00Z','2026-10-02T24:00:00Z','2026-10-02T10:00:00','2083-05-15','garbage'])('rejects %s',value=>{
    expect(()=>validateGregorianInstant(value)).toThrow();
  });
  it.each(['CALENDAR_EVENT_CREATED','CALENDAR_EVENT_UPDATED','CALENDAR_EVENT_CANCELLED','CALENDAR_EVENT_REMINDER_DUE'])('applies event category preferences to %s',action=>{
    expect(notificationCategoryEnabled(action,{family_events_enabled:false})).toBe(false);
    expect(notificationCategoryEnabled(action,{})).toBe(true);
  });
});
