import * as crypto from 'crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
  let value = 0, bits = 0, result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(value >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totp(secret: Buffer, counter: number, digits = 6): string {
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).toString().padStart(digits, '0');
}
export function matchingCounter(secret: Buffer, code: string, lastCounter: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter > lastCounter && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, counter)))) return counter;
  }
  return null;
}
export function mfaKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured && /^[A-Za-z0-9+/]{43}=$/.test(configured)) {
    const key = Buffer.from(configured, 'base64');
    if (key.length === 32 && key.toString('base64') === configured) return key;
  }
  if (configured || process.env.NODE_ENV === 'production') throw new Error('MFA_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key');
  return crypto.createHash('sha256').update('kashyap-authenticator-development-only-key').digest();
}
export function encryptSecret(secret: Buffer, userId: string, key = mfaKey()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(userId));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function decryptSecret(encoded: string, userId: string, key = mfaKey()): Buffer {
  const value = Buffer.from(encoded, 'base64');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
  cipher.setAAD(Buffer.from(userId)); cipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]);
}
export const recoveryHash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
