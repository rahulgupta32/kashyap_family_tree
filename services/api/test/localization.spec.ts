import { ErrorCode } from '@kashyap/contracts';
import { errorMessages, ne, en } from '@kashyap/localization';

describe('Localization & Error Code Completeness (I18N-FR-001..005)', () => {
  it('should have bilingual English and Nepali translations for EVERY documented ErrorCode', () => {
    const errorCodes = Object.values(ErrorCode);

    for (const code of errorCodes) {
      const mapping = errorMessages[code];
      expect(mapping).toBeDefined();
      expect(mapping.en).toBeDefined();
      expect(mapping.en.length).toBeGreaterThan(5);
      expect(mapping.ne).toBeDefined();
      expect(mapping.ne.length).toBeGreaterThan(5);
    }
  });

  it('should have matching top-level navigation keys between Nepali and English dictionaries', () => {
    const neNavKeys = Object.keys(ne.nav).sort();
    const enNavKeys = Object.keys(en.nav).sort();
    expect(neNavKeys).toEqual(enNavKeys);
  });

  it('should have matching genealogy terminology keys between Nepali and English dictionaries', () => {
    const neGenKeys = Object.keys(ne.genealogy).sort();
    const enGenKeys = Object.keys(en.genealogy).sort();
    expect(neGenKeys).toEqual(enGenKeys);
  });

  describe('Bikram Sambat (BS) Validated Calendar Conversion & Privacy Age Boundaries', () => {
    const { adToBs, bsToAd, getCurrentBsDate, isValidBsDate, isSupportedBsYear } = require('@kashyap/localization');
    const { PrivacyEngineService } = require('../src/modules/genealogy/privacy/privacy-engine.service');
    const privacyEngine = new PrivacyEngineService();

    it('should accurately convert AD dates to BS and BS to AD within supported range (BS 2000..2090)', () => {
      // Test Anchor: 2000-01-01 BS = 1943-04-14 UTC
      const startAd = new Date(Date.UTC(1943, 3, 14, 0, 0, 0));
      const startBs = adToBs(startAd);
      expect(startBs).toEqual({ year: 2000, month: 1, day: 1 });

      const backAd = bsToAd(2000, 1, 1);
      expect(backAd).not.toBeNull();
      expect(backAd!.toISOString().slice(0, 10)).toBe('1943-04-14');
    });

    it('should handle year rollover correctly (Chaitra 31, 2082 BS -> Baisakh 1, 2083 BS)', () => {
      const end2082 = bsToAd(2082, 12, 31);
      expect(end2082).not.toBeNull();
      const bsEnd = adToBs(end2082!);
      expect(bsEnd).toEqual({ year: 2082, month: 12, day: 31 });

      const start2083 = bsToAd(2083, 1, 1);
      expect(start2083).not.toBeNull();
      const bsStart = adToBs(start2083!);
      expect(bsStart).toEqual({ year: 2083, month: 1, day: 1 });
    });

    it('should respect Nepal Standard Time (UTC+5:45) across midnight boundary', () => {
      // 2026-04-16T18:14:59Z is 23:59:59 NPT on 2026-04-16 (Chaitra 31, 2082 BS)
      const beforeMidnight = new Date('2026-04-16T18:14:59Z');
      const bsBefore = adToBs(beforeMidnight);
      expect(bsBefore).toEqual({ year: 2082, month: 12, day: 31 });

      // 2026-04-16T18:15:01Z is 00:00:01 NPT on 2026-04-17 (Baisakh 1, 2083 BS)
      const afterMidnight = new Date('2026-04-16T18:15:01Z');
      const bsAfter = adToBs(afterMidnight);
      expect(bsAfter).toEqual({ year: 2083, month: 1, day: 1 });
    });

    it('should reject invalid or out-of-range BS dates fail-closed', () => {
      expect(isValidBsDate(1999, 1, 1)).toBe(false);
      expect(isValidBsDate(2095, 1, 1)).toBe(false);
      expect(isValidBsDate(2083, 13, 1)).toBe(false);
      expect(isValidBsDate(2083, 0, 1)).toBe(false);
      expect(isValidBsDate(2083, 1, 35)).toBe(false); // Baisakh 2083 has 31 days
    });

    it('should treat uncertain age boundaries and unknown birth year restrictively (PRIV-FR-003, Policy Sec 6.1)', () => {
      const fixedNow = new Date('2026-09-13T07:30:00Z'); // Current BS date is approx 2083-05-25

      // 1. Living person with unknown birth year -> minor/uncertain protection applies
      expect(privacyEngine.isMinorOrUncertainAge({ livingStatus: 'LIVING' as any }, fixedNow)).toBe(true);

      // 2. Exact age 17 (< 18) -> minor protection applies
      expect(privacyEngine.isMinorOrUncertainAge({ birth_year_bs: 2066, livingStatus: 'LIVING' as any }, fixedNow)).toBe(true);

      // 3. Exact age boundary: 2083 - 2065 = 18 -> yearDiff <= 18 is treated restrictively as uncertain
      expect(privacyEngine.isMinorOrUncertainAge({ birth_year_bs: 2065, livingStatus: 'LIVING' as any }, fixedNow)).toBe(true);

      // 4. Adult age 20 (2083 - 2063 = 20) -> not minor
      expect(privacyEngine.isMinorOrUncertainAge({ birth_year_bs: 2063, livingStatus: 'LIVING' as any }, fixedNow)).toBe(false);

      // 5. Deceased person -> minor protection does NOT apply regardless of age
      expect(privacyEngine.isMinorOrUncertainAge({ birth_year_bs: 2075, livingStatus: 'DECEASED' as any }, fixedNow)).toBe(false);
    });
  });
});
