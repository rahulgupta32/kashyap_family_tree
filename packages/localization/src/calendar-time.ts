/** Explicit organizer-supplied fixed-offset wall time; never a BS/Tithi conversion. */
export const CALENDAR_NEPAL_OFFSET_MINUTES = 345;
export function nepalWallTimeToUtc(value:string):string {
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if(!match)throw new Error('Enter a valid Gregorian date and time (Nepal UTC+05:45)');
  const [year,month,day,hour,minute]=match.slice(1).map(Number);
  const wall=new Date(Date.UTC(year,month-1,day,hour,minute));
  if(year<1900||year>2100||wall.getUTCFullYear()!==year||wall.getUTCMonth()!==month-1||wall.getUTCDate()!==day||hour>23||minute>59)
    throw new Error('Enter a valid Gregorian date and time (Nepal UTC+05:45)');
  const instant=new Date(wall.getTime()-CALENDAR_NEPAL_OFFSET_MINUTES*60000);
  if(instant.getUTCFullYear()<1900)throw new Error('Gregorian event time is outside the supported range');
  return instant.toISOString();
}
export function formatNepalInstant(value:string):string {
  if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return 'समय उपलब्ध छैन (Time unavailable)';
  const instant=new Date(value);
  if(!Number.isFinite(instant.getTime()))return 'समय उपलब्ध छैन (Time unavailable)';
  const wall=new Date(instant.getTime()+CALENDAR_NEPAL_OFFSET_MINUTES*60000);
  return `${wall.toISOString().slice(0,16).replace('T',' ')} · नेपाल समय (Nepal UTC+05:45)`;
}
