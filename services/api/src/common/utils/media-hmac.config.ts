// Development fixture only; never a usable production signing credential.
const DEVELOPMENT_MEDIA_HMAC = 'kashyap_secure_media_hmac_secret_key_minimum_32_chars';

export function getMediaHmacSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.MEDIA_HMAC_SECRET;
  if (env.NODE_ENV === 'production') {
    if (!secret || secret !== secret.trim() || Buffer.byteLength(secret, 'utf8') < 32 || secret === DEVELOPMENT_MEDIA_HMAC) {
      // Do not echo configuration or key material into startup diagnostics.
      throw new Error('A secure MEDIA_HMAC_SECRET is required in production');
    }
    return secret;
  }
  return secret || DEVELOPMENT_MEDIA_HMAC;
}
