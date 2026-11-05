import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EmailProvider, CaptureEmailProvider } from '../src/modules/auth/email/email-provider';
import { RedisService } from '../src/redis/redis.service';
import { createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';
import { createHmac, randomUUID } from 'crypto';

describe('Email OTP with PostgreSQL, Redis and the existing session pipeline', () => {
  let app: INestApplication;
  let db: DisposableDatabase;
  let base: string;
  let redis: RedisService;
  const capture = new CaptureEmailProvider();
  const uniqueEmail = () => 'email-' + randomUUID() + '@example.org';
  const post = async (path: string, body: unknown, token?: string) => {
    const response = await fetch(base + path, { method: 'POST', headers: {
      'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}),
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  };
  const request = (email: string, token?: string) =>
    post('/auth/email/' + (token ? 'link/request' : 'request'), { email }, token);
  const verify = (id: string, code: string, token?: string) =>
    post('/auth/email/' + (token ? 'link/verify' : 'native/verify'), { otpSessionId: id, code }, token);
  const begin = async (email = uniqueEmail(), token?: string) => {
    const response = await request(email, token);
    expect(response.status).toBe(200);
    const code = capture.takeCode(email);
    expect(code).toMatch(/^\d{6}$/);
    return { email, id: response.body.otpSessionId, code: code! };
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.EMAIL_OTP_HASH_KEY = 'isolated-email-test-key-at-least-32-characters';
    db = await createDisposableDatabase('email_auth');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailProvider).useValue(capture).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0);
    base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
    redis = app.get(RedisService);
  }, 60000);

  beforeEach(async () => {
    await redis.del('otp:ratelimit:ip:127.0.0.1', 'otp:ratelimit:ip:::1', 'otp:ratelimit:ip:::ffff:127.0.0.1');
  });

  afterAll(async () => { await app?.close(); await db?.cleanup(); });

  it('creates an email-first account, rotates refresh credentials, rejects replay and logs out', async () => {
    const c = await begin();
    const result = await verify(c.id, c.code);
    expect(result.status).toBe(200);
    expect(result.body.user.isClaimed).toBe(false);
    const row = await db.client.query('SELECT phone_number, is_phone_verified FROM user_accounts WHERE id=$1', [result.body.user.id]);
    expect(row.rows[0]).toEqual({ phone_number: null, is_phone_verified: false });
    expect((await verify(c.id, c.code)).status).toBe(401);
    const refreshed = await post('/auth/native/refresh', { refreshToken: result.body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(result.body.refreshToken);
    const logout = await post('/auth/logout', { refreshToken: refreshed.body.refreshToken }, refreshed.body.accessToken);
    expect(logout.status).toBe(200);
    expect((await post('/auth/native/refresh', { refreshToken: refreshed.body.refreshToken })).status).toBe(401);
  });

  it('atomically permits only one concurrent verification', async () => {
    const c = await begin();
    const results = await Promise.all([verify(c.id, c.code), verify(c.id, c.code)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 401]);
  });

  it('expires codes and removes a challenge after five wrong attempts', async () => {
    const expired = await begin();
    await redis.getClient()!.pexpire('email:challenge:' + expired.id, 1);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect((await verify(expired.id, expired.code)).status).toBe(401);
    const wrong = await begin();
    const badCode = wrong.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await verify(wrong.id, badCode)).status).toBe(401);
    expect((await verify(wrong.id, wrong.code)).status).toBe(401);
  });

  it('keeps generic request responses during cooldown and stores no plaintext code', async () => {
    const c = await begin();
    const stored = await redis.get('email:challenge:' + c.id);
    expect(stored).not.toContain(c.code);
    const retry = await request(c.email);
    expect(retry.status).toBe(200);
    expect(capture.takeCode(c.email)).toBeUndefined();
    expect((await verify(retry.body.otpSessionId, c.code)).status).toBe(401);
    expect((await verify(c.id, c.code)).status).toBe(200);
  });

  it('preserves a phone account when linking and never merges a colliding identity', async () => {
    const sms = app.get<any>(require('../src/modules/auth/sms/test-sms-provider.adapter').TestSmsProviderAdapter);
    const phone = '+977985' + String(Date.now()).slice(-7);
    const challenge = await post('/auth/otp/request', { phoneNumber: phone });
    const smsCode = await sms.getLastOtp(phone);
    const signed = await post('/auth/native/verify', { otpSessionId: challenge.body.otpSessionId, code: smsCode });
    expect(signed.status).toBe(200);
    const link = await begin(uniqueEmail(), signed.body.accessToken);
    // A public verification must not consume an authenticated linking challenge.
    expect((await verify(link.id, link.code)).status).toBe(401);
    expect((await verify(link.id, link.code, signed.body.accessToken)).body).toEqual({ linked: true });
    const identity = await db.client.query('SELECT user_id FROM account_email_identities WHERE email=$1', [link.email]);
    expect(identity.rows[0].user_id).toBe(signed.body.user.id);
    const other = await begin();
    const otherSession = await verify(other.id, other.code);
    const destination = createHmac('sha256', process.env.EMAIL_OTP_HASH_KEY!)
      .update('destination:' + link.email).digest('hex');
    await redis.del('email:cooldown:' + destination);
    const collision = await begin(link.email, otherSession.body.accessToken);
    expect((await verify(collision.id, collision.code, otherSession.body.accessToken)).status).toBe(403);
    const after = await db.client.query('SELECT user_id FROM account_email_identities WHERE email=$1', [link.email]);
    expect(after.rows[0].user_id).toBe(signed.body.user.id);
    await redis.del('email:cooldown:' + destination);
    const recovered = await begin(link.email);
    expect((await verify(recovered.id, recovered.code)).body.user.id).toBe(signed.body.user.id);
  });

  it('fails delivery without exposing provider errors or accepting an undelivered code', async () => {
    const email = uniqueEmail();
    const spy = jest.spyOn(capture, 'sendCode').mockRejectedValueOnce(new Error('provider-private-error'));
    const response = await request(email);
    spy.mockRestore();
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('provider-private-error');
    expect(await redis.get('email:challenge:' + response.body.otpSessionId)).toBeNull();
    expect((await verify(response.body.otpSessionId, '000000')).status).toBe(401);
  });

  it('creates an Android session and uses verified email for deletion reauthentication', async () => {
    const c = await begin();
    const signed = await post('/auth/email/native/verify', {
      otpSessionId: c.id, code: c.code,
      deviceInfo: { deviceId: 'synthetic-android', platform: 'android', appVersion: '1.0.0' },
    });
    expect(signed.status).toBe(200);
    const session = await db.client.query('SELECT device_platform FROM user_sessions WHERE user_id=$1', [signed.body.user.id]);
    expect(session.rows[0].device_platform).toBe('android');
    const deletion = await post('/profile/delete-challenge', {}, signed.body.accessToken);
    expect(deletion.status).toBe(201);
    expect(capture.takeCode(c.email)).toMatch(/^\d{6}$/);
    const challenge = await db.client.query('SELECT phone_number,email_destination FROM auth_challenges WHERE challenge_id=$1', [deletion.body.challengeId]);
    expect(challenge.rows[0]).toEqual({ phone_number: null, email_destination: c.email });
  });

  it('rejects browser token-body transport and unexpected body fields', async () => {
    const c = await begin();
    const browser = await fetch(base + '/auth/email/native/verify', { method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.org' },
      body: JSON.stringify({ otpSessionId: c.id, code: c.code }) });
    expect(browser.status).toBe(403);
    const response = await post('/auth/email/verify', { otpSessionId: c.id, code: c.code, userId: randomUUID() });
    expect(response.status).toBe(400);
    const web = await post('/auth/email/verify', { otpSessionId: c.id, code: c.code });
    expect(web.status).toBe(200);
    expect(web.body.refreshToken).toBeUndefined();
    expect(web.headers.get('set-cookie')).toContain('HttpOnly');
  });
});
