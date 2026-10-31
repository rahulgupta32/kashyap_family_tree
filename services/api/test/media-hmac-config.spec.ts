import { createHmac } from 'crypto';
import { getMediaHmacSecret } from '../src/common/utils/media-hmac.config';
import { ProfileService } from '../src/modules/profile/profile.service';

const development = 'kashyap_secure_media_hmac_secret_key_minimum_32_chars';
const configured = 'fictional-independent-media-key-01234567890123456789';

describe('Production media signing credential gate', () => {
  const previous = { mode: process.env.NODE_ENV, key: process.env.MEDIA_HMAC_SECRET };
  afterEach(() => {
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
    if (previous.key === undefined) delete process.env.MEDIA_HMAC_SECRET; else process.env.MEDIA_HMAC_SECRET = previous.key;
  });
  for (const secret of [undefined, '', 'short', development, ' '+configured, configured+'\n']) {
    it('rejects absent, short, known fixture or whitespace production configuration without disclosure', () => {
      expect(() => getMediaHmacSecret({ NODE_ENV: 'production', MEDIA_HMAC_SECRET: secret })).toThrow('A secure MEDIA_HMAC_SECRET is required in production');
      try { getMediaHmacSecret({ NODE_ENV: 'production', MEDIA_HMAC_SECRET: secret }); }
      catch (error) { if (secret) expect((error as Error).message).not.toContain(secret); }
    });
  }
  it('accepts the configured production credential and preserves its exact bytes', () => {
    expect(getMediaHmacSecret({ NODE_ENV: 'production', MEDIA_HMAC_SECRET: configured })).toBe(configured);
  });
  it('retains explicit and default test/development behavior outside production', () => {
    expect(getMediaHmacSecret({ NODE_ENV: 'test' })).toBe(development);
    expect(getMediaHmacSecret({ NODE_ENV: 'development', MEDIA_HMAC_SECRET: configured })).toBe(configured);
  });
  it('actual ProfileService construction fails closed when the production key is absent', () => {
    process.env.NODE_ENV = 'production'; delete process.env.MEDIA_HMAC_SECRET;
    expect(() => new ProfileService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      undefined, {} as any, undefined, {} as any)).toThrow('A secure MEDIA_HMAC_SECRET is required in production');
  });
  it('actual signer uses the selected key and binds asset/user/expiry without accepting fixture signatures', () => {
    process.env.NODE_ENV = 'production'; process.env.MEDIA_HMAC_SECRET = configured;
    const profile = new ProfileService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      undefined, {} as any, undefined, {} as any);
    const url = new URL(profile.generateSignedMediaUrl('fictional-asset', 'fictional-owner', 30), 'https://fictional.invalid');
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('sig')!;
    expect(signature).toBe(createHmac('sha256', configured).update(`fictional-asset:fictional-owner:${expires}`).digest('hex'));
    expect(profile.verifySignedMediaUrl('fictional-asset', 'fictional-owner', expires, signature)).toBe(true);
    expect(profile.verifySignedMediaUrl('other-asset', 'fictional-owner', expires, signature)).toBe(false);
    expect(profile.verifySignedMediaUrl('fictional-asset', 'other-owner', expires, signature)).toBe(false);
    const fixtureSignature = createHmac('sha256', development).update(`fictional-asset:fictional-owner:${expires}`).digest('hex');
    expect(profile.verifySignedMediaUrl('fictional-asset', 'fictional-owner', expires, fixtureSignature)).toBe(false);
  });
});
