import { annualOccurrence, ANNUAL_RULE_VERSION } from '../src/modules/calendar/annual-occurrence';
describe('Explicit Gregorian annual occurrence engine (engineering cases, not signed cultural references)',()=>{
 it.each([
  ['2000-06-15',2026,'09:00','SKIP_YEAR','2026-06-15T03:15:00.000Z'],
  ['2000-01-01',2027,'00:00','SKIP_YEAR','2026-12-31T18:15:00.000Z'],
  ['2000-12-31',2027,'23:59','MARCH_01','2027-12-31T18:14:00.000Z'],
  ['2000-02-29',2028,'09:00','SKIP_YEAR','2028-02-29T03:15:00.000Z'],
  ['2000-02-29',2027,'09:00','SKIP_YEAR',null],
  ['2000-02-29',2027,'09:00','FEBRUARY_28','2027-02-28T03:15:00.000Z'],
  ['2000-02-29',2027,'09:00','MARCH_01','2027-03-01T03:15:00.000Z'],
 ] as const)('derives %s in %s at %s with explicit %s',(source,year,time,policy,expected)=>{expect(annualOccurrence(source,year,time,policy)).toBe(expected);});
 it.each([
  ['2025-02-29',2027,'09:00','SKIP_YEAR'],['2020-04-31',2027,'09:00','SKIP_YEAR'],
  ['2083/01/01',2027,'09:00','SKIP_YEAR'],['2000-01-01',2091,'09:00','SKIP_YEAR'],
  ['2000-01-01',1999,'09:00','SKIP_YEAR'],['2000-01-01',2027,'24:00','SKIP_YEAR'],
  ['2000-01-01',2027,'09:60','SKIP_YEAR'],['2000-01-01',2027,'09:00','INFER'],
 ])('rejects invalid or unsupported inputs %j %j %j %j',(source,year,time,policy)=>{expect(()=>annualOccurrence(source as string,year as number,time as string,policy as any)).toThrow();});
 it('uses a stable version and does not depend on process timezone',()=>{expect(ANNUAL_RULE_VERSION).toBe('gregorian-annual-1');const old=process.env.TZ;try{process.env.TZ='America/New_York';expect(annualOccurrence('2000-01-01',2027,'00:00','SKIP_YEAR')).toBe('2026-12-31T18:15:00.000Z');}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}});
});
