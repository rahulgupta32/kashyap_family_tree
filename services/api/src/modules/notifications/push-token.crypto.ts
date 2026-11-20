import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Independent managed keyring; no JWT/MFA key reuse or development fallback. */
function keyring(): { active: string; keys: Record<string, Buffer> } {
  try {
    const active = process.env.PUSH_TOKEN_ACTIVE_KEY_ID || '';
    const input = JSON.parse(process.env.PUSH_TOKEN_KEYS_JSON || '{}');
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(active) || !input || Array.isArray(input)) throw new Error();
    const keys: Record<string, Buffer> = Object.create(null);
    for (const [id, value] of Object.entries(input)) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error();
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32 || key.toString('base64') !== value) throw new Error();
      keys[id] = key;
    }
    if (!keys[active]) throw new Error();
    return { active, keys };
  } catch { throw new Error('PUSH_TOKEN_KEY_UNAVAILABLE'); }
}

export function sealPushToken(token: string, context: string): string {
  const { active, keys } = keyring();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys[active], nonce);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [active, nonce.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function openPushToken(envelope: string, context: string): string {
  try {
    const parts = envelope.split('.');
    const key = keyring().keys[parts[0]];
    if (parts.length !== 4 || !key) throw new Error();
    const nonce = Buffer.from(parts[1], 'base64'), tag = Buffer.from(parts[2], 'base64');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(Buffer.from(parts[3], 'base64')), cipher.final()]).toString('utf8');
  } catch { throw new Error('PUSH_TOKEN_DECRYPTION_UNAVAILABLE'); }
}
