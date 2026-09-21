export const JWT_ISSUER = 'kashyap-platform';
export const JWT_AUDIENCE = 'kashyap-api';
export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ACCESS_EXPIRY = '15m';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }

  // In non-production, fall back to standard dev secret if omitted
  if (process.env.NODE_ENV !== 'production') {
    return 'kashyap_super_secret_jwt_key_2026_dev_only';
  }

  // In production, missing or weak JWT secret must fail fatal startup
  throw new Error(
    'FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is required and must be at least 32 characters in production environments.',
  );
}

// Export JWT_SECRET helper
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'kashyap_super_secret_jwt_key_2026_dev_only'
    : '');
