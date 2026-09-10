import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@kashyap/contracts';

/**
 * Normalizes Nepali mobile phone numbers to canonical E.164 format: +97798XXXXXXXX / +97797XXXXXXXX
 * Baseline References: AUTH-FR-001, EC-0011
 */
export function normalizeNepaliPhone(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') {
    throw new BadRequestException({
      errorCode: ErrorCode.INVALID_PHONE_NUMBER,
      message: 'Mobile number must be provided as a string',
      messageNepali: 'मोबाइल नम्बर अनिवार्य छ।',
    });
  }

  // Remove whitespace, dashes, parentheses, dots
  const cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]+/g, '');

  // Match optional +977, 00977, 977 prefix, followed by standard Nepal mobile: 98 or 97 and 8 digits
  const match = cleaned.match(/^(?:\+977|00977|977)?(9[78]\d{8})$/);

  if (!match) {
    throw new BadRequestException({
      errorCode: ErrorCode.INVALID_PHONE_NUMBER,
      message: 'Invalid Nepali mobile number format. Must be 10 digits starting with 98 or 97.',
      messageNepali: 'अमान्य नेपाली मोबाइल नम्बर ढाँचा। ९८ वा ९७ बाट सुरु हुने १० अंकको हुनुपर्छ।',
    });
  }

  const mobile10Digits = match[1];
  return `+977${mobile10Digits}`;
}

export function isValidNepaliPhone(rawPhone: string): boolean {
  try {
    normalizeNepaliPhone(rawPhone);
    return true;
  } catch {
    return false;
  }
}
