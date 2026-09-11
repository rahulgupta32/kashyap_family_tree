import { normalizeNepaliPhone, isValidNepaliPhone } from '../src/common/utils/phone.util';
import { ErrorCode } from '@kashyap/contracts';

describe('Phone Utility (AUTH-FR-001, EC-0011)', () => {
  describe('normalizeNepaliPhone', () => {
    it('should normalize standard 10-digit 98 mobile number to canonical E.164', () => {
      expect(normalizeNepaliPhone('9841234567')).toBe('+9779841234567');
    });

    it('should normalize standard 10-digit 97 mobile number to canonical E.164', () => {
      expect(normalizeNepaliPhone('9741234567')).toBe('+9779741234567');
    });

    it('should strip leading +977 prefix and format correctly', () => {
      expect(normalizeNepaliPhone('+9779841234567')).toBe('+9779841234567');
      expect(normalizeNepaliPhone('+9779741234567')).toBe('+9779741234567');
    });

    it('should strip leading 00977 or 977 without plus sign', () => {
      expect(normalizeNepaliPhone('009779841234567')).toBe('+9779841234567');
      expect(normalizeNepaliPhone('9779841234567')).toBe('+9779841234567');
    });

    it('should strip spaces, hyphens, and parentheses cleanly', () => {
      expect(normalizeNepaliPhone('+977 984-123-4567')).toBe('+9779841234567');
      expect(normalizeNepaliPhone('(977) 9841 234 567')).toBe('+9779841234567');
      expect(normalizeNepaliPhone('  9841234567  ')).toBe('+9779841234567');
    });

    it('should reject non-Nepali mobile prefixes (e.g. 96, 95, landlines)', () => {
      const invalidPrefixes = ['9641234567', '9541234567', '014234567', '1234567890'];
      for (const phone of invalidPrefixes) {
        expect(() => normalizeNepaliPhone(phone)).toThrow();
        try {
          normalizeNepaliPhone(phone);
        } catch (err: any) {
          expect(err.response?.errorCode).toBe(ErrorCode.INVALID_PHONE_NUMBER);
        }
      }
    });

    it('should reject numbers with invalid lengths', () => {
      const invalidLengths = ['98412', '984123456', '98412345678', '+97798412345'];
      for (const phone of invalidLengths) {
        expect(() => normalizeNepaliPhone(phone)).toThrow();
      }
    });

    it('should reject non-string or empty inputs', () => {
      expect(() => normalizeNepaliPhone('')).toThrow();
      expect(() => normalizeNepaliPhone(null as any)).toThrow();
      expect(() => normalizeNepaliPhone(undefined as any)).toThrow();
    });
  });

  describe('isValidNepaliPhone', () => {
    it('should return true for valid numbers', () => {
      expect(isValidNepaliPhone('9841234567')).toBe(true);
      expect(isValidNepaliPhone('+9779741234567')).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(isValidNepaliPhone('12345')).toBe(false);
      expect(isValidNepaliPhone('invalid')).toBe(false);
      expect(isValidNepaliPhone('+15551234567')).toBe(false);
    });
  });
});
