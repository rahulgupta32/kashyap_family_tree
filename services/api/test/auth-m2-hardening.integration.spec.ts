import { decryptSecret, totp } from '../src/modules/auth/mfa.crypto';
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
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

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
  let isoDb: DisposableDatabase;

  const testRunId = Math.floor(100000 + Math.random() * 900000).toString();
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD must be supplied by the isolated integration-test environment');
    isoDb = await createDisposableDatabase('auth_m2_hard');
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    process.env.NODE_ENV = 'test';
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_NAME = isoDb.dbName;
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
    if (isoDb) {
      await isoDb.drop();
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

  describe('Authenticator session enforcement', () => {
    const call = (token: string, path: string, body?: any) => fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    async function pendingSecret(userId: string) {
      const row = (await dbService.query('SELECT pending_ciphertext FROM account_authenticators WHERE user_id=$1', [userId])).rows[0];
      return decryptSecret(row.pending_ciphertext, userId);
    }

    it('confirms encrypted enrollment, revokes other sessions, consumes recovery codes once and preserves verified refresh', async () => {
      const phone = `+9779861${Math.floor(100000 + Math.random() * 900000)}`;
      const user = await loginUser(phone); await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      const other = await loginUser(phone);
      const enrollment = await call(user.accessToken, '/auth/mfa/enroll', {});
      expect(enrollment.status).toBe(201); expect(enrollment.headers.get('cache-control')).toBe('no-store');
      const setup = await enrollment.json() as any; expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      const secret = await pendingSecret(user.userId); const code = totp(secret, Math.floor(Date.now() / 30000));
      const confirmed = await call(user.accessToken, '/auth/mfa/confirm', { code }); expect(confirmed.status).toBe(201);
      const result = await confirmed.json() as any; expect(result.recoveryCodes).toHaveLength(10);
      expect((await sessionRepo.findById(other.sessionId))!.revoked_at).not.toBeNull();
      expect((await call(user.accessToken, '/audit/dashboard')).status).toBe(200);
      const evidence = (await dbService.query('SELECT new_value FROM audit_logs WHERE entity_type=$1 AND entity_id=$2', ['account_authenticator', user.userId])).rows;
      expect(JSON.stringify(evidence)).not.toContain(setup.secret); expect(JSON.stringify(evidence)).not.toContain(result.recoveryCodes[0]);
      const factor = (await dbService.query('SELECT * FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0];
      expect(factor.pending_ciphertext).toBeNull(); expect(factor.recovery_hashes).not.toContain(result.recoveryCodes[0]);
      const next = await loginUser(phone);
      expect((await call(next.accessToken, '/audit/dashboard')).status).toBe(403);
      expect((await call(next.accessToken, '/auth/mfa/verify', { code })).status).toBe(403);
      expect((await call(next.accessToken, '/auth/mfa/recover', { code: result.recoveryCodes[0] })).status).toBe(201);
      expect((await call(next.accessToken, '/audit/dashboard')).status).toBe(200);
      const a = await loginUser(phone), b = await loginUser(phone);
      const outcomes = await Promise.all([a, b].map(item => call(item.accessToken, '/auth/mfa/recover', { code: result.recoveryCodes[1] })));
      expect(outcomes.map(response => response.status).sort()).toEqual([201, 403]);
      const winner = outcomes[0].status === 201 ? a : b;
      const before = (await sessionRepo.findById(winner.sessionId))!;
      const refresh = await fetch(`${baseUrl}/auth/native/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: winner.refreshToken }) });
      expect(refresh.status).toBe(200); const refreshed = await refresh.json() as any;
      const sid = (jwtService.decode(refreshed.accessToken) as any).sid;
      const after = (await sessionRepo.findById(sid))!; expect(after.mfa_verified_at).toEqual(before.mfa_verified_at); expect(after.mfa_generation).toBe(before.mfa_generation);
      expect((await call(refreshed.accessToken, '/audit/dashboard')).status).toBe(200);
      await dbService.query('UPDATE account_authenticators SET generation=generation+1 WHERE user_id=$1', [user.userId]);
      expect((await call(refreshed.accessToken, '/audit/dashboard')).status).toBe(403);
    });

    it('commits account-wide failed attempts, binds pending enrollment to its session and rolls back audit failure', async () => {
      const phone = `+9779862${Math.floor(100000 + Math.random() * 900000)}`;
      const user = await loginUser(phone); await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      expect((await call(user.accessToken, '/auth/mfa/enroll', { userId: user.userId })).status).toBe(400);
      expect((await call(user.accessToken, '/auth/mfa/enroll', {})).status).toBe(201);
      const secret = await pendingSecret(user.userId); const counter = Math.floor(Date.now() / 30000);
      const valid = totp(secret, counter); const window = [counter - 1, counter, counter + 1].map(c => totp(secret, c));
      let bad = '000000'; while (window.includes(bad)) bad = (Number(bad) + 1).toString().padStart(6, '0');
      const other = await loginUser(phone);
      expect((await call(other.accessToken, '/auth/mfa/confirm', { code: valid })).status).toBe(409);
      for (let n = 0; n < 5; n++) expect((await call(user.accessToken, '/auth/mfa/confirm', { code: bad })).status).toBe(403);
      expect((await call(user.accessToken, '/auth/mfa/confirm', { code: valid })).status).toBe(403);
      const locked = (await dbService.query('SELECT failed_attempts,locked_until FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0]; expect(locked.failed_attempts).toBe(5); expect(locked.locked_until).not.toBeNull();
      await dbService.query("UPDATE account_authenticators SET locked_until=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE user_id=$1", [user.userId]);
      const auditFailure = jest.spyOn(auditRepo, 'appendAuditLog').mockRejectedValueOnce(new Error('Injected authenticator audit failure'));
      try { expect((await call(user.accessToken, '/auth/mfa/confirm', { code: totp(secret, Math.floor(Date.now() / 30000)) })).status).toBe(500); } finally { auditFailure.mockRestore(); }
      const row = (await dbService.query('SELECT enabled_at FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0]; expect(row.enabled_at).toBeNull();
      expect((await sessionRepo.findById(user.sessionId))!.mfa_verified_at).toBeNull();
      expect((await call(user.accessToken, '/auth/mfa/confirm', { code: totp(secret, Math.floor(Date.now() / 30000)) })).status).toBe(201);
      expect((await call(user.accessToken, '/auth/mfa/enroll', {})).status).toBe(409);
    });

    it('renews recovery codes only with fresh authenticator proof and invalidates prior codes/sessions', async () => {
      const phone = `+9779871${Math.floor(100000 + Math.random() * 900000)}`;
      const user = await loginUser(phone); await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      await call(user.accessToken, '/auth/mfa/enroll', {});
      const secret = await pendingSecret(user.userId);
      const firstCode = totp(secret, Math.floor(Date.now() / 30000));
      const enrolled = await (await call(user.accessToken, '/auth/mfa/confirm', { code: firstCode })).json() as any;
      const pending = await loginUser(phone);
      expect((await call(pending.accessToken, '/auth/mfa/recovery-codes/renew', { code: firstCode })).status).toBe(403);
      expect((await call(user.accessToken, '/auth/mfa/recovery-codes/renew', { code: firstCode })).status).toBe(403);
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30000);
      try {
        const code = totp(secret, Math.floor(Date.now() / 30000));
        expect((await call(user.accessToken, '/auth/mfa/recovery-codes/renew', { code, userId: pending.userId })).status).toBe(400);
        const renewed = await call(user.accessToken, '/auth/mfa/recovery-codes/renew', { code });
        expect(renewed.status).toBe(201); expect(renewed.headers.get('cache-control')).toBe('no-store');
        const codes = (await renewed.json() as any).recoveryCodes;
        expect(codes).toHaveLength(10); expect(codes).not.toContain(enrolled.recoveryCodes[0]);
        expect((await sessionRepo.findById(pending.sessionId))!.revoked_at).not.toBeNull();
        expect((await call(user.accessToken, '/audit/dashboard')).status).toBe(200);
        const next = await loginUser(phone);
        expect((await call(next.accessToken, '/auth/mfa/recover', { code: enrolled.recoveryCodes[0] })).status).toBe(403);
        expect((await call(next.accessToken, '/auth/mfa/recover', { code: codes[0] })).status).toBe(201);
        const evidence = (await dbService.query('SELECT new_value FROM audit_logs WHERE entity_type=$1 AND entity_id=$2', ['account_authenticator', user.userId])).rows;
        expect(JSON.stringify(evidence)).not.toContain(codes[0]);
      } finally { clock.mockRestore(); }
    });

    it('replaces an authenticator atomically with session-bound setup and audit rollback', async () => {
      const phone = `+9779872${Math.floor(100000 + Math.random() * 900000)}`;
      const user = await loginUser(phone); await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      await call(user.accessToken, '/auth/mfa/enroll', {});
      const oldSecret = await pendingSecret(user.userId);
      const enrolled = await (await call(user.accessToken, '/auth/mfa/confirm', { code: totp(oldSecret, Math.floor(Date.now() / 30000)) })).json() as any;
      const other = await loginUser(phone);
      await call(other.accessToken, '/auth/mfa/recover', { code: enrolled.recoveryCodes[0] });
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30000);
      try {
        const oldCode = totp(oldSecret, Math.floor(Date.now() / 30000));
        const failing = jest.spyOn(auditRepo, 'appendAuditLog').mockRejectedValueOnce(new Error('Fictional lifecycle audit outage'));
        try { expect((await call(user.accessToken, '/auth/mfa/replace/start', { code: oldCode })).status).toBe(500); } finally { failing.mockRestore(); }
        const started = await call(user.accessToken, '/auth/mfa/replace/start', { code: oldCode }); expect(started.status).toBe(201);
        const setup = await started.json() as any;
        const nextSecret = await pendingSecret(user.userId);
        const newCode = totp(nextSecret, Math.floor(Date.now() / 30000));
        expect((await call(other.accessToken, '/auth/mfa/replace/confirm', { code: newCode })).status).toBe(409);
        const before = (await dbService.query('SELECT * FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0];
        const failure = jest.spyOn(auditRepo, 'appendAuditLog').mockRejectedValueOnce(new Error('Fictional replacement audit outage'));
        try { expect((await call(user.accessToken, '/auth/mfa/replace/confirm', { code: newCode })).status).toBe(500); } finally { failure.mockRestore(); }
        const rolledBack = (await dbService.query('SELECT * FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0];
        expect(rolledBack.secret_ciphertext).toBe(before.secret_ciphertext); expect(rolledBack.generation).toBe(before.generation);
        const contenders = await Promise.all([call(user.accessToken, '/auth/mfa/replace/confirm', { code: newCode }), call(user.accessToken, '/auth/mfa/replace/confirm', { code: newCode })]);
        expect(contenders.map(response => response.status).sort()).toEqual([201, 409]);
        const replaced = contenders.find(response => response.status === 201)!;
        const codes = (await replaced.json() as any).recoveryCodes; expect(codes).toHaveLength(10);
        expect((await sessionRepo.findById(other.sessionId))!.revoked_at).not.toBeNull();
        expect((await call(user.accessToken, '/audit/dashboard')).status).toBe(200);
        const factor = (await dbService.query('SELECT * FROM account_authenticators WHERE user_id=$1', [user.userId])).rows[0];
        expect(decryptSecret(factor.secret_ciphertext, user.userId).equals(nextSecret)).toBe(true); expect(factor.pending_ciphertext).toBeNull();
        expect(factor.generation).toBe(before.generation + 1);
        const evidence = (await dbService.query('SELECT new_value FROM audit_logs WHERE entity_type=$1 AND entity_id=$2', ['account_authenticator', user.userId])).rows;
        expect(JSON.stringify(evidence)).not.toContain(setup.secret); expect(JSON.stringify(evidence)).not.toContain(codes[0]);
      } finally { clock.mockRestore(); }
    });

    it('requires enrollment in production and refuses token-claim forgery or alternate paths', async () => {
      const user = await loginUser(`+9779863${Math.floor(100000 + Math.random() * 900000)}`); await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      const member = await loginUser(`+9779864${Math.floor(100000 + Math.random() * 900000)}`);
      expect(await (await call(member.accessToken, '/auth/mfa/status')).json()).toMatchObject({ eligible: false, required: false });
      expect(await (await call(user.accessToken, '/auth/mfa/status')).json()).toMatchObject({ eligible: true, enrolled: false });
      expect((await call(member.accessToken, '/auth/mfa/enroll', {})).status).toBe(403);
      const previous = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect((await call(user.accessToken, '/audit/dashboard')).status).toBe(403);
        expect((await call(user.accessToken, '/auth/me')).status).toBe(200);
        const status = await (await call(user.accessToken, '/auth/mfa/status')).json() as any; expect(status.required).toBe(true); expect(status.verified).toBe(false);
        const forged = jwtService.sign({ sub: user.userId, sid: user.sessionId, tokenType: 'access', roles: [Role.SUPER_ADMIN], branchIds: [], mfaVerified: true }, { secret: getJwtSecret(), algorithm: JWT_ALGORITHM });
        expect((await call(forged, '/audit/dashboard')).status).toBe(403);
        expect((await call(user.accessToken, '/auth/roles/assign', { userId: member.userId, role: Role.SUPER_ADMIN })).status).toBe(403);
      } finally { process.env.NODE_ENV = previous; }
    });
  });

  describe('Privileged absolute session age', () => {
    const me = (token: string) => fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const refresh = (token: string) => fetch(`${baseUrl}/auth/native/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }),
    });

    it('preserves original authentication across rotations and expires privileged bearer and refresh sessions', async () => {
      const user = await loginUser(`+9779851${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(user.userId, Role.SUPER_ADMIN);
      await dbService.query("UPDATE user_sessions SET authenticated_at = CURRENT_TIMESTAMP - INTERVAL '30 minutes' WHERE id = $1", [user.sessionId]);
      const original = (await sessionRepo.findById(user.sessionId))!.authenticated_at;
      expect((await me(user.accessToken)).status).toBe(200);
      const rotated = await refresh(user.refreshToken);
      expect(rotated.status).toBe(200);
      const data = await rotated.json() as any;
      const sid = (jwtService.decode(data.accessToken) as any).sid;
      expect((await sessionRepo.findById(sid))!.authenticated_at).toEqual(original);
      expect((await me(user.accessToken)).status).toBe(401);
      await dbService.query("UPDATE user_sessions SET authenticated_at = CURRENT_TIMESTAMP - INTERVAL '61 minutes' WHERE id = $1", [sid]);
      const countBefore = await dbService.query('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = $1', [user.userId]);
      expect((await refresh(data.refreshToken)).status).toBe(401);
      const countAfter = await dbService.query('SELECT COUNT(*) AS n FROM user_sessions WHERE user_id = $1', [user.userId]);
      expect(countAfter.rows[0].n).toBe(countBefore.rows[0].n);
      expect((await sessionRepo.findById(sid))!.revoked_at).not.toBeNull();
      expect((await me(data.accessToken)).status).toBe(401);

      const fresh = await loginUser(`+9779852${Math.floor(100000 + Math.random() * 900000)}`);
      await userRepo.assignRole(fresh.userId, Role.BRANCH_ADMIN, branchAId);
      await dbService.query("UPDATE user_sessions SET authenticated_at = CURRENT_TIMESTAMP - INTERVAL '61 minutes' WHERE id = $1", [fresh.sessionId]);
      expect((await me(fresh.accessToken)).status).toBe(401);
      expect((await sessionRepo.findById(fresh.sessionId))!.revoked_at).not.toBeNull();
    });

    it('requires fresh login for unknown legacy age or later elevation while ordinary refresh remains usable', async () => {
      const phone = `+9779853${Math.floor(100000 + Math.random() * 900000)}`;
      const member = await loginUser(phone);
      await dbService.query('UPDATE user_sessions SET authenticated_at = NULL WHERE id = $1', [member.sessionId]);
      expect((await me(member.accessToken)).status).toBe(200);
      const rotated = await refresh(member.refreshToken);
      expect(rotated.status).toBe(200);
      const data = await rotated.json() as any;
      const sid = (jwtService.decode(data.accessToken) as any).sid;
      expect((await sessionRepo.findById(sid))!.authenticated_at).toBeNull();
      await userRepo.assignRole(member.userId, Role.COMMUNITY_MODERATOR, branchAId);
      expect((await refresh(data.refreshToken)).status).toBe(401);
      const fresh = await loginUser(phone);
      expect((await sessionRepo.findById(fresh.sessionId))!.authenticated_at).not.toBeNull();
      expect((await me(fresh.accessToken)).status).toBe(200);
      await dbService.query('UPDATE user_sessions SET authenticated_at = NULL WHERE id = $1', [fresh.sessionId]);
      expect((await me(fresh.accessToken)).status).toBe(401);
    });
  });

  describe('Durable redacted OTP attempt/outcome evidence',()=>{
    const post=(path:string,body:any)=>fetch(`${baseUrl}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const freshPhone=()=>`+9779870${Math.floor(100000+Math.random()*900000)}`;
    it('retains request acceptance, cooldown, invalid, exhausted and expired outcomes without challenge credentials',async()=>{
      const phone=freshPhone(),start=new Date();
      const request=await post('/auth/otp/request',{phoneNumber:phone});expect(request.status).toBe(200);
      const challenge:any=await request.json(),code=smsAdapter.getLastOtp(phone)!;
      expect((await post('/auth/otp/request',{phoneNumber:phone})).status).toBe(400);
      for(let i=0;i<5;i++)expect((await post('/auth/otp/verify',{otpSessionId:challenge.otpSessionId,code:'000000'})).status).toBe(400);
      expect((await post('/auth/otp/verify',{otpSessionId:challenge.otpSessionId,code})).status).toBe(400);
      const rows=(await dbService.query("SELECT action,entity_id,actor_id,new_value FROM audit_outbox WHERE entity_type='authentication_attempts' AND created_at>=$1",[start])).rows;
      const attempts=rows.filter(r=>r.action.endsWith('_ATTEMPT')),outcomes=rows.filter(r=>r.action.endsWith('_OUTCOME'));
      expect(attempts).toHaveLength(8);expect(outcomes).toHaveLength(8);
      for(const row of attempts){expect(row.actor_id).toBeNull();expect(outcomes.filter(o=>o.entity_id===row.entity_id)).toHaveLength(1);}
      const reasons=outcomes.map(r=>r.new_value.reasonCode);
      expect(reasons).toContain('SMS_ACCEPTED');expect(reasons).toContain(ErrorCode.OTP_RESEND_COOLDOWN);expect(reasons.filter(r=>r===ErrorCode.INVALID_OTP)).toHaveLength(4);expect(reasons).toContain(ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED);expect(reasons).toContain(ErrorCode.OTP_EXPIRED);
      const evidence=JSON.stringify(rows);for(const secret of [phone,challenge.otpSessionId,code,'000000'])expect(evidence).not.toContain(secret);
    });
    it('refuses request and verification side effects when initial audit intent insertion fails',async()=>{
      const phone=freshPhone(),send=jest.spyOn(smsAdapter,'sendOtp'),record=auditOutboxRepo.recordAuditIntent.bind(auditOutboxRepo);
      const unavailable=jest.spyOn(auditOutboxRepo,'recordAuditIntent').mockImplementationOnce(async()=>{throw new Error('Private fictional evidence failure');});
      try{const response=await post('/auth/otp/request',{phoneNumber:phone});expect(response.status).toBe(503);expect(send).not.toHaveBeenCalled();expect(await redisService.get(`otp:challenge:${phone}`)).toBeNull();expect(JSON.stringify(await response.json())).not.toContain('Private fictional');}finally{unavailable.mockRestore();send.mockRestore();}
      const requested=await post('/auth/otp/request',{phoneNumber:phone}),challenge:any=await requested.json();
      const blocked=jest.spyOn(auditOutboxRepo,'recordAuditIntent').mockImplementation(async(data,tx)=>{if(data.action==='OTP_VERIFY_ATTEMPT')throw new Error('Private fictional evidence failure');return record(data,tx);});
      try{const response=await post('/auth/otp/verify',{otpSessionId:challenge.otpSessionId,code:'000000'});expect(response.status).toBe(503);expect(response.headers.get('set-cookie')).toBeNull();expect(JSON.parse((await redisService.get(`otp:challenge:${phone}`))!).attempts).toBe(0);}finally{blocked.mockRestore();}
    });
    it('keeps actual accepted-outcome evidence after a lost acknowledgement without returning challenge credentials',async()=>{
      const phone=freshPhone(),start=new Date(),record=auditOutboxRepo.recordAuditIntent.bind(auditOutboxRepo);
      const uncertain=jest.spyOn(auditOutboxRepo,'recordAuditIntent').mockImplementation(async(data,tx)=>{const result=await record(data,tx);if(data.action==='OTP_REQUEST_OUTCOME')throw new Error('Private lost acknowledgement');return result;});
      try{const response=await post('/auth/otp/request',{phoneNumber:phone});expect(response.status).toBe(503);const body:any=await response.json();expect(body.otpSessionId).toBeUndefined();expect(JSON.stringify(body)).not.toContain('Private lost');}finally{uncertain.mockRestore();}
      const rows=(await dbService.query("SELECT action,new_value FROM audit_outbox WHERE entity_type='authentication_attempts' AND created_at>=$1",[start])).rows;expect(rows).toHaveLength(2);expect(rows.find(r=>r.action==='OTP_REQUEST_OUTCOME').new_value.outcome).toBe('SMS_ACCEPTED');expect(smsAdapter.getLastOtp(phone)).toBeTruthy();
    });
    it('retains an unresolved verification attempt when rejected-outcome persistence is unavailable',async()=>{
      const phone=freshPhone(),requested=await post('/auth/otp/request',{phoneNumber:phone}),challenge:any=await requested.json();
      const record=auditOutboxRepo.recordAuditIntent.bind(auditOutboxRepo),baseline=(await auditOutboxRepo.getDeliverySummary()).unresolvedOtpAttempts;
      const unavailable=jest.spyOn(auditOutboxRepo,'recordAuditIntent').mockImplementation(async(data,tx)=>{if(data.action==='OTP_VERIFY_OUTCOME')throw new Error('Private fictional outcome outage');return record(data,tx);});
      try{const response=await post('/auth/native/verify',{otpSessionId:challenge.otpSessionId,code:'000000'});expect(response.status).toBe(503);const body:any=await response.json();expect(body.accessToken).toBeUndefined();expect(body.refreshToken).toBeUndefined();expect(JSON.stringify(body)).not.toContain('Private fictional');}finally{unavailable.mockRestore();}
      const attempt=(await dbService.query("SELECT id FROM audit_outbox WHERE action='OTP_VERIFY_ATTEMPT' ORDER BY created_at DESC LIMIT 1")).rows[0];
      await dbService.query("UPDATE audit_outbox SET created_at=CURRENT_TIMESTAMP-INTERVAL '11 minutes' WHERE id=$1",[attempt.id]);
      expect((await auditOutboxRepo.getDeliverySummary()).unresolvedOtpAttempts).toBe(baseline+1);
    });
    it('cleans actual Redis reservation after a thrown SMS-provider failure',async()=>{
      const phone=freshPhone(),start=new Date(),send=jest.spyOn(smsAdapter,'sendOtp').mockRejectedValueOnce(new Error(`Secret provider credential ${phone}`));
      try{const response=await post('/auth/otp/request',{phoneNumber:phone});expect(response.status).toBe(503);expect((await response.json() as any).errorCode).toBe(ErrorCode.EXTERNAL_PROVIDER_ERROR);expect(await redisService.get(`otp:challenge:${phone}`)).toBeNull();expect(await redisService.get(`otp:active_session:${phone}`)).toBeNull();}finally{send.mockRestore();}
      const row=(await dbService.query("SELECT new_value FROM audit_outbox WHERE action='OTP_REQUEST_OUTCOME' AND created_at>=$1",[start])).rows[0];expect(row.new_value.reasonCode).toBe(ErrorCode.EXTERNAL_PROVIDER_ERROR);expect(JSON.stringify(row)).not.toContain(phone);
    });
    it('records IP-rate rejection and repairs a pre-existing counter without an expiry atomically',async()=>{
      const environment=process.env.NODE_ENV,phone=freshPhone(),start=new Date(),send=jest.spyOn(smsAdapter,'sendOtp');
      process.env.NODE_ENV='development';
      const ipKey='otp:ratelimit:ip:::ffff:127.0.0.1';await redisService.set(ipKey,'15');
      // Fetch may use IPv4 or mapped IPv4 depending on the listener.
      await redisService.set('otp:ratelimit:ip:127.0.0.1','15');
      try{const response=await post('/auth/otp/request',{phoneNumber:phone});expect(response.status).toBe(400);expect((await response.json() as any).errorCode).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);expect(send).not.toHaveBeenCalled();
        const keys=[ipKey,'otp:ratelimit:ip:127.0.0.1'];const used=(await Promise.all(keys.map(async key=>({value:await redisService.get(key),ttl:await redisService.ttl(key)})))).find(r=>r.value==='16');expect(used).toBeDefined();expect(used!.ttl).toBeGreaterThan(0);expect(used!.ttl).toBeLessThanOrEqual(600);
      }finally{process.env.NODE_ENV=environment;send.mockRestore();}
      const row=(await dbService.query("SELECT new_value FROM audit_outbox WHERE action='OTP_REQUEST_OUTCOME' AND created_at>=$1",[start])).rows[0];expect(row.new_value.reasonCode).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    });
    it('restricts aggregate delivery status to current central authority with MFA and suppresses private database errors',async()=>{
      expect((await fetch(`${baseUrl}/audit/delivery`)).status).toBe(401);
      const user=await loginUser(freshPhone());
      const call=()=>fetch(`${baseUrl}/audit/delivery`,{headers:{Authorization:`Bearer ${user.accessToken}`}});
      expect((await call()).status).toBe(403);await userRepo.assignRole(user.userId,Role.CENTRAL_ADMIN);expect((await call()).status).toBe(403);
      const enrollment=await fetch(`${baseUrl}/auth/mfa/enroll`,{method:'POST',headers:{Authorization:`Bearer ${user.accessToken}`,'Content-Type':'application/json'},body:'{}'});expect(enrollment.status).toBe(201);const setup:any=await enrollment.json();
      const confirmed=await fetch(`${baseUrl}/auth/mfa/confirm`,{method:'POST',headers:{Authorization:`Bearer ${user.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({code:totp(setup.secret,Math.floor(Date.now()/30000))})});expect(confirmed.status).toBe(201);
      const response=await call();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const data:any=await response.json();expect(data.worker.scope).toBe('THIS_API_PROCESS');expect(data.worker.lifecycle).toBe('TEST_DISABLED');expect(data.backlog.pending).toBeGreaterThan(0);expect(data.backlog.unresolvedOtpAttempts).toBeGreaterThan(0);
      for(const key of ['entity_id','actor_id','ip_address','user_agent','new_value','last_error'])expect(JSON.stringify(data)).not.toContain(key);
      const failing=jest.spyOn(auditOutboxRepo,'getDeliverySummary').mockRejectedValueOnce(new Error('Private connection string'));
      try{const failed=await call();expect(failed.status).toBe(503);expect(JSON.stringify(await failed.json())).not.toContain('Private connection');}finally{failing.mockRestore();}
      await userRepo.revokeRole(user.userId,Role.CENTRAL_ADMIN);expect((await call()).status).toBe(403);
    });
  });

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
      expect(setCookie).toMatch(/SameSite=(Strict|Lax)/i);

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
    it('commits login sessions with redacted durable audit and delivers exactly once after an audit outage',async()=>{
      const phone=`+9779880${Math.floor(100000+Math.random()*900000)}`;
      const unavailable=jest.spyOn(auditRepo,'appendAuditLog').mockRejectedValueOnce(new Error('Fictional initial login delivery outage'));
      let user:Awaited<ReturnType<typeof loginUser>>;
      try {user=await loginUser(phone);} finally {unavailable.mockRestore();}
      const entries=await auditOutboxRepo.findByEntityId(user.userId);
      const entry=entries.find(e=>e.action===AuditAction.LOGIN&&e.new_value?.sessionId===user.sessionId);
      expect(entry).toBeDefined();expect(entry!.status).toBe('FAILED');expect(entry!.last_error).toBe('LOGIN_AUDIT_DELIVERY_FAILED');
      const session=await sessionRepo.findById(user.sessionId);expect(session?.revoked_at).toBeNull();
      const metadata=JSON.stringify(entry!.new_value);
      for(const secret of [phone,user.refreshToken,user.accessToken,smsAdapter.getLastOtp(phone)!])expect(metadata).not.toContain(secret);
      const failing=jest.spyOn(auditRepo,'appendAuditLog').mockRejectedValueOnce(new Error('Fictional login audit delivery outage'));
      try {await expect(auditOutboxRepo.processOutboxEntry(entry!.id,auditRepo)).rejects.toThrow('Fictional login audit delivery outage');}
      finally {failing.mockRestore();}
      expect((await dbService.query('SELECT status FROM audit_outbox WHERE id=$1',[entry!.id])).rows[0].status).toBe('FAILED');
      expect((await sessionRepo.findById(user.sessionId))?.revoked_at).toBeNull();
      expect(await auditOutboxRepo.processOutboxEntry(entry!.id,auditRepo)).toBe(true);
      expect(await auditOutboxRepo.processOutboxEntry(entry!.id,auditRepo)).toBe(false);
      expect((await dbService.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[entry!.id])).rows).toHaveLength(1);
    });

    it('rolls back login session creation and emits no refresh cookie when audit insertion fails',async()=>{
      const phone=`+9779880${Math.floor(100000+Math.random()*900000)}`;
      const requested=await fetch(`${baseUrl}/auth/otp/request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone})});
      expect(requested.ok).toBe(true);const challenge:any=await requested.json();const otp=smsAdapter.getLastOtp(phone)!;
      const record=auditOutboxRepo.recordAuditIntent.bind(auditOutboxRepo);
      const failing=jest.spyOn(auditOutboxRepo,'recordAuditIntent').mockImplementation(async(data,client)=>{if(data.action===AuditAction.LOGIN)throw new Error('Private fictional audit database failure');return record(data,client);});
      let body:any;
      try {
        const response=await fetch(`${baseUrl}/auth/otp/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otpSessionId:challenge.otpSessionId,code:otp})});
        expect(response.status).toBe(503);expect(response.headers.get('set-cookie')).toBeNull();body=await response.json();
        expect(body.accessToken).toBeUndefined();expect(body.refreshToken).toBeUndefined();expect(JSON.stringify(body)).not.toContain('Private fictional');
      } finally {failing.mockRestore();}
      const account=await userRepo.findByPhone(phone);expect(account).not.toBeNull();
      expect((await dbService.query('SELECT id FROM user_sessions WHERE user_id=$1',[account!.id])).rows).toHaveLength(0);
      expect(await auditOutboxRepo.findByEntityId(account!.id)).toHaveLength(0);
      const replay=await fetch(`${baseUrl}/auth/otp/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otpSessionId:challenge.otpSessionId,code:otp})});expect(replay.status).toBe(400);expect((await replay.json() as any).errorCode).toBe(ErrorCode.OTP_EXPIRED);
      const fresh=await loginUser(phone);expect(fresh.accessToken).toBeTruthy();
    });

    it('returns no credentials after a lost login commit acknowledgement while retaining both committed records',async()=>{
      const phone=`+9779880${Math.floor(100000+Math.random()*900000)}`;
      const requested=await fetch(`${baseUrl}/auth/otp/request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:phone})});
      expect(requested.ok).toBe(true);const challenge:any=await requested.json();const otp=smsAdapter.getLastOtp(phone)!;
      const transact=dbService.transaction.bind(dbService);
      const uncertain=jest.spyOn(dbService,'transaction').mockImplementationOnce(async callback=>{await transact(callback);throw new Error('Fictional lost login commit acknowledgement');});
      try {
        const response=await fetch(`${baseUrl}/auth/otp/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otpSessionId:challenge.otpSessionId,code:otp})});
        expect(response.status).toBe(503);expect(response.headers.get('set-cookie')).toBeNull();
        const body:any=await response.json();expect(body.accessToken).toBeUndefined();expect(body.refreshToken).toBeUndefined();
      } finally {uncertain.mockRestore();}
      const account=await userRepo.findByPhone(phone);expect(account).not.toBeNull();
      const sessions=(await dbService.query('SELECT id FROM user_sessions WHERE user_id=$1',[account!.id])).rows;expect(sessions).toHaveLength(1);
      const intents=await auditOutboxRepo.findByEntityId(account!.id);expect(intents).toHaveLength(1);expect(intents[0].new_value.sessionId).toBe(sessions[0].id);
      const replay=await fetch(`${baseUrl}/auth/otp/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otpSessionId:challenge.otpSessionId,code:otp})});expect(replay.status).toBe(400);
      const fresh=await loginUser(phone);expect(fresh.sessionId).not.toBe(sessions[0].id);
    });

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

      // Clear unrelated due authentication attempts before injecting this logout outage.
      await auditOutboxRepo.drainOutbox(auditRepo);

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
      await dbService.query('UPDATE audit_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1',[matchingEntry!.id]);
      const drainResult = await auditOutboxRepo.drainOutbox(auditRepo);
      expect(drainResult.processed).toBeGreaterThanOrEqual(1);

      // Verify status updated to PROCESSED
      const updatedEntry = (
        await dbService.query('SELECT * FROM audit_outbox WHERE id = $1', [matchingEntry?.id])
      ).rows[0];
      expect(updatedEntry.status).toBe('PROCESSED');
      expect(updatedEntry.processed_at).not.toBeNull();
    });

    it('should roll back session revocation if outbox insertion fails', async () => {
      const user = await loginUser(`+9779884${Math.floor(100000 + Math.random() * 900000)}`);

      // Mock auditOutboxRepo.recordAuditIntent to fail inside transaction
      const originalRecord = auditOutboxRepo.recordAuditIntent;
      jest.spyOn(auditOutboxRepo, 'recordAuditIntent').mockImplementationOnce(async () => {
        throw new Error('Simulated Outbox Disk/Constraint Failure');
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
        expect(res.status).toBe(500);
      } finally {
        auditOutboxRepo.recordAuditIntent = originalRecord;
      }

      // Crucial: Session in PostgreSQL MUST remain active (NOT revoked) because the transaction rolled back
      const session = await sessionRepo.findById(user.sessionId);
      expect(session?.revoked_at).toBeNull();

      // Access token must still be valid and active
      const profileRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(profileRes.status).toBe(200);
    });

    it('should prevent duplicate audit logs on repeated outbox drains (deduplication)', async () => {
      const user = await loginUser(`+9779885${Math.floor(100000 + Math.random() * 900000)}`);

      // Create an outbox record directly
      const outboxRecord = await auditOutboxRepo.recordAuditIntent({
        action: AuditAction.LOGOUT,
        entityType: 'user_sessions',
        entityId: user.sessionId,
        actorId: user.userId,
        actorRole: 'USER',
        newValue: { test: 'dedup_verification' },
      });

      // Drain 1: processes the record
      const drain1 = await auditOutboxRepo.drainOutbox(auditRepo);
      expect(drain1.processed).toBeGreaterThanOrEqual(1);

      // Verify exactly 1 audit log exists for this outboxId
      const logs1 = await dbService.query(
        `SELECT * FROM audit_logs WHERE new_value->>'outboxId' = $1`,
        [outboxRecord.id],
      );
      expect(logs1.rows.length).toBe(1);

      // Reset outbox record to PENDING to simulate retry after restart
      await dbService.query(`UPDATE audit_outbox SET status = 'PENDING' WHERE id = $1`, [outboxRecord.id]);

      // Drain 2: retry should NOT create a duplicate audit log
      const drain2 = await auditOutboxRepo.drainOutbox(auditRepo);
      expect(drain2.processed).toBeGreaterThanOrEqual(1);

      const logs2 = await dbService.query(
        `SELECT * FROM audit_logs WHERE new_value->>'outboxId' = $1`,
        [outboxRecord.id],
      );
      expect(logs2.rows.length).toBe(1); // STILL exactly 1, no duplicate created!
    });

    it('should safely coordinate deliberately overlapping drain transactions on the same pending event, asserting exactly one audit record and processed status', async () => {
      const user = await loginUser(`+9779885${Math.floor(100000 + Math.random() * 900000)}`);

      // 1. Create a single pending outbox record
      const outboxRecord = await auditOutboxRepo.recordAuditIntent({
        action: AuditAction.LOGOUT,
        entityType: 'user_sessions',
        entityId: `session_overlap_${Date.now()}`,
        actorId: user.userId,
        actorRole: 'USER',
        newValue: { test: 'deliberate_overlap_test' },
      });

      // 2. Worker 1 acquires dedicated database client and locks the row with SELECT ... FOR UPDATE
      const client1 = await dbService.getClient();
      await client1.query('BEGIN');
      const lockRes = await client1.query(
        `SELECT * FROM audit_outbox WHERE id = $1 FOR UPDATE;`,
        [outboxRecord.id],
      );
      expect(lockRes.rows.length).toBe(1);
      expect(lockRes.rows[0].status).toBe('PENDING');

      // 3. Worker 2 starts processing the same pending entry concurrently
      // Because Worker 1 holds the row lock, Worker 2 will block in PostgreSQL on SELECT ... FOR UPDATE
      const worker2Promise = auditOutboxRepo.processOutboxEntry(outboxRecord.id, auditRepo);

      // Brief delay to ensure Worker 2 is waiting on the row lock
      await new Promise((resolve) => setTimeout(resolve, 80));

      // 4. Worker 1 completes the processing: appends audit log, marks processed, and commits
      await auditRepo.appendAuditLog(
        lockRes.rows[0].action as AuditAction,
        lockRes.rows[0].entity_type,
        lockRes.rows[0].entity_id,
        lockRes.rows[0].actor_id || undefined,
        lockRes.rows[0].actor_role || undefined,
        lockRes.rows[0].old_value,
        {
          ...(lockRes.rows[0].new_value || {}),
          outboxId: lockRes.rows[0].id,
        },
        undefined,
        undefined,
        client1,
      );
      await auditOutboxRepo.markProcessed(lockRes.rows[0].id, client1);
      await client1.query('COMMIT');
      client1.release();

      // 5. Worker 2 unblocks, rechecks row status (now PROCESSED), and skips duplicate processing
      const worker2Processed = await worker2Promise;
      expect(worker2Processed).toBe(false);

      // 6. Assertions:
      // Exactly ONE audit log record exists for this outbox event
      const logs = await dbService.query(
        `SELECT * FROM audit_logs WHERE new_value->>'outboxId' = $1`,
        [outboxRecord.id],
      );
      expect(logs.rows.length).toBe(1);

      // Outbox row is marked PROCESSED
      const updatedOutbox = await dbService.query(
        `SELECT * FROM audit_outbox WHERE id = $1`,
        [outboxRecord.id],
      );
      expect(updatedOutbox.rows[0].status).toBe('PROCESSED');
      expect(updatedOutbox.rows[0].processed_at).not.toBeNull();
    });

    it('should enforce database-level uniqueness on audit_logs(outboxId) and reject duplicate insert attempts', async () => {
      const user = await loginUser(`+9779885${Math.floor(100000 + Math.random() * 900000)}`);
      const syntheticOutboxId = `outbox-uuid-${Date.now()}`;

      // Insert first audit log with this outboxId
      await auditRepo.appendAuditLog(
        AuditAction.LOGOUT,
        'user_sessions',
        'session-1',
        user.userId,
        'USER',
        null,
        { outboxId: syntheticOutboxId, note: 'first' },
      );

      // Attempting to insert a duplicate audit log with the same outboxId must be rejected by PostgreSQL unique index
      let errorThrown: any = null;
      try {
        await auditRepo.appendAuditLog(
          AuditAction.LOGOUT,
          'user_sessions',
          'session-2',
          user.userId,
          'USER',
          null,
          { outboxId: syntheticOutboxId, note: 'duplicate_attempt' },
        );
      } catch (err: any) {
        errorThrown = err;
      }

      expect(errorThrown).not.toBeNull();
      // Code 23505 is PostgreSQL unique_violation
      expect(errorThrown.code || errorThrown.message).toMatch(/(23505|unique|duplicate)/i);
    });
  });

  // ==========================================================================
  // Item 6: Logout Credential Handling & Conflicting Credentials Regressions
  // ==========================================================================
  describe('6. Logout Credential Conflict Handling & Revocation Guarantees', () => {
    it('should revoke verified bearer session when invalid refresh token accompanies it (never leaves session active)', async () => {
      const user = await loginUser(`+9779886${Math.floor(100000 + Math.random() * 900000)}`);

      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: 'completely_invalid_and_nonexistent_refresh_token' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify the intended session was revoked in PostgreSQL
      const session = await sessionRepo.findById(user.sessionId);
      expect(session?.revoked_at).not.toBeNull();

      // Verify access token is subsequently rejected
      const profileRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      expect(profileRes.status).toBe(401);
    });

    it('should reject logout with 401 when Bearer session and refresh token belong to different users (conflicting credentials)', async () => {
      const userA = await loginUser(`+9779887${Math.floor(100000 + Math.random() * 900000)}`);
      const userB = await loginUser(`+9779888${Math.floor(100000 + Math.random() * 900000)}`);

      // User A attempts to log out presenting User B's refresh token
      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: userB.refreshToken }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.message).toContain('Conflicting credentials');

      // Neither session should be revoked because of conflicting credentials
      const sessionA = await sessionRepo.findById(userA.sessionId);
      const sessionB = await sessionRepo.findById(userB.sessionId);
      expect(sessionA?.revoked_at).toBeNull();
      expect(sessionB?.revoked_at).toBeNull();

      // Both access tokens must remain active
      const profA = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${userA.accessToken}` } });
      const profB = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${userB.accessToken}` } });
      expect(profA.status).toBe(200);
      expect(profB.status).toBe(200);
    });

    it('should revoke both sessions when Bearer session and refresh token belong to the same user (multi-device logout)', async () => {
      const phone = `+9779889${Math.floor(100000 + Math.random() * 900000)}`;
      // Session 1 for user
      const s1 = await loginUser(phone);
      // Session 2 for same user
      const s2 = await loginUser(phone);

      expect(s1.userId).toBe(s2.userId);
      expect(s1.sessionId).not.toBe(s2.sessionId);

      // Present Bearer for Session 1, and refresh token for Session 2
      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s1.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: s2.refreshToken }),
      });

      expect(res.status).toBe(200);

      // Both sessions must be revoked in PostgreSQL
      const session1 = await sessionRepo.findById(s1.sessionId);
      const session2 = await sessionRepo.findById(s2.sessionId);
      expect(session1?.revoked_at).not.toBeNull();
      expect(session2?.revoked_at).not.toBeNull();

      // Both access tokens must be rejected
      const p1 = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${s1.accessToken}` } });
      const p2 = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${s2.accessToken}` } });
      expect(p1.status).toBe(401);
      expect(p2.status).toBe(401);
    });
  });
});
