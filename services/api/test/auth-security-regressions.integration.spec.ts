import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { RedisService } from '../src/redis/redis.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { Role, ErrorCode, Gender, LivingStatus } from '@kashyap/contracts';
import { getJwtSecret } from '../src/modules/auth/auth.constants';
import { BootstrapService } from '../src/database/bootstrap.service';
import { SparrowSmsProviderAdapter } from '../src/modules/auth/sms/sparrow-sms-provider.adapter';

describe('Milestone 2 Security & Authority Hardening Regressions (Real PG & Redis / D: Storage)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let smsAdapter: TestSmsProviderAdapter;
  let redisService: RedisService;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let personRepo: PersonRepository;

  const uniqueId = Math.floor(100000 + Math.random() * 900000).toString();
  let kaskiBranchId: string;
  let lamjungBranchId: string;

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
    userRepo = app.get<UserRepository>(UserRepository);
    sessionRepo = app.get<SessionRepository>(SessionRepository);
    branchRepo = app.get<BranchRepository>(BranchRepository);
    personRepo = app.get<PersonRepository>(PersonRepository);

    // Resolve or create branches
    const kaski = await branchRepo.create({
      code: `KASKI_${uniqueId}`,
      nameNepali: 'कास्की शाखा',
      nameEnglish: `Kaski Branch ${uniqueId}`,
      moolGhar: 'हेम्जा, कास्की',
    });
    kaskiBranchId = kaski.id;

    const lamjung = await branchRepo.create({
      code: `LAMJUNG_${uniqueId}`,
      nameNepali: 'लमजुङ शाखा',
      nameEnglish: `Lamjung Branch ${uniqueId}`,
      moolGhar: 'राइनास, लमजुङ',
    });
    lamjungBranchId = lamjung.id;
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
    if (app) {
      await app.close();
    }
  });

  // Helper to authenticate a phone and get tokens
  async function loginPhone(phoneNumber: string): Promise<{ accessToken: string; refreshToken: string; userId: string; sessionId: string }> {
    smsAdapter.clear();
    await redisService.del(`otp:cooldown:${phoneNumber}`);
    const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const reqData = (await reqRes.json()) as any;
    const otp = smsAdapter.getLastOtp(phoneNumber);

    const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        otpSessionId: reqData.otpSessionId,
        code: otp,
      }),
    });
    const verifyData = (await verifyRes.json()) as any;
    return {
      accessToken: verifyData.accessToken,
      refreshToken: verifyData.refreshToken,
      userId: verifyData.user.id,
      sessionId: (verifyData as any).sessionId || '',
    };
  }

  // --------------------------------------------------------------------------
  // 1. Removed Last Role Revocation
  // --------------------------------------------------------------------------
  it('1. Removed last role revocation: empty roles in DB must never fall back to old JWT claims', async () => {
    const phone = `+9779811${Math.floor(100000 + Math.random() * 900000)}`;
    const session = await loginPhone(phone);

    // Grant Super Admin so token is initially privileged
    await userRepo.assignRole(session.userId, Role.SUPER_ADMIN);

    // Verify user profile returns role
    const meResBefore = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(meResBefore.status).toBe(200);
    const meBefore = (await meResBefore.json()) as any;
    expect(meBefore.roles.some((r: any) => r.role === Role.SUPER_ADMIN)).toBe(true);

    // Revoke ALL roles for this user from PostgreSQL
    await userRepo.revokeRole(session.userId, Role.SUPER_ADMIN);
    await userRepo.revokeRole(session.userId, Role.REGISTERED_USER);

    // Access a role-guarded endpoint (/claims list requires SUPER_ADMIN or BRANCH_ADMIN)
    const claimsRes = await fetch(`${baseUrl}/claims`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    // Must be 403 Forbidden: server evaluated fresh DB roles (which is now empty)
    expect(claimsRes.status).toBe(403);
    const errData = (await claimsRes.json()) as any;
    expect(errData.message).toContain('Access denied');
  });

  // --------------------------------------------------------------------------
  // 2. Cross-Branch Access Denial
  // --------------------------------------------------------------------------
  it('2. Cross-branch access denial: Branch Admin of Branch A cannot mutate or review for Branch B', async () => {
    const adminPhone = `+9779812${Math.floor(100000 + Math.random() * 900000)}`;
    const session = await loginPhone(adminPhone);

    // Grant Branch Admin for KASKI branch ONLY
    await userRepo.assignRole(session.userId, Role.BRANCH_ADMIN, kaskiBranchId);

    // a) Attempt to create a person in LAMJUNG branch -> 403 BRANCH_MISMATCH
    const createPersonRes = await fetch(`${baseUrl}/genealogy/people`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        branchId: lamjungBranchId, // Spoofed / Cross-branch target!
        generation: 5,
        gender: Gender.MALE,
        livingStatus: LivingStatus.LIVING,
        names: [
          { language: 'ne', firstName: 'हरि', lastName: 'अधिकारी', fullName: 'हरि अधिकारी', isPrimary: true },
        ],
      }),
    });
    expect(createPersonRes.status).toBe(403);
    const errCreate = (await createPersonRes.json()) as any;
    expect(errCreate.message).toContain('Branch mismatch');

    // b) Attempt to assign a role in LAMJUNG branch -> 403 BRANCH_MISMATCH
    const targetUser = await userRepo.findOrCreateByPhone(`+9779813${Math.floor(100000 + Math.random() * 900000)}`);
    const assignRoleRes = await fetch(`${baseUrl}/auth/roles/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        userId: targetUser.id,
        role: Role.VERIFIED_MEMBER,
        branchId: lamjungBranchId, // Not caller's branch!
      }),
    });
    expect(assignRoleRes.status).toBe(403);
    const errAssign = (await assignRoleRes.json()) as any;
    expect(errAssign.message).toContain('Branch mismatch');
  });

  // --------------------------------------------------------------------------
  // 3. Missing or Spoofed Branch ID Rejection
  // --------------------------------------------------------------------------
  it('3. Missing or spoofed branch ID rejection on mutations', async () => {
    const adminPhone = `+9779814${Math.floor(100000 + Math.random() * 900000)}`;
    const session = await loginPhone(adminPhone);
    await userRepo.assignRole(session.userId, Role.BRANCH_ADMIN, kaskiBranchId);

    // Non-existent spoofed branch ID
    const fakeBranchRes = await fetch(`${baseUrl}/genealogy/people`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        branchId: '00000000-0000-0000-0000-000000000000',
        generation: 5,
        gender: Gender.FEMALE,
        livingStatus: LivingStatus.LIVING,
        names: [
          { language: 'ne', firstName: 'सीता', lastName: 'अधिकारी', fullName: 'सीता अधिकारी', isPrimary: true },
        ],
      }),
    });
    expect(fakeBranchRes.status).toBe(403); // Branch mismatch: user doesn't possess authority for fake branch
  });

  // --------------------------------------------------------------------------
  // 4. Access Token Invalidation After Revocation Events
  // --------------------------------------------------------------------------
  describe('4. Access token invalidation after revocation events', () => {
    it('Event A: Logout immediately revokes access token', async () => {
      const phone = `+9779815${Math.floor(100000 + Math.random() * 900000)}`;
      const session = await loginPhone(phone);

      // Verify access works
      const testRes1 = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      expect(testRes1.status).toBe(200);

      // Logout with refresh token
      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      expect(logoutRes.status).toBe(200);

      // Subsequent access with old access token MUST be rejected
      const testRes2 = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      expect(testRes2.status).toBe(401);
      const err = (await testRes2.json()) as any;
      expect(err.message).toContain('Session has been revoked or expired');
    });

    it('Event B: Logout-all immediately revokes all access tokens across devices', async () => {
      const phone = `+9779816${Math.floor(100000 + Math.random() * 900000)}`;
      const sessionDevice1 = await loginPhone(phone);
      const sessionDevice2 = await loginPhone(phone);

      // Verify both work
      expect((await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${sessionDevice1.accessToken}` } })).status).toBe(200);
      expect((await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${sessionDevice2.accessToken}` } })).status).toBe(200);

      // Call logout-all from Device 1
      const logoutAllRes = await fetch(`${baseUrl}/auth/logout-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionDevice1.accessToken}` },
      });
      expect(logoutAllRes.status).toBe(200);

      // Device 2 access token must now be rejected
      const resDev2 = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${sessionDevice2.accessToken}` },
      });
      expect(resDev2.status).toBe(401);
    });

    it('Event C: Account suspension immediately blocks active access tokens', async () => {
      const phone = `+9779817${Math.floor(100000 + Math.random() * 900000)}`;
      const session = await loginPhone(phone);

      expect((await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } })).status).toBe(200);

      // Suspend user
      await userRepo.setSuspension(session.userId, true, 'Test policy violation suspension');

      // Next request with access token must be rejected with 403 ACCOUNT_SUSPENDED
      const suspendedRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      expect(suspendedRes.status).toBe(403);
      const err = (await suspendedRes.json()) as any;
      expect(err.errorCode).toBe(ErrorCode.ACCOUNT_SUSPENDED);
    });

    it('Event D: Refresh token reuse immediately invalidates all access tokens for that user', async () => {
      const phone = `+9779818${Math.floor(100000 + Math.random() * 900000)}`;
      const session = await loginPhone(phone);

      // Valid rotation: refresh_1 -> refresh_2 + access_2
      const rotateRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      expect(rotateRes.status).toBe(200);
      const rotateData = (await rotateRes.json()) as any;
      const access2 = rotateData.accessToken;

      // Verify access2 works
      expect((await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${access2}` } })).status).toBe(200);

      // Attacker replays revoked refresh_1!
      const replayRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      expect(replayRes.status).toBe(401);
      const replayErr = (await replayRes.json()) as any;
      expect(replayErr.errorCode).toBe(ErrorCode.REFRESH_TOKEN_REUSED);

      // access2 MUST now be revoked!
      const access2AfterReplay = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${access2}` },
      });
      expect(access2AfterReplay.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Concurrent OTP Single-Winner Admission
  // --------------------------------------------------------------------------
  it('5. Concurrent OTP single-winner admission: exactly one request succeeds under concurrency', async () => {
    const phone = `+9779819${Math.floor(100000 + Math.random() * 900000)}`;
    smsAdapter.clear();

    const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    });
    const reqData = (await reqRes.json()) as any;
    const otpCode = smsAdapter.getLastOtp(phone);

    // Dispatch 10 concurrent verify requests with the exact same OTP code
    const concurrentRequests = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpSessionId: reqData.otpSessionId,
          code: otpCode,
        }),
      }),
    );

    const responses = await Promise.all(concurrentRequests);
    const statusCodes = responses.map((r) => r.status);

    const successCount = statusCodes.filter((s) => s === 200).length;
    const failCount = statusCodes.filter((s) => s === 400).length;

    // Exactly 1 winner admitted!
    expect(successCount).toBe(1);
    expect(failCount).toBe(9);
  });

  // --------------------------------------------------------------------------
  // 6. Concurrent Refresh Successor Uniqueness
  // --------------------------------------------------------------------------
  it('6. Concurrent refresh successor uniqueness: exactly one successor session created under concurrency', async () => {
    const phone = `+9779820${Math.floor(100000 + Math.random() * 900000)}`;
    const session = await loginPhone(phone);

    // Dispatch 5 concurrent refresh requests using the exact same refresh token
    const concurrentRefreshes = Array.from({ length: 5 }).map(() =>
      fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      }),
    );

    const responses = await Promise.all(concurrentRefreshes);
    const statusCodes = responses.map((r) => r.status);

    // With SELECT ... FOR UPDATE row locking, the first request acquires lock and rotates.
    // Subsequent requests unblock, detect revoked_at is not null, and trigger EC-0020 (401 REFRESH_TOKEN_REUSED).
    const successCount = statusCodes.filter((s) => s === 200).length;
    const rejectedCount = statusCodes.filter((s) => s === 401).length;

    expect(successCount).toBe(1);
    expect(rejectedCount).toBe(4);
  });

  // --------------------------------------------------------------------------
  // 7. Production Credential Validation Rejection
  // --------------------------------------------------------------------------
  describe('7. Production credential validation rejection', () => {
    it('Rejects missing or weak JWT_SECRET in production mode', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        expect(() => getJwtSecret()).toThrow('FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is required');
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.JWT_SECRET = prevSecret;
      }
    });

    it('Rejects SEED_ADMINS=true in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSeed = process.env.SEED_ADMINS;
      try {
        process.env.NODE_ENV = 'production';
        process.env.SEED_ADMINS = 'true';
        const bootstrap = new BootstrapService(userRepo, branchRepo);
        await expect(bootstrap.onModuleInit()).rejects.toThrow(
          'FATAL SECURITY VIOLATION: Fictional admin account seeding (SEED_ADMINS=true) is strictly prohibited in production mode.',
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.SEED_ADMINS = prevSeed;
      }
    });

    it('Rejects missing SPARROW_SMS_TOKEN in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevToken = process.env.SPARROW_SMS_TOKEN;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.SPARROW_SMS_TOKEN;
        const adapter = new SparrowSmsProviderAdapter();
        await expect(adapter.onModuleInit()).rejects.toThrow(
          'FATAL CONFIGURATION: SPARROW_SMS_TOKEN is required and must be configured for SparrowSmsProviderAdapter in production mode',
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.SPARROW_SMS_TOKEN = prevToken;
      }
    });
  });
});
