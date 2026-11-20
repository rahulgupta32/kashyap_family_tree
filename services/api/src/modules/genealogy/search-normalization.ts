import { BadRequestException } from '@nestjs/common';

/** Search-only normalization. Never use this value to replace a source name. */
export function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new BadRequestException('Search query must be at most 500 characters');
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** User-entered percent/underscore/backslash are literal name characters. */
export function literalSearchPattern(value: string): string {
  return '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
}
