import {nepalWallTimeToUtc,formatNepalInstant} from '@kashyap/localization';
describe('Explicit Nepal-offset Gregorian organizer time',()=>{
 it.each(['UTC','America/New_York','Asia/Tokyo','Asia/Kathmandu'])('is independent of host zone %s',zone=>{
  const old=process.env.TZ;try{process.env.TZ=zone;
   expect(nepalWallTimeToUtc('2027-01-02T10:00')).toBe('2027-01-02T04:15:00.000Z');
   expect(formatNepalInstant('2027-01-02T04:15:00Z')).toBe('2027-01-02 10:00 · नेपाल समय (Nepal UTC+05:45)');
  }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
 });
 it.each([['2027-01-01T00:00','2026-12-31T18:15:00.000Z'],['2028-03-01T00:10','2028-02-29T18:25:00.000Z'],['2027-02-01T00:00','2027-01-31T18:15:00.000Z']])('preserves midnight boundaries %s',(wall,utc)=>expect(nepalWallTimeToUtc(wall)).toBe(utc));
 it.each(['2027-02-29T10:00','2027-04-31T10:00','2027-01-01T24:00','2027-01-01T10:60','2083-05-15','2027-01-01T10:00Z','garbage'])('rejects malformed/rolled-over/source-mixed input %s',value=>expect(()=>nepalWallTimeToUtc(value)).toThrow());
 it('handles explicit source offsets in display and never echoes invalid input',()=>{
  expect(formatNepalInstant('2027-01-02T10:00:00+05:45')).toContain('2027-01-02 10:00');
  expect(formatNepalInstant('2027-01-02T10:00:00')).toBe('समय उपलब्ध छैन (Time unavailable)');
  expect(formatNepalInstant('private-invalid-data')).toBe('समय उपलब्ध छैन (Time unavailable)');
 });
});
