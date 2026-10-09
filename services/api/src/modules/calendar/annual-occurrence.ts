import { BadRequestException } from '@nestjs/common';

export const ANNUAL_RULE_VERSION = 'gregorian-annual-1';
export type LeapDayPolicy = 'SKIP_YEAR' | 'FEBRUARY_28' | 'MARCH_01';

/** Explicit Gregorian source only. This does not convert BS or infer cultural rules. */
export function annualOccurrence(sourceDate: string, year: number, localTime: string, policy: LeapDayPolicy): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !Number.isInteger(year) || year < 2000 || year > 2090
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime) || !['SKIP_YEAR', 'FEBRUARY_28', 'MARCH_01'].includes(policy)) {
    throw new BadRequestException('Explicit AD date, supported year, Nepal time and leap-day policy required');
  }
  const source = new Date(`${sourceDate}T00:00:00.000Z`);
  if (!Number.isFinite(source.getTime()) || source.toISOString().slice(0, 10) !== sourceDate) throw new BadRequestException('Invalid Gregorian source date');
  let month = source.getUTCMonth(), day = source.getUTCDate();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month === 1 && day === 29 && !leap) {
    if (policy === 'SKIP_YEAR') return null;
    if (policy === 'FEBRUARY_28') day = 28;
    else { month = 2; day = 1; }
  }
  const [hour, minute] = localTime.split(':').map(Number);
  // Asia/Kathmandu is UTC+05:45 throughout the supported occurrence years.
  return new Date(Date.UTC(year, month, day, hour, minute) - 345 * 60000).toISOString();
}
