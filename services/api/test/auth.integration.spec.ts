import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { RedisService } from '../src/redis/redis.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { BootstrapService } from '../src/database/bootstrap.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { JWT_SECRET } from '../src/modules/auth/auth.constants';
import { JwtService } from '@nestjs/jwt';
import { Role, ErrorCode } from '@kashyap/contracts';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('Auth & Sessions Integration (Real PostgreSQL & Redis / D: Storage)', () => {
  let db: DatabaseService;
  let migrationService: MigrationService;
  let redisService: RedisService;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let auditRepo: AuditRepository;
  let bootstrapService: BootstrapService;
  let smsProvider: TestSmsProviderAdapter;
  let jwtService: JwtService;
  let authService: AuthService;

  const uniqueSuffix = Math.floor(1000000 + Math.random() * 9000000).toString();
  const TEST_PHONE_RAW = `984${uniqueSuffix}`;
  const TEST_PHONE = `+977${TEST_PHONE_RAW}`;

  beforeAll(async () => {
    // 1. Configure real PostgreSQL environment
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    // 2. Configure real Redis environment
    process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
    process.env.SEED_ADMINS = 'true';

    db = new DatabaseService();
    await db.onModuleInit();

    migrationService = new MigrationService(db);
    await migrationService.onModuleInit();

    redisService = new RedisService();
    await redisService.onModuleInit();

    userRepo = new UserRepository(db);
    sessionRepo = new SessionRepository(db);
    branchRepo = new BranchRepository(db);
    auditRepo = new AuditRepository(db);
    bootstrapService = new BootstrapService(userRepo, branchRepo);
    await bootstrapService.onModuleInit();

    smsProvider = new TestSmsProviderAdapter();
    jwtService = new JwtService({ secret: JWT_SECRET });

    authService = new AuthService(
      jwtService,
      redisService,
      userRepo,
      sessionRepo,
      branchRepo,
      auditRepo,
      smsProvider,
    );

    // Clean test phone artifacts from Redis
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
      await redisService.del('otp:ratelimit:ip:127.0.0.1', 'otp:ratelimit:ip:::1');
    }
  });

  afterAll(async () => {
    // Clean Redis keys
    if (redisService) {
      await redisService.del(
        `otp:challenge:${TEST_PHONE}`,
        `otp:cooldown:${TEST_PHONE}`,
        `otp:ratelimit:phone:${TEST_PHONE}`,
        'otp:ratelimit:ip:127.0.0.1',
        'otp:ratelimit:ip:::1',
      );
      await redisService.onModuleDestroy();
    }
    if (db) {
      await db.onModuleDestroy();
    }
  });

  it('should verify real Redis and PostgreSQL are active and ready', () => {
    expect(db.isReady()).toBe(true);
    expect(redisService.isReady()).toBe(true);
  });

  it('should verify development bootstrap populated fictional Super Admin and Branch Admin in PostgreSQL', async () => {
    const superAdmin = await userRepo.findByPhone('+9779800000001');
    expect(superAdmin).toBeDefined();
    expect(superAdmin?.is_phone_verified).toBe(true);

    const superAdminRoles = await userRepo.getUserRoles(superAdmin!.id);
    expect(superAdminRoles.some((r) => r.role === Role.SUPER_ADMIN)).toBe(true);

    const branchAdmin = await userRepo.findByPhone('+9779800000002');
    expect(branchAdmin).toBeDefined();

    const branchAdminRoles = await userRepo.getUserRoles(branchAdmin!.id);
    expect(branchAdminRoles.some((r) => r.role === Role.BRANCH_ADMIN)).toBe(true);
    expect(branchAdminRoles[0].branch_id).toBeDefined();
  });

  it('should store OTP challenge in real Redis and record 60s cooldown (AUTH-FR-002, AUTH-FR-004)', async () => {
    const res = await authService.requestOtp({ phoneNumber: TEST_PHONE_RAW });
    expect(res.otpSessionId).toBeDefined();
    expect(res.cooldownSeconds).toBe(60);

    // Check challenge stored in real Redis
    const challengeRaw = await redisService.get(`otp:challenge:${TEST_PHONE}`);
    expect(challengeRaw).toBeDefined();
    const challenge = JSON.parse(challengeRaw!);
    expect(challenge.phone).toBe(TEST_PHONE);
    expect(challenge.codeHash).toBeDefined();

    // Check cooldown key in real Redis
    const cooldown = await redisService.get(`otp:cooldown:${TEST_PHONE}`);
    expect(cooldown).toBe('1');

    // Immediate second request must be rejected by cooldown
    await expect(authService.requestOtp({ phoneNumber: TEST_PHONE_RAW })).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.OTP_RESEND_COOLDOWN,
      },
    });
  });

  it('should verify OTP, create real PostgreSQL user account and session, without claiming person (AUTH-FR-003, BR-GOV-001, EC-0023)', async () => {
    // Clear cooldown to get a fresh challenge
    await redisService.del(`otp:cooldown:${TEST_PHONE}`);
    const initRes = await authService.requestOtp({ phoneNumber: TEST_PHONE_RAW });
    const sentOtp = smsProvider.getLastOtp(TEST_PHONE)!;

    const session = await authService.verifyOtp(
      {
        otpSessionId: initRes.otpSessionId,
        code: sentOtp,
      },
      '127.0.0.1',
      'IntegrationTestRunner',
    );

    expect(session.accessToken).toBeDefined();
    expect(session.refreshToken).toBeDefined();
    expect(session.user.phoneNumber).toBe(TEST_PHONE);

    // CRITICAL: Account must NOT claim a person automatically
    expect(session.user.personId).toBeNull();
    expect(session.user.isClaimed).toBe(false);

    // Query real PostgreSQL user_accounts table
    const pgUser = await userRepo.findById(session.user.id);
    expect(pgUser).toBeDefined();
    expect(pgUser?.phone_number).toBe(TEST_PHONE);
    expect(pgUser?.is_phone_verified).toBe(true);
    expect(pgUser?.person_id).toBeNull();

    // Query real PostgreSQL user_roles table
    const roles = await userRepo.getUserRoles(session.user.id);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles[0].role).toBe(Role.REGISTERED_USER);

    // Query real PostgreSQL user_sessions table
    const activeSessions = await sessionRepo.getActiveSessionsForUser(session.user.id);
    expect(activeSessions.length).toBe(1);
    expect(activeSessions[0].device_platform).toBe('web');

    // Verify atomic consumption: challenge must be deleted from Redis
    const challengeAfter = await redisService.get(`otp:challenge:${TEST_PHONE}`);
    expect(challengeAfter).toBeNull();
  });

  it('should rotate refresh token in real PostgreSQL (AUTH-FR-006)', async () => {
    const pgUser = await userRepo.findByPhone(TEST_PHONE);
    expect(pgUser).toBeDefined();

    // Get active session
    const activeSessions = await sessionRepo.getActiveSessionsForUser(pgUser!.id);
    expect(activeSessions.length).toBe(1);

    // Clear cooldown and login to obtain fresh tokens
    await redisService.del(`otp:cooldown:${TEST_PHONE}`);
    const init = await authService.requestOtp({ phoneNumber: TEST_PHONE_RAW });
    const code = smsProvider.getLastOtp(TEST_PHONE)!;
    const session1 = await authService.verifyOtp({ otpSessionId: init.otpSessionId, code });

    // Rotate refresh token
    const session2 = await authService.refreshToken({ refreshToken: session1.refreshToken });
    expect(session2.accessToken).toBeDefined();
    expect(session2.refreshToken).not.toBe(session1.refreshToken);

    // Verify in PostgreSQL: old session revoked, new session active
    const postSessions = await db.query(
      'SELECT id, refresh_token_hash, revoked_at FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC',
      [pgUser!.id],
    );
    expect(postSessions.rows.length).toBeGreaterThanOrEqual(2);

    // Most recent is active (revoked_at IS NULL)
    expect(postSessions.rows[0].revoked_at).toBeNull();

    // Previous session is revoked (revoked_at IS NOT NULL)
    const prevRevoked = postSessions.rows.slice(1).some((s: any) => s.revoked_at !== null);
    expect(prevRevoked).toBe(true);
  });

  it('should detect refresh token reuse attack and revoke ALL user sessions in PostgreSQL (EC-0020)', async () => {
    const pgUser = await userRepo.findByPhone(TEST_PHONE);
    expect(pgUser).toBeDefined();

    // Login to get session A
    await redisService.del(`otp:cooldown:${TEST_PHONE}`);
    const init = await authService.requestOtp({ phoneNumber: TEST_PHONE_RAW });
    const code = smsProvider.getLastOtp(TEST_PHONE)!;
    const sessionA = await authService.verifyOtp({ otpSessionId: init.otpSessionId, code });

    // Rotate to session B (session A is revoked)
    await authService.refreshToken({ refreshToken: sessionA.refreshToken });

    // Attacker attempts to replay already-revoked session A token!
    await expect(
      authService.refreshToken({ refreshToken: sessionA.refreshToken }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.REFRESH_TOKEN_REUSED,
      },
    });

    // Verify in PostgreSQL that ALL sessions for this user are now revoked
    const userSessions = await db.query(
      'SELECT id, revoked_at FROM user_sessions WHERE user_id = $1',
      [pgUser!.id],
    );
    expect(userSessions.rows.length).toBeGreaterThan(0);
    const allRevoked = userSessions.rows.every((s: any) => s.revoked_at !== null);
    expect(allRevoked).toBe(true);
  });

  it('should immediately block suspended accounts in PostgreSQL (AUTH-FR-010)', async () => {
    const pgUser = await userRepo.findByPhone(TEST_PHONE);
    expect(pgUser).toBeDefined();

    // Set account suspended in PostgreSQL
    await userRepo.setSuspension(pgUser!.id, true, 'Testing suspension gate in integration test');

    // Attempting login with suspended account must be rejected with ACCOUNT_SUSPENDED
    await redisService.del(`otp:cooldown:${TEST_PHONE}`);
    const init = await authService.requestOtp({ phoneNumber: TEST_PHONE_RAW });
    const code = smsProvider.getLastOtp(TEST_PHONE)!;

    await expect(
      authService.verifyOtp({ otpSessionId: init.otpSessionId, code }),
    ).rejects.toThrow(ForbiddenException);

    // Restore suspension for cleanup
    await userRepo.setSuspension(pgUser!.id, false);
  });

  it('should prevent self-elevation in real PostgreSQL role assignment (BR-GOV-004, EC-0230)', async () => {
    const pgUser = await userRepo.findByPhone(TEST_PHONE);
    expect(pgUser).toBeDefined();

    await expect(
      authService.assignUserRole(pgUser!.id, [Role.SUPER_ADMIN], pgUser!.id, Role.SUPER_ADMIN),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
      },
    });
  });
});
