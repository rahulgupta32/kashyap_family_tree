/**
 * Bikram Sambat (BS) Validated Calendar Conversion Engine
 * Supported explicit range: BS 2000 (1943-04-14 AD) to BS 2090 (2034-04-13 AD)
 * Uses Nepal Standard Time (NPT, UTC+5:45) for timezone-independent astronomical day alignment.
 */

export interface BsDate {
  year: number;
  month: number; // 1-12 (Baisakh to Chaitra)
  day: number;   // 1-32
}

export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = 2090;

// Validated month days for each year from 2000 BS to 2090 BS
export const BS_YEAR_MONTHS: Record<number, number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2023: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2024: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2026: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2027: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2028: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2029: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2030: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2031: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2035: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2036: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2037: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2038: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2039: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2040: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2041: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2042: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2043: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2044: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2046: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2047: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2050: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2051: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2054: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2061: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2062: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2063: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2064: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2065: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2066: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2067: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2070: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2073: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2074: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 30, 30, 29, 29, 30, 29, 31],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 29, 31],
  2088: [30, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
};

// Anchor: 2000-01-01 BS = 1943-04-14 UTC (Baisakh 1, 2000 BS)
export const BS_START_GREGORIAN_UTC = Date.UTC(1943, 3, 14);

// Nepal Standard Time (NPT) is UTC+5:45 (20,700,000 milliseconds)
export const NPT_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

/**
 * Checks if a given BS year is within the supported range (2000..2090).
 */
export function isSupportedBsYear(year: number): boolean {
  return year >= BS_MIN_YEAR && year <= BS_MAX_YEAR;
}

/**
 * Validates a Bikram Sambat date against actual month days in that year.
 */
export function isValidBsDate(year: number, month: number, day: number): boolean {
  if (!isSupportedBsYear(year)) return false;
  if (month < 1 || month > 12) return false;
  const monthDays = BS_YEAR_MONTHS[year];
  if (!monthDays) return false;
  return day >= 1 && day <= monthDays[month - 1];
}

/**
 * Converts a Gregorian Date to Bikram Sambat (BS) date.
 * Timezone independent: aligns strictly to Nepal Standard Time (UTC+5:45).
 */
export function adToBs(date: Date): BsDate | null {
  const nptDate = new Date(date.getTime() + NPT_OFFSET_MS);
  const nptDayUtc = Date.UTC(nptDate.getUTCFullYear(), nptDate.getUTCMonth(), nptDate.getUTCDate());
  let diffDays = Math.floor((nptDayUtc - BS_START_GREGORIAN_UTC) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return null; // Outside supported range (before 2000 BS)

  for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) {
    const months = BS_YEAR_MONTHS[y];
    const daysInYear = months.reduce((a, b) => a + b, 0);
    if (diffDays < daysInYear) {
      let rem = diffDays;
      for (let m = 0; m < 12; m++) {
        if (rem < months[m]) {
          return { year: y, month: m + 1, day: rem + 1 };
        }
        rem -= months[m];
      }
    }
    diffDays -= daysInYear;
  }
  return null; // Outside supported range (after 2090 BS)
}

/**
 * Converts a Bikram Sambat date to Gregorian Date at 00:00:00 Nepal Time.
 */
export function bsToAd(year: number, month: number, day: number): Date | null {
  if (!isValidBsDate(year, month, day)) return null;

  let days = 0;
  for (let y = BS_MIN_YEAR; y < year; y++) {
    days += BS_YEAR_MONTHS[y].reduce((a, b) => a + b, 0);
  }
  const months = BS_YEAR_MONTHS[year];
  for (let m = 0; m < month - 1; m++) {
    days += months[m];
  }
  days += (day - 1);

  const targetUtc = BS_START_GREGORIAN_UTC + (days * 24 * 60 * 60 * 1000);
  return new Date(targetUtc);
}

/**
 * Gets the current BS date using Nepal Standard Time.
 * If outside supported range, falls back to conservative approximation.
 */
export function getCurrentBsDate(now: Date = new Date()): BsDate {
  const bs = adToBs(now);
  if (bs) return bs;

  // Fallback for dates outside 2000..2090 range
  const nptDate = new Date(now.getTime() + NPT_OFFSET_MS);
  const yr = nptDate.getUTCFullYear() + (nptDate.getUTCMonth() > 3 || (nptDate.getUTCMonth() === 3 && nptDate.getUTCDate() >= 14) ? 57 : 56);
  const m = Math.min(12, Math.max(1, ((nptDate.getUTCMonth() + 8) % 12) + 1));
  const d = Math.min(30, Math.max(1, nptDate.getUTCDate()));
  return { year: yr, month: m, day: d };
}
