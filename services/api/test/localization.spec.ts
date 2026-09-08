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
});
