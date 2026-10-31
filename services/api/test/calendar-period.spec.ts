import {calendarPeriod,periodCursor} from '../src/modules/calendar/calendar-period';
describe('Source calendar period selection and exact cursors',()=>{
 it('preserves Gregorian leap day and period navigation without converting BS',()=>{
  expect(calendarPeriod('AD','DAY','2024-02-29')).toMatchObject({start:'2024-02-29',end:'2024-03-01',previousDate:'2024-02-28',nextDate:'2024-03-01',daysInMonth:29});
  expect(calendarPeriod('AD','AGENDA','2026-12-20')).toMatchObject({start:'2026-12-01',end:'2027-01-01',nextDate:'2027-01-01',previousDate:'2026-11-01'});
  expect(calendarPeriod('BS','DAY','2000-01-01')).toMatchObject({previousDate:null,source:'BS',end:null});
  expect(calendarPeriod('BS','MONTH','2090-12-01').nextDate).toBeNull();
 });
 it('rejects invalid source dates and unsupported representations',()=>{
  for(const date of ['2026-02-29','2026-13-01','1899-12-31','2101-01-01','garbage'])expect(()=>calendarPeriod('AD','DAY',date)).toThrow();
  expect(()=>calendarPeriod('BS','MONTH','2091-01-01')).toThrow();
  expect(()=>calendarPeriod('TITHI','DAY','2083-05-15')).toThrow();
  expect(()=>calendarPeriod('AD','WEEK','2026-10-06')).toThrow();
 });
 it('preserves bigint precision and validates cursor source-period boundaries',()=>{
  const period=calendarPeriod('BS','AGENDA','2083-05-15');
  expect(periodCursor('2083-05-16|9007199254740993',period)).toEqual({date:'2083-05-16',sequence:'9007199254740993'});
  expect(periodCursor('UNDATED|7',period)).toEqual({date:'UNDATED',sequence:'7'});
  for(const cursor of ['2083-06-01|1','2083-05-15|0','2083-05-15|9223372036854775808','bad'])expect(()=>periodCursor(cursor,period)).toThrow();
  expect(()=>periodCursor('UNDATED|1',calendarPeriod('AD','MONTH','2026-10-06'))).toThrow();
  expect(()=>periodCursor('2083-05-16|1',calendarPeriod('BS','DAY','2083-05-15'))).toThrow();
 });
});
