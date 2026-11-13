import { createHmac, randomUUID } from 'crypto';
import { RedisService } from '../src/redis/redis.service';
import { EmailAuthService } from '../src/modules/auth/email/email-auth.service';
import { CaptureEmailProvider } from '../src/modules/auth/email/email-provider';

/** Executes real Redis Lua. Account/session repositories are doubles in this suite. */
describe('Email challenge lifecycle with real Redis', () => {
  const redis = new RedisService();
  const capture = new CaptureEmailProvider();
  const userId = randomUUID();
  const account = { id: userId, is_active: true, is_suspended: false, deleted_at: null };
  const tx = { query: jest.fn(async (sql: string) =>
    ({ rows: sql.startsWith('SELECT user_id') ? [{ user_id: userId }] : [] })) };
  const db = { transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
  const audit = { recordAuditIntent: jest.fn(async () => ({ id: randomUUID() })) };
  const auth = { createVerifiedSession: jest.fn(async () => ({ user: { id: userId }, accessToken: 'synthetic' })) };
  const service = new EmailAuthService(redis, db as any, { findById: async () => account } as any,
    {} as any, audit as any, auth as any, capture);
  const destination = (email: string) => createHmac('sha256', process.env.EMAIL_OTP_HASH_KEY!)
    .update('destination:' + email).digest('hex');
  const begin = async () => {
    const email = randomUUID() + '@example.org';
    const response = await service.request(email, '127.0.0.1');
    return { email, id: response.otpSessionId, code: capture.takeCode(email)! };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_OTP_HASH_KEY = 'isolated-email-redis-test-key-at-least-32-characters';
    await redis.onModuleInit();
    expect(redis.isReady()).toBe(true);
  });
  afterAll(async () => { await redis.onModuleDestroy(); });

  it('stores a keyed hash with a five minute TTL and consumes exactly once under concurrency', async () => {
    const c = await begin();
    const raw = await redis.get('email:challenge:' + c.id);
    expect(raw).not.toContain(c.code);
    expect(await redis.getClient()!.ttl('email:challenge:' + c.id)).toBeGreaterThan(290);
    const results = await Promise.allSettled([1, 2].map(() =>
      service.verify({ otpSessionId: c.id, code: c.code }, '127.0.0.1', 'test')));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await redis.get('email:challenge:' + c.id)).toBeNull();
    await expect(service.verify({ otpSessionId: c.id, code: c.code }, '127.0.0.1', 'test')).rejects.toThrow();
  });

  it('bounds wrong attempts and rejects expired codes', async () => {
    const c = await begin();
    const wrong = c.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(service.verify({ otpSessionId: c.id, code: wrong }, '127.0.0.1', 'test')).rejects.toThrow();
    }
    await expect(service.verify({ otpSessionId: c.id, code: c.code }, '127.0.0.1', 'test')).rejects.toThrow();
    const expired = await begin();
    await redis.getClient()!.pexpire('email:challenge:' + expired.id, 5);
    await new Promise(resolve => setTimeout(resolve, 15));
    await expect(service.verify({ otpSessionId: expired.id, code: expired.code }, '127.0.0.1', 'test')).rejects.toThrow();
  });

  it('enforces cooldown and invalidates an earlier code after permitted resend', async () => {
    const c = await begin();
    const response = await service.request(c.email, '127.0.0.1');
    expect(capture.takeCode(c.email)).toBeUndefined();
    expect(await redis.get('email:challenge:' + response.otpSessionId)).toBeNull();
    await redis.del('email:cooldown:' + destination(c.email));
    const next = await service.request(c.email, '127.0.0.1');
    const code = capture.takeCode(c.email)!;
    await expect(service.verify({ otpSessionId: c.id, code: c.code }, '127.0.0.1', 'test')).rejects.toThrow();
    await expect(service.verify({ otpSessionId: next.otpSessionId, code }, '127.0.0.1', 'test')).resolves.toBeDefined();
  });

  it('retains the hourly destination budget across resends', async () => {
    const email = randomUUID() + '@example.org';
    for (let i = 0; i < 10; i++) {
      await redis.del('email:cooldown:' + destination(email));
      await service.request(email, '127.0.0.1');
      expect(capture.takeCode(email)).toMatch(/^\d{6}$/);
    }
    await redis.del('email:cooldown:' + destination(email));
    const blocked = await service.request(email, '127.0.0.1');
    expect(capture.takeCode(email)).toBeUndefined();
    expect(await redis.get('email:challenge:' + blocked.otpSessionId)).toBeNull();
  });

  it('removes undelivered challenges and returns a generic response on provider failure', async () => {
    const email = randomUUID() + '@example.org';
    const spy = jest.spyOn(capture, 'sendCode').mockRejectedValueOnce(new Error('private provider error'));
    const response = await service.request(email, '127.0.0.1');
    spy.mockRestore();
    expect(response.message).not.toContain('private');
    expect(await redis.get('email:challenge:' + response.otpSessionId)).toBeNull();
  });
});
