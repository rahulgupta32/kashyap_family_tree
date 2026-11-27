import { base32, decryptSecret, encryptSecret, matchingCounter, mfaKey, totp } from '../src/modules/auth/mfa.crypto';
import { isMfaBootstrapRequest } from '../src/modules/auth/mfa.service';

describe('Authenticator cryptography and gate boundaries', () => {
  it.each([[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']])('matches RFC 6238 SHA1 vector at %s', (seconds, expected) => {
    expect(totp(Buffer.from('12345678901234567890'), Math.floor(Number(seconds) / 30), 8)).toBe(expected);
  });
  it('encodes the enrollment secret and rejects accepted counters and codes outside the window', () => {
    const secret = Buffer.from('12345678901234567890'); const now = 1234567890000; const counter = Math.floor(now / 30000);
    expect(base32(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(matchingCounter(secret, totp(secret, counter), -1, now)).toBe(counter);
    expect(matchingCounter(secret, totp(secret, counter), counter, now)).toBeNull();
    expect(matchingCounter(secret, totp(secret, counter - 2), -1, now)).toBeNull();
  });
  it('binds encrypted secrets to account and encryption key and rejects tampering', () => {
    const key = Buffer.alloc(32, 7), secret = Buffer.alloc(20, 9); const value = encryptSecret(secret, 'account-a', key);
    expect(decryptSecret(value, 'account-a', key)).toEqual(secret);
    expect(() => decryptSecret(value, 'account-b', key)).toThrow();
    expect(() => decryptSecret(value, 'account-a', Buffer.alloc(32, 8))).toThrow();
    const altered = Buffer.from(value, 'base64'); altered[30] ^= 1;
    expect(() => decryptSecret(altered.toString('base64'), 'account-a', key)).toThrow();
  });
  it('fails closed for absent and malformed production encryption keys', () => {
    const env = process.env.NODE_ENV, key = process.env.MFA_ENCRYPTION_KEY;
    try {
      process.env.NODE_ENV = 'production'; delete process.env.MFA_ENCRYPTION_KEY;
      expect(() => mfaKey()).toThrow(); process.env.MFA_ENCRYPTION_KEY = 'weak'; expect(() => mfaKey()).toThrow();
      process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); expect(mfaKey()).toEqual(Buffer.alloc(32, 7));
    } finally { if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env; if (key === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = key; }
  });
  it('permits only exact bootstrap paths with their intended methods', () => {
    expect(isMfaBootstrapRequest('POST', '/auth/mfa/verify')).toBe(true);
    expect(isMfaBootstrapRequest('POST', '/auth/mfa/verify/../roles/assign')).toBe(false);
    expect(isMfaBootstrapRequest('GET', '/auth/mfa/verify')).toBe(false);
    expect(isMfaBootstrapRequest('POST', '/auth/roles/assign')).toBe(false);
    expect(isMfaBootstrapRequest('GET', '/auth/me?foo=bar')).toBe(true);
    expect(isMfaBootstrapRequest('', '')).toBe(false);
  });
});
