export const JWT_ISSUER = 'kashyap-platform';
export const JWT_AUDIENCE = 'kashyap-api';
export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ACCESS_EXPIRY = '15m';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }

  // In explicit test environments, allow an isolated deterministic secret
  if (process.env.NODE_ENV === 'test') {
    return 'kashyap_test_isolated_jwt_secret_32_bytes_min_key_2026';
  }

  // In normal runtime (development or production), missing or weak JWT secret must fail fatal startup
  throw new Error(
    'FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is required and must be at least 32 characters in development and production environments.',
  );
}

// Export JWT_SECRET helper
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'test'
    ? 'kashyap_test_isolated_jwt_secret_32_bytes_min_key_2026'
    : '');
