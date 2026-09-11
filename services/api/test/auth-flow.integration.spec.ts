import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { RedisService } from '../src/redis/redis.service';
import { Role, ErrorCode } from '@kashyap/contracts';

describe('Auth & Permissions End-to-End HTTP Flow (Real Nest App, PG & Redis / D: Storage)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let smsAdapter: TestSmsProviderAdapter;
  let redisService: RedisService;

  const uniqueSuffix = Math.floor(1000000 + Math.random() * 9000000).toString();
  const TEST_PHONE_RAW = `985${uniqueSuffix}`;
  const TEST_PHONE = `+977${TEST_PHONE_RAW}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';
    process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    await app.listen(0);

    const server = app.getHttpServer();
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    smsAdapter = app.get<TestSmsProviderAdapter>(TestSmsProviderAdapter);
    redisService = app.get<RedisService>(RedisService);

    // Clean any prior keys
    await redisService.del(
      `otp:challenge:${TEST_PHONE}`,
      `otp:cooldown:${TEST_PHONE}`,
      `otp:ratelimit:phone:${TEST_PHONE}`,
      'otp:ratelimit:ip:127.0.0.1',
      'otp:ratelimit:ip:::1',
    );
  }, 45000);

  beforeEach(async () => {
    if (redisService) {
      await redisService.del(
        'otp:ratelimit:ip:127.0.0.1',
        'otp:ratelimit:ip:::1',
        'otp:ratelimit:ip:::ffff:127.0.0.1',
      );
      const client = redisService.getClient();
      if (client) {
        const rateKeys = await client.keys('otp:ratelimit:*');
        if (rateKeys.length > 0) {
          await redisService.del(...rateKeys);
        }
      }
    }
  });

  afterAll(async () => {
    if (redisService) {
      await redisService.del(
        `otp:challenge:${TEST_PHONE}`,
        `otp:cooldown:${TEST_PHONE}`,
        `otp:ratelimit:phone:${TEST_PHONE}`,
        'otp:ratelimit:ip:127.0.0.1',
        'otp:ratelimit:ip:::1',
      );
    }
    if (app) {
      await app.close();
    }
  });

  let userTokens: { accessToken: string; refreshToken: string };
  let superAdminTokens: { accessToken: string; refreshToken: string };

  it('1. POST /auth/otp/request: should reject invalid phone formats', async () => {
    const res = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '12345' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errorCode).toBe(ErrorCode.INVALID_PHONE_NUMBER);
  });

  let latestOtpSessionId: string;

  it('2. POST /auth/otp/request: should generate OTP challenge and enforce 60s cooldown', async () => {
    const res = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: TEST_PHONE_RAW }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.otpSessionId).toBeDefined();
    expect(body.cooldownSeconds).toBe(60);
    latestOtpSessionId = body.otpSessionId;

    // Immediate second request must be rejected with 400 (cooldown)
    const res2 = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: TEST_PHONE_RAW }),
    });
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.errorCode).toBe(ErrorCode.OTP_RESEND_COOLDOWN);
  });

  it('3. POST /auth/otp/verify: should verify OTP, create PostgreSQL account without claiming person (BR-GOV-001, EC-0023)', async () => {
    const otp = smsAdapter.getLastOtp(TEST_PHONE);
    expect(otp).toBeDefined();

    const res = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpSessionId: latestOtpSessionId,
        code: otp,
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.phoneNumber).toBe(TEST_PHONE);

    // CRITICAL: Person record separation
    expect(body.user.personId).toBeNull();
    expect(body.user.isClaimed).toBe(false);

    userTokens = {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
    };
  });

  it('4. GET /auth/me: should return authenticated user profile and roles', async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.phoneNumber).toBe(TEST_PHONE);
    expect(body.roles.some((r: any) => r.role === Role.REGISTERED_USER)).toBe(true);
  });

  it('5. POST /auth/refresh: should rotate refresh token and issue new session (AUTH-FR-006)', async () => {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: userTokens.refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).not.toBe(userTokens.refreshToken);

    // Save previous token to test replay attack
    const oldRefreshToken = userTokens.refreshToken;
    userTokens = {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
    };

    // 6. EC-0020: Replay old refresh token -> must be rejected with 401 REFRESH_TOKEN_REUSED
    const replayRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken }),
    });

    expect(replayRes.status).toBe(401);
    const replayBody = await replayRes.json();
    expect(replayBody.errorCode).toBe(ErrorCode.REFRESH_TOKEN_REUSED);
  });

  it('7. Server-enforced permissions: regular user cannot access protected admin endpoints (BR-GOV-004)', async () => {
    // Re-authenticate regular user because EC-0020 in test 6 revoked all sessions on replay
    await redisService.del(`otp:cooldown:${TEST_PHONE}`, `otp:ratelimit:phone:${TEST_PHONE}`);
    const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: TEST_PHONE_RAW }),
    });
    expect(reqRes.status).toBe(200);
    const reqBody = await reqRes.json();
    const otp = smsAdapter.getLastOtp(TEST_PHONE);
    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpSessionId: reqBody.otpSessionId,
        code: otp,
      }),
    });
    expect(verifyRes.status).toBe(200);
    const activeSession = await verifyRes.json();

    // Attempt to access audit logs as regular registered user
    const res = await fetch(`${baseUrl}/audit`, {
      headers: {
        Authorization: `Bearer ${activeSession.accessToken}`,
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errorCode).toBe(ErrorCode.FORBIDDEN);
  });

  it('8. Super Admin bootstrap account login and full administrative access', async () => {
    // Clear cooldown for super admin bootstrap number
    const adminPhone = '+9779800000001';
    await redisService.del(`otp:cooldown:${adminPhone}`, `otp:ratelimit:phone:${adminPhone}`);

    // Request OTP
    const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: adminPhone }),
    });
    const adminReqBody = await reqRes.json();
    expect(reqRes.status).toBe(200);
    expect(adminReqBody.otpSessionId).toBeDefined();

    const adminOtp = smsAdapter.getLastOtp(adminPhone);
    expect(adminOtp).toBeDefined();

    // Verify OTP
    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpSessionId: adminReqBody.otpSessionId,
        code: adminOtp,
      }),
    });
    const adminSession = await verifyRes.json();
    expect(verifyRes.status).toBe(200);
    expect(adminSession.user.roles).toContain(Role.SUPER_ADMIN);

    superAdminTokens = {
      accessToken: adminSession.accessToken,
      refreshToken: adminSession.refreshToken,
    };

    // Super Admin can access audit logs
    const auditRes = await fetch(`${baseUrl}/audit`, {
      headers: {
        Authorization: `Bearer ${superAdminTokens.accessToken}`,
      },
    });
    expect(auditRes.status).toBe(200);
    const auditLogs = await auditRes.json();
    expect(Array.isArray(auditLogs)).toBe(true);
  });

  it('9. POST /auth/logout: should revoke session and invalidate refresh token (AUTH-FR-007)', async () => {
    const res = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminTokens.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: superAdminTokens.refreshToken }),
    });

    expect(res.status).toBe(200);

    // Refreshing with the logged-out refresh token must now be rejected
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: superAdminTokens.refreshToken }),
    });

    expect(refreshRes.status).toBe(401);
  });
});
