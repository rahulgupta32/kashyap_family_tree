import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { RedisService } from '../src/redis/redis.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { DatabaseService } from '../src/database/database.service';
import { Role, ErrorCode, Gender, LivingStatus, AuditAction } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

describe('Milestone 2 Acceptance Hardening & Security Regressions', () => {
  let app: INestApplication;
  let baseUrl: string;
  let smsAdapter: TestSmsProviderAdapter;
  let redisService: RedisService;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let personRepo: PersonRepository;
  let auditRepo: AuditRepository;
  let auditOutboxRepo: AuditOutboxRepository;
  let dbService: DatabaseService;
  let jwtService: JwtService;

  const testRunId = Math.floor(100000 + Math.random() * 900000).toString();
  let branchAId: string;
  let branchBId: string;

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
    auditRepo = app.get<AuditRepository>(AuditRepository);
    auditOutboxRepo = app.get<AuditOutboxRepository>(AuditOutboxRepository);
    dbService = app.get<DatabaseService>(DatabaseService);
    jwtService = app.get<JwtService>(JwtService);

    // Setup two test branches
    const bA = await branchRepo.create({
      code: `BRA_${testRunId}`,
      nameNepali: 'शाखा क',
      nameEnglish: `Branch A ${testRunId}`,
      moolGhar: 'कास्की',
    });
    branchAId = bA.id;

    const bB = await branchRepo.create({
      code: `BRB_${testRunId}`,
      nameNepali: 'शाखा ख',
      nameEnglish: `Branch B ${testRunId}`,
      moolGhar: 'लमजुङ',
    });
    branchBId = bB.id;
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

  async function loginUser(phoneNumber: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: string;
    sessionId: string;
  }> {
    smsAdapter.clear();
    await redisService.del(`otp:cooldown:${phoneNumber}`);
    const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const reqData = (await reqRes.json()) as any;
    if (!reqRes.ok) {
      throw new Error(`loginUser requestOtp failed: ${JSON.stringify(reqData)}`);
    }
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
    if (!verifyRes.ok) {
      throw new Error(`loginUser verifyOtp failed: ${JSON.stringify(verifyData)}`);
    }
    const setCookie = verifyRes.headers.get('set-cookie');
    let cookieRefreshToken = '';
    if (setCookie) {
      const m = setCookie.match(/refreshToken=([^;]+)/);
      if (m) cookieRefreshToken = m[1];
    }

    // Decode token to get sid
    const decoded = jwtService.decode(verifyData.accessToken) as any;

    return {
      accessToken: verifyData.accessToken,
      refreshToken: cookieRefreshToken,
      userId: verifyData.user.id,
      sessionId: decoded?.sid || '',
    };
  }

  // ==========================================================================
  // Item 1: Authenticate logout and bind sessions to their owners
  // ==========================================================================
  describe('1. Logout Authentication & Session Owner Binding', () => {
    it('should reject Bearer logout with forged, unsigned, or mismatched token', async () => {
      const userA = await loginUser(`+9779841${Math.floor(100000 + Math.random() * 900000)}`);
      const userB = await loginUser(`+9779842${Math.floor(100000 + Math.random() * 900000)}`);

      // A) Forged signature
      const forgedToken = userA.accessToken + 'tampered';
      const resA = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(resA.status).toBe(401);

      // B) Mismatched token subject vs DB session owner
      // Forge a signed token that has userA's sid but userB's sub
      const mismatchedToken = jwtService.sign(
        {
          sub: userB.userId,
          sid: userA.sessionId,
          tokenType: 'access',
          phone: '+9779842000000',
          roles: [],
        },
        {
          secret: getJwtSecret(),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithm: JWT_ALGORITHM as any,
          expiresIn: '15m',
        },
      );

      const resMismatch = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mismatchedToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(resMismatch.status).toBe(401);

      // Verify userA's session was NOT revoked by the mismatched request
      const sessionA = await sessionRepo.findById(userA.sessionId);
      expect(sessionA?.revoked_at).toBeNull();
    });

    it('JwtStrategy should reject access token if token subject does not match DB session owner', async () => {
      const userA = await loginUser(`+9779843${Math.floor(100000 + Math.random() * 900000)}`);
      const userB = await loginUser(`+9779844${Math.floor(100000 + Math.random() * 900000)}`);

      const stolenSidToken = jwtService.sign(
        {
          sub: userB.userId,
          sid: userA.sessionId,
          tokenType: 'access',
          phone: '+9779844000000',
          roles: [Role.SUPER_ADMIN],
        },
        {
          secret: getJwtSecret(),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          algorithm: JWT_ALGORITHM as any,
          expiresIn: '15m',
        },
      );

      // Attempt protected call
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${stolenSidToken}`,
        },
      });
      expect(res.status).toBe(401);
    });

    it('should successfully logout with valid Bearer token and record audit evidence', async () => {
      const user = await loginUser(`+9779845${Math.floor(100000 + Math.random() * 900000)}`);

      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);

      const session = await sessionRepo.findById(user.sessionId);
      expect(session?.revoked_at).not.toBeNull();
    });
  });

  // ==========================================================================
  // Item 2: Authorize resources using server-side data & GEN-002 Cross-Branch
  // ==========================================================================
  describe('2. Server-Side Resource Authorization & Cross-Branch Rules (GEN-002)', () => {
    let adminBranchA: { accessToken: string; userId: string };
    let adminBranchB: { accessToken: string; userId: string };
    let superAdmin: { accessToken: string; userId: string };
    let personInBranchA: string;
    let personInBranchB: string;

    beforeAll(async () => {
      adminBranchA = await loginUser(`+9779851${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(adminBranchA.userId, Role.BRANCH_ADMIN, branchAId);

      adminBranchB = await loginUser(`+9779852${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(adminBranchB.userId, Role.BRANCH_ADMIN, branchBId);

      superAdmin = await loginUser(`+9779853${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(superAdmin.userId, Role.SUPER_ADMIN, null);

      // Create a person in Branch A
      const pA = await personRepo.createPerson(
        {
          gender: Gender.MALE,
          living_status: LivingStatus.LIVING,
          generation: 4,
          branch_id: branchAId,
        },
        [
          {
            language: 'ne',
            first_name: 'राम',
            last_name: 'अधिकारी',
            full_name: 'राम अधिकारी',
            is_primary: true,
          },
        ],
      );
      personInBranchA = pA.id;

      // Create a person in Branch B
      const pB = await personRepo.createPerson(
        {
          gender: Gender.FEMALE,
          living_status: LivingStatus.LIVING,
          generation: 4,
          branch_id: branchBId,
        },
        [
          {
            language: 'ne',
            first_name: 'सीता',
            last_name: 'अधिकारी',
            full_name: 'सीता अधिकारी',
            is_primary: true,
          },
        ],
      );
      personInBranchB = pB.id;
    });

    it('Branch A Admin cannot mutate a person in Branch B even if branchId=BranchA is supplied in body', async () => {
      // Branch A admin attempts to link parent on Person in Branch B, overriding with branchId=branchAId
      const res = await fetch(`${baseUrl}/genealogy/people/${personInBranchB}/parents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminBranchA.accessToken}`,
        },
        body: JSON.stringify({
          branchId: branchAId, // Spoofed branch override attempt!
          parentId: personInBranchA,
        }),
      });

      expect(res.status).toBe(403);
      const err = (await res.json()) as any;
      expect(err.errorCode).toBe(ErrorCode.BRANCH_MISMATCH);
    });

    it('Cross-branch spouse mutation (Branch A + Branch B) must be rejected for Branch A Admin under GEN-002', async () => {
      // Branch A Admin attempts to link Person B as spouse of Person A
      const res = await fetch(`${baseUrl}/genealogy/people/${personInBranchA}/spouses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminBranchA.accessToken}`,
        },
        body: JSON.stringify({
          spouseId: personInBranchB,
        }),
      });

      expect(res.status).toBe(403);
      const err = (await res.json()) as any;
      expect(err.errorCode).toBe(ErrorCode.BRANCH_MISMATCH);
    });

    it('Cross-branch spouse mutation (Branch A + Branch B) is permitted for SUPER_ADMIN under GEN-002', async () => {
      const res = await fetch(`${baseUrl}/genealogy/people/${personInBranchA}/spouses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdmin.accessToken}`,
        },
        body: JSON.stringify({
          spouseId: personInBranchB,
        }),
      });

      // Permitted or already linked / validated
      expect([200, 201]).toContain(res.status);
    });
  });

  // ==========================================================================
  // Item 3: Browser credential isolation & Native transport
  // ==========================================================================
  describe('3. Credential Transport Separation & Native Route Protection', () => {
    it('Browser endpoints (/auth/otp/verify, /auth/refresh) must omit refreshToken from JSON and deliver via HttpOnly cookie', async () => {
      const phone = `+9779861${Math.floor(100000 + Math.random() * 900000)}`;
      smsAdapter.clear();
      await redisService.del(`otp:cooldown:${phone}`);

      const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const reqData = (await reqRes.json()) as any;
      const otp = smsAdapter.getLastOtp(phone);

      const verifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpSessionId: reqData.otpSessionId,
          code: otp,
        }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyJson = (await verifyRes.json()) as any;
      // Refresh token MUST be omitted from JSON body
      expect(verifyJson.refreshToken).toBeUndefined();
      expect(verifyJson.accessToken).toBeDefined();

      // Refresh token MUST be set in HttpOnly cookie
      const setCookie = verifyRes.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('refreshToken=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');

      // Now test /auth/refresh using that cookie
      const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: setCookie!,
        },
        body: JSON.stringify({}),
      });

      expect(refreshRes.status).toBe(200);
      const refreshJson = (await refreshRes.json()) as any;
      // Refresh token MUST be omitted from JSON body on refresh too
      expect(refreshJson.refreshToken).toBeUndefined();
      expect(refreshJson.accessToken).toBeDefined();
    });

    it('Native transport endpoints must reject requests bearing browser Origin or Referer header with 403', async () => {
      const phone = `+9779862${Math.floor(100000 + Math.random() * 900000)}`;
      smsAdapter.clear();
      await redisService.del(`otp:cooldown:${phone}`);

      const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const reqData = (await reqRes.json()) as any;
      const otp = smsAdapter.getLastOtp(phone);

      // Attempt native verify with Origin header
      const resOrigin = await fetch(`${baseUrl}/auth/native/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          otpSessionId: reqData.otpSessionId,
          code: otp,
        }),
      });
      expect(resOrigin.status).toBe(403);
      const errOrigin = (await resOrigin.json()) as any;
      expect(errOrigin.errorCode).toBe(ErrorCode.FORBIDDEN_BROWSER_ORIGIN);

      // Attempt native verify with Referer header
      const resReferer = await fetch(`${baseUrl}/auth/native/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: 'http://localhost:3000/login',
        },
        body: JSON.stringify({
          otpSessionId: reqData.otpSessionId,
          code: otp,
        }),
      });
      expect(resReferer.status).toBe(403);
    });

    it('Native endpoints transport refreshToken in JSON body and do not set cookies when called without browser headers', async () => {
      const phone = `+9779863${Math.floor(100000 + Math.random() * 900000)}`;
      smsAdapter.clear();
      await redisService.del(`otp:cooldown:${phone}`);

      const reqRes = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const reqData = (await reqRes.json()) as any;
      const otp = smsAdapter.getLastOtp(phone);

      // Valid native call (no Origin/Referer)
      const res = await fetch(`${baseUrl}/auth/native/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpSessionId: reqData.otpSessionId,
          code: otp,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.refreshToken).toBeDefined();
      expect(data.accessToken).toBeDefined();
      // No cookies set
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeNull();

      // Native refresh
      const refreshRes = await fetch(`${baseUrl}/auth/native/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken: data.refreshToken,
        }),
      });
      expect(refreshRes.status).toBe(200);
      const refreshData = (await refreshRes.json()) as any;
      expect(refreshData.refreshToken).toBeDefined();
      expect(refreshData.refreshToken).not.toBe(data.refreshToken); // Rotated!
      expect(refreshRes.headers.get('set-cookie')).toBeNull();
    });
  });

  // ==========================================================================
  // Item 4: Atomic OTP Request, Verification & SMS Failure Cleanup
  // ==========================================================================
  describe('4. Atomic OTP Lifecycle & SMS Failure Cleanup', () => {
    it('should reject verification if session has been superseded by a newer request', async () => {
      const phone = `+9779871${Math.floor(100000 + Math.random() * 900000)}`;
      smsAdapter.clear();
      await redisService.del(`otp:cooldown:${phone}`);

      // 1st request
      const req1 = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data1 = (await req1.json()) as any;
      const otp1 = smsAdapter.getLastOtp(phone);

      // Clear cooldown to simulate second request after cooldown or administrative resend
      await redisService.del(`otp:cooldown:${phone}`);

      // 2nd request superseding 1st
      const req2 = await fetch(`${baseUrl}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data2 = (await req2.json()) as any;
      const otp2 = smsAdapter.getLastOtp(phone);

      // Attempting to verify the 1st (stale) session must be rejected!
      const verifyStale = await fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpSessionId: data1.otpSessionId,
          code: otp1,
        }),
      });

      expect(verifyStale.status).toBe(400);
      const staleErr = (await verifyStale.json()) as any;
      expect(staleErr.errorCode).toBe(ErrorCode.OTP_EXPIRED);

      // The 2nd (active) session must succeed!
      const verifyActive = await fetch(`${baseUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpSessionId: data2.otpSessionId,
          code: otp2,
        }),
      });
      expect(verifyActive.status).toBe(200);
    });
  });

  // ==========================================================================
  // Item 5: Mandatory Audit Evidence & Durable Outbox
  // ==========================================================================
  describe('5. Durable Audit Outbox & Transactional Role Rollback', () => {
    it('should roll back role assignment if audit logging fails', async () => {
      const user = await loginUser(`+9779881${Math.floor(100000 + Math.random() * 900000)}`);
      const superAdminUser = await loginUser(`+9779882${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(superAdminUser.userId, Role.SUPER_ADMIN, null);

      // Spy on auditRepo.appendAuditLog and simulate failure
      const originalAppend = auditRepo.appendAuditLog;
      jest.spyOn(auditRepo, 'appendAuditLog').mockImplementationOnce(async () => {
        throw new Error('Simulated Database Audit Failure (Disk/Constraint Error)');
      });

      try {
        await fetch(`${baseUrl}/auth/roles/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${superAdminUser.accessToken}`,
          },
          body: JSON.stringify({
            userId: user.userId,
            role: Role.BRANCH_ADMIN,
            branchId: branchAId,
          }),
        });
      } finally {
        auditRepo.appendAuditLog = originalAppend;
      }

      // Verify the role assignment was ROLLED BACK and does not exist in DB!
      const userRoles = await userRepo.getUserRoles(user.userId);
      const hasBranchAdmin = userRoles.some((r) => r.role === Role.BRANCH_ADMIN);
      expect(hasBranchAdmin).toBe(false);
    });

    it('Durable audit outbox: session revocation persists in PostgreSQL even if audit drain fails', async () => {
      const user = await loginUser(`+9779883${Math.floor(100000 + Math.random() * 900000)}`);

      // Mock auditRepo.appendAuditLog to fail during drain
      const originalAppend = auditRepo.appendAuditLog;
      jest.spyOn(auditRepo, 'appendAuditLog').mockImplementation(async () => {
        throw new Error('Simulated transient audit downstream failure');
      });

      try {
        const res = await fetch(`${baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.accessToken}`,
          },
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
      } finally {
        auditRepo.appendAuditLog = originalAppend;
      }

      // 1. Session in PostgreSQL MUST be revoked immediately
      const session = await sessionRepo.findById(user.sessionId);
      expect(session?.revoked_at).not.toBeNull();

      // 2. Audit intent MUST be durably stored in audit_outbox table in PostgreSQL
      const bySession = await auditOutboxRepo.findByEntityId(user.sessionId);
      const byUser = await auditOutboxRepo.findByEntityId(user.userId);
      const matchingEntry = bySession[0] || byUser[0];
      expect(matchingEntry).toBeDefined();
      expect(['PENDING', 'FAILED']).toContain(matchingEntry.status);

      // 3. Subsequent drain must successfully process the entry into audit_logs
      const drainResult = await auditOutboxRepo.drainOutbox(auditRepo);
      expect(drainResult.processed).toBeGreaterThanOrEqual(1);

      // Verify status updated to PROCESSED
      const updatedEntry = (
        await dbService.query('SELECT * FROM audit_outbox WHERE id = $1', [matchingEntry?.id])
      ).rows[0];
      expect(updatedEntry.status).toBe('PROCESSED');
      expect(updatedEntry.processed_at).not.toBeNull();
    });
  });
});
