import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { Role, ErrorCode, AuditAction } from '@kashyap/contracts';
import { BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { JWT_SECRET } from '../src/modules/auth/auth.constants';

describe('AuthService (Milestone 2 Comprehensive Unit & Security Tests)', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let smsProvider: TestSmsProviderAdapter;

  // In-memory mock repositories
  let mockRedisData: Map<string, { value: string; expiresAt?: number }>;
  let mockUsers: Map<string, any>;
  let mockRoles: Map<string, any[]>;
  let mockSessions: Map<string, any>;
  let mockAuditLogs: any[];
  let mockAuditIntents: any[];
  let mockDatabase: any;
  let mockAuditOutboxRepo: any;

  let mockRedisService: any;
  let mockUserRepo: any;
  let mockSessionRepo: any;
  let mockBranchRepo: any;
  let mockAuditRepo: any;

  beforeEach(() => {
    jwtService = new JwtService({ secret: JWT_SECRET });
    smsProvider = new TestSmsProviderAdapter();

    mockRedisData = new Map();
    mockUsers = new Map();
    mockRoles = new Map();
    mockSessions = new Map();
    mockAuditLogs = [];
    mockAuditIntents = [];
    mockDatabase = { transaction: jest.fn(async (callback:any)=>{
      const before=new Map(mockSessions),count=mockAuditIntents.length;
      try {return await callback({});} catch(error){mockSessions.clear();before.forEach((value,key)=>mockSessions.set(key,value));mockAuditIntents.splice(count);throw error;}
    })};
    mockAuditOutboxRepo={recordAuditIntent:jest.fn(async(data:any)=>{mockAuditIntents.push(data);return {id:'fictional-audit-intent'};}),processOutboxEntry:jest.fn().mockResolvedValue(true),markFailed:jest.fn().mockResolvedValue(undefined)};

    mockRedisService = {
      isReady: jest.fn().mockReturnValue(true),
      get: jest.fn(async (key: string) => {
        const item = mockRedisData.get(key);
        if (!item) return null;
        if (item.expiresAt && Date.now() > item.expiresAt) {
          mockRedisData.delete(key);
          return null;
        }
        return item.value;
      }),
      set: jest.fn(async (key: string, value: string, ttlSeconds?: number) => {
        mockRedisData.set(key, {
          value,
          expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
        });
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (mockRedisData.delete(k)) count++;
        }
        return count;
      }),
      incr: jest.fn(async (key: string) => {
        const item = mockRedisData.get(key);
        const current = item ? parseInt(item.value, 10) : 0;
        const next = current + 1;
        mockRedisData.set(key, { value: next.toString(), expiresAt: item?.expiresAt });
        return next;
      }),
      expire: jest.fn(async (key: string, ttlSeconds: number) => {
        const item = mockRedisData.get(key);
        if (item) {
          item.expiresAt = Date.now() + ttlSeconds * 1000;
          return 1;
        }
        return 0;
      }),
      ttl: jest.fn(async (key: string) => {
        const item = mockRedisData.get(key);
        if (!item) return -2;
        if (!item.expiresAt) return -1;
        return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
      }),
      eval: jest.fn(async (script: string, numKeys: number, ...args: any[]) => {
        if (numKeys === 1) {
          const key=args[0],ttl=Number(args[1]),item=mockRedisData.get(key);
          const value=Number(item?.value||0)+1;
          mockRedisData.set(key,{value:String(value),expiresAt:item?.expiresAt||Date.now()+ttl*1000});
          return value;
        }
        if (numKeys === 5) {
          // Atomic OTP reservation script
          const cooldownKey = args[0];
          const rateLimitPhoneKey = args[1];
          const activeSessionKey = args[2];
          const challengeKey = args[3];
          const sessionKey = args[4];
          const otpSessionId = args[5];
          const challengeJson = args[6];
          const expiresInSeconds = Number(args[7]);
          const cooldownSeconds = Number(args[8]);
          const maxPhoneAttempts = Number(args[9]);
          const phone = args[11];

          const inCooldown = mockRedisData.get(cooldownKey);
          if (inCooldown && (!inCooldown.expiresAt || inCooldown.expiresAt > Date.now())) {
            const remaining = Math.max(1, Math.ceil((inCooldown.expiresAt! - Date.now()) / 1000));
            return [-1, remaining.toString()];
          }

          const phoneItem = mockRedisData.get(rateLimitPhoneKey);
          const phoneAttempts = (phoneItem ? parseInt(phoneItem.value, 10) : 0) + 1;
          mockRedisData.set(rateLimitPhoneKey, { value: phoneAttempts.toString(), expiresAt: Date.now() + 600000 });
          if (phoneAttempts > maxPhoneAttempts) {
            return [-2, 'RATE_LIMIT'];
          }

          const priorSession = mockRedisData.get(activeSessionKey);
          if (priorSession) {
            mockRedisData.delete(`otp:session:${priorSession.value}`);
          }

          mockRedisData.set(challengeKey, { value: challengeJson, expiresAt: Date.now() + expiresInSeconds * 1000 });
          mockRedisData.set(sessionKey, { value: phone, expiresAt: Date.now() + expiresInSeconds * 1000 });
          mockRedisData.set(activeSessionKey, { value: otpSessionId, expiresAt: Date.now() + expiresInSeconds * 1000 });
          mockRedisData.set(cooldownKey, { value: '1', expiresAt: Date.now() + cooldownSeconds * 1000 });
          return [1, 'OK'];
        }

        if (numKeys === 4) {
          // SMS cleanup script
          const activeKey = args[0];
          const challengeKey = args[1];
          const sessionKey = args[2];
          const cooldownKey = args[3];
          const failedSessionId = args[4];
          const currentActive = mockRedisData.get(activeKey);
          if (currentActive && currentActive.value === failedSessionId) {
            mockRedisData.delete(challengeKey);
            mockRedisData.delete(sessionKey);
            mockRedisData.delete(activeKey);
            mockRedisData.set(cooldownKey, { value: '1', expiresAt: Date.now() + 5000 });
            return 1;
          } else {
            mockRedisData.delete(sessionKey);
            return 0;
          }
        }

        // 3-key OTP verification script
        const challengeKey = args[0];
        const sessionKey = args[1];
        const activeKey = args[2];
        const suppliedSessionId = args[3];
        const computedHash = args[4];
        const maxAttempts = Number(args[5]);
        const nowMs = Number(args[6]);

        const activeSessionItem = mockRedisData.get(activeKey);
        if (!activeSessionItem || activeSessionItem.value !== suppliedSessionId) {
          return [-4, 'STALE_SESSION'];
        }

        const dataStrItem = mockRedisData.get(challengeKey);
        if (!dataStrItem) {
          return [-1, 'EXPIRED'];
        }
        const c = JSON.parse(dataStrItem.value);
        if (nowMs > c.expiresAt) {
          mockRedisData.delete(challengeKey);
          mockRedisData.delete(sessionKey);
          mockRedisData.delete(activeKey);
          return [-1, 'EXPIRED'];
        }
        if (c.attempts >= maxAttempts) {
          mockRedisData.delete(challengeKey);
          mockRedisData.delete(sessionKey);
          mockRedisData.delete(activeKey);
          return [-2, 'MAX_ATTEMPTS'];
        }
        if (c.codeHash !== computedHash) {
          c.attempts = (c.attempts || 0) + 1;
          mockRedisData.set(challengeKey, { value: JSON.stringify(c), expiresAt: dataStrItem.expiresAt });
          if (c.attempts >= maxAttempts) {
            mockRedisData.delete(challengeKey);
            mockRedisData.delete(sessionKey);
            mockRedisData.delete(activeKey);
            return [-2, 'MAX_ATTEMPTS'];
          }
          return [-3, 'MISMATCH'];
        }
        mockRedisData.delete(challengeKey);
        mockRedisData.delete(sessionKey);
        mockRedisData.delete(activeKey);
        return [1, 'OK'];
      }),
    };

    mockUserRepo = {
      findOrCreateByPhone: jest.fn(async (phone: string, preferredLanguage = 'ne') => {
        let user = Array.from(mockUsers.values()).find((u) => u.phone_number === phone);
        if (!user) {
          user = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            phone_number: phone,
            is_phone_verified: false,
            is_active: true,
            is_suspended: false,
            suspension_reason: null,
            preferred_language: preferredLanguage,
            person_id: null,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
          };
          mockUsers.set(user.id, user);
        }
        return user;
      }),
      findById: jest.fn(async (id: string) => mockUsers.get(id) || null),
      findByPhone: jest.fn(async (phone: string) =>
        Array.from(mockUsers.values()).find((u) => u.phone_number === phone) || null,
      ),
      setPhoneVerified: jest.fn(async (id: string, verified = true) => {
        const u = mockUsers.get(id);
        if (u) u.is_phone_verified = verified;
      }),
      setSuspension: jest.fn(async (id: string, suspended: boolean, reason?: string) => {
        const u = mockUsers.get(id);
        if (u) {
          u.is_suspended = suspended;
          u.suspension_reason = reason || null;
        }
      }),
      assignRole: jest.fn(async (userId: string, role: Role, branchId = null, grantedBy = null) => {
        const roles = mockRoles.get(userId) || [];
        const assignment = {
          id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: userId,
          role,
          branch_id: branchId,
          granted_by: grantedBy,
          created_at: new Date(),
        };
        roles.push(assignment);
        mockRoles.set(userId, roles);
        return assignment;
      }),
      revokeRole: jest.fn(async (userId: string, role: Role, branchId = null) => {
        const roles = mockRoles.get(userId) || [];
        const filtered = roles.filter((r) => !(r.role === role && r.branch_id === branchId));
        mockRoles.set(userId, filtered);
        return filtered.length < roles.length;
      }),
      getUserRoles: jest.fn(async (userId: string) => mockRoles.get(userId) || []),
    };

    mockSessionRepo = {
      createSession: jest.fn(async (data: any) => {
        const session = {
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: data.userId,
          refresh_token_hash: data.refreshTokenHash,
          device_platform: data.devicePlatform,
          device_id: data.deviceId || null,
          device_name: data.deviceName || null,
          ip_address: data.ipAddress || null,
          user_agent: data.userAgent || null,
          expires_at: data.expiresAt,
          revoked_at: null,
          created_at: new Date(),
        };
        mockSessions.set(session.id, session);
        return session;
      }),
      findByTokenHash: jest.fn(async (hash: string) =>
        Array.from(mockSessions.values()).find((s) => s.refresh_token_hash === hash) || null,
      ),
      findById: jest.fn(async (id: string) => mockSessions.get(id) || null),
      revokeSession: jest.fn(async (id: string) => {
        const s = mockSessions.get(id);
        if (s) s.revoked_at = new Date();
      }),
      revokeAllForUser: jest.fn(async (userId: string) => {
        let count = 0;
        for (const s of mockSessions.values()) {
          if (s.user_id === userId && !s.revoked_at) {
            s.revoked_at = new Date();
            count++;
          }
        }
        return count;
      }),
      rotateSessionTransactional: jest.fn(async (tokenHash: string, data: any) => {
        const oldSession = Array.from(mockSessions.values()).find(
          (s) => s.refresh_token_hash === tokenHash,
        );
        if (!oldSession) {
          return { status: 'NOT_FOUND' };
        }
        if (oldSession.revoked_at) {
          for (const s of mockSessions.values()) {
            if (s.user_id === oldSession.user_id) {
              s.revoked_at = new Date();
            }
          }
          return { status: 'REUSED', oldSession };
        }
        if (new Date(oldSession.expires_at).getTime() < Date.now()) {
          return { status: 'EXPIRED' };
        }

        oldSession.revoked_at = new Date();
        const newSession = {
          id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          user_id: oldSession.user_id,
          refresh_token_hash: data.newRefreshTokenHash,
          device_platform: data.devicePlatform || 'web',
          device_id: data.deviceId || null,
          device_name: data.deviceName || null,
          ip_address: data.ipAddress || null,
          user_agent: data.userAgent || null,
          expires_at: data.expiresAt,
          revoked_at: null,
          created_at: new Date(),
        };
        mockSessions.set(newSession.id, newSession);
        return { status: 'SUCCESS', newSession, oldSession };
      }),
    };

    mockBranchRepo = {
      findAll: jest.fn(async () => [{ id: 'b-kaski', name: 'Kaski' }]),
      findById: jest.fn(async (id: string) => ({ id, name: `Branch ${id}` })),
    };

    mockAuditRepo = {
      appendAuditLog: jest.fn(async (...args: any[]) => {
        mockAuditLogs.push(args);
        return { id: 'audit_1' };
      }),
    };

    authService = new AuthService(
      jwtService,
      mockRedisService,
      mockUserRepo,
      mockSessionRepo,
      mockBranchRepo,
      mockAuditRepo,
      smsProvider,
      mockDatabase,
      mockAuditOutboxRepo,
    );
  });

  describe('OTP Generation & Rate Limiting (AUTH-FR-001, AUTH-FR-004, EC-0011, EC-0012)', () => {
    it('should generate OTP challenge and dispatch SMS via adapter', async () => {
      const res = await authService.requestOtp({ phoneNumber: '9841234567' });
      expect(res).toBeDefined();
      expect(res.otpSessionId).toMatch(/^otp_/);
      expect(res.cooldownSeconds).toBe(60);
      expect(res.expiresInSeconds).toBe(300);

      // Verify SMS was delivered to test adapter
      const sentOtp = smsProvider.getLastOtp('+9779841234567');
      expect(sentOtp).toBeDefined();
      expect(sentOtp).toMatch(/^\d{6}$/);
    });

    it('should normalize input numbers to E.164 canonical format in OTP storage', async () => {
      await authService.requestOtp({ phoneNumber: '+977 984-123-4567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567');
      expect(sentOtp).toBeDefined();
    });

    it('should enforce 60-second resend cooldown (EC-0012)', async () => {
      await authService.requestOtp({ phoneNumber: '9841234567' });

      // Immediate second request must be rejected with OTP_RESEND_COOLDOWN
      await expect(authService.requestOtp({ phoneNumber: '9841234567' })).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.OTP_RESEND_COOLDOWN,
        },
      });
    });

    it('should enforce phone rate limiting after 5 requests in window', async () => {
      // Simulate 5 requests (bypassing cooldown by clearing cooldown key between calls)
      for (let i = 0; i < 5; i++) {
        mockRedisData.delete('otp:cooldown:+9779841234567');
        await authService.requestOtp({ phoneNumber: '9841234567' });
      }

      mockRedisData.delete('otp:cooldown:+9779841234567');
      // 6th request must trigger RATE_LIMIT_EXCEEDED
      await expect(authService.requestOtp({ phoneNumber: '9841234567' })).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
        },
      });
    });
  });

  describe('Durable OTP lifecycle evidence',()=>{
    it('blocks SMS and Redis mutation when the initial evidence write is unavailable',async()=>{
      const sms=jest.spyOn(smsProvider,'sendOtp');
      mockAuditOutboxRepo.recordAuditIntent.mockRejectedValueOnce(new Error('Private storage detail'));
      await expect(authService.requestOtp({phoneNumber:'9841234567'})).rejects.toMatchObject({response:{errorCode:ErrorCode.SERVICE_UNAVAILABLE}});
      expect(sms).not.toHaveBeenCalled();expect(mockRedisService.eval).not.toHaveBeenCalled();
    });
    it('does not consume verification attempts when the initial evidence write fails',async()=>{
      const requested=await authService.requestOtp({phoneNumber:'9841234567'});
      mockRedisService.eval.mockClear();mockAuditOutboxRepo.recordAuditIntent.mockRejectedValueOnce(new Error('Private storage detail'));
      await expect(authService.verifyOtp({otpSessionId:requested.otpSessionId,code:'000000'})).rejects.toMatchObject({response:{errorCode:ErrorCode.SERVICE_UNAVAILABLE}});
      expect(mockRedisService.eval).not.toHaveBeenCalled();expect(JSON.parse(mockRedisData.get('otp:challenge:+9779841234567')!.value).attempts).toBe(0);
    });
    it('records fixed cooldown, invalid-code and exhausted-attempt outcomes without secrets',async()=>{
      const requested=await authService.requestOtp({phoneNumber:'9841234567'});
      await expect(authService.requestOtp({phoneNumber:'9841234567'})).rejects.toThrow();
      for(let i=0;i<5;i++)await expect(authService.verifyOtp({otpSessionId:requested.otpSessionId,code:'000000'})).rejects.toThrow();
      const outcomes=mockAuditIntents.filter(e=>e.action.endsWith('_OUTCOME')).map(e=>e.newValue.reasonCode);
      expect(outcomes).toContain(ErrorCode.OTP_RESEND_COOLDOWN);expect(outcomes.filter(c=>c===ErrorCode.INVALID_OTP)).toHaveLength(4);expect(outcomes).toContain(ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED);
      const evidence=JSON.stringify(mockAuditIntents);
      for(const secret of ['9841234567',requested.otpSessionId,'000000',smsProvider.getLastOtp('+9779841234567')!])expect(evidence).not.toContain(secret);
    });
    it('cleans up thrown SMS failures and redacts logs and retained outcomes',async()=>{
      jest.spyOn(smsProvider,'sendOtp').mockRejectedValueOnce(new Error('Secret provider credential +9779841234567'));
      const logging=jest.spyOn((authService as any).logger,'error').mockImplementation(()=>{});
      await expect(authService.requestOtp({phoneNumber:'9841234567'})).rejects.toMatchObject({response:{errorCode:ErrorCode.EXTERNAL_PROVIDER_ERROR}});
      expect(mockRedisData.has('otp:challenge:+9779841234567')).toBe(false);
      expect(mockAuditIntents.at(-1).newValue.reasonCode).toBe(ErrorCode.EXTERNAL_PROVIDER_ERROR);
      expect(logging).toHaveBeenCalledWith('OTP_SMS_DISPATCH_FAILED');
      expect(JSON.stringify(logging.mock.calls)).not.toContain('Secret provider');logging.mockRestore();
    });
    it('returns no challenge credentials if provider acceptance outcome cannot be acknowledged',async()=>{
      const record=mockAuditOutboxRepo.recordAuditIntent.getMockImplementation();
      mockAuditOutboxRepo.recordAuditIntent.mockImplementation(async(data:any)=>{if(data.action==='OTP_REQUEST_OUTCOME')throw new Error('Private commit failure');return record(data);});
      const sms=jest.spyOn(smsProvider,'sendOtp');
      await expect(authService.requestOtp({phoneNumber:'9841234567'})).rejects.toMatchObject({response:{errorCode:ErrorCode.SERVICE_UNAVAILABLE}});
      expect(sms).toHaveBeenCalledTimes(1);expect(mockAuditIntents).toHaveLength(1);expect(mockAuditIntents[0].newValue.outcome).toBe('STARTED');
    });
    it('retains the attempt and returns safe unavailability when failure outcome persistence fails',async()=>{
      const requested=await authService.requestOtp({phoneNumber:'9841234567'});
      const record=mockAuditOutboxRepo.recordAuditIntent.getMockImplementation();
      mockAuditOutboxRepo.recordAuditIntent.mockImplementation(async(data:any)=>{if(data.action==='OTP_VERIFY_OUTCOME')throw new Error('Private outcome failure');return record(data);});
      await expect(authService.verifyOtp({otpSessionId:requested.otpSessionId,code:'000000'})).rejects.toMatchObject({response:{errorCode:ErrorCode.SERVICE_UNAVAILABLE}});
      expect(mockAuditIntents.at(-1).action).toBe('OTP_VERIFY_ATTEMPT');expect(mockSessions.size).toBe(0);
    });
  });

  describe('OTP Verification & Single-Use Atomic Consumption (AUTH-FR-003, EC-0013, EC-0014, EC-0015)', () => {
    it('should successfully verify valid OTP, create persistent account without claiming person, and issue tokens', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567')!;

      const session = await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: sentOtp,
      });

      expect(session).toBeDefined();
      expect(session.accessToken).toBeDefined();
      expect(session.refreshToken).toBeDefined();
      expect(session.user.phoneNumber).toBe('+9779841234567');

      // CRITICAL REQUIREMENT: Account creation must NEVER automatically claim person_id (BR-GOV-001, EC-0023)
      expect(session.user.personId).toBeNull();
      expect(session.user.isClaimed).toBe(false);

      // Verify JWT claims
      const decoded: any = jwtService.verify(session.accessToken);
      expect(decoded.sub).toBe(session.user.id);
      expect(decoded.phoneNumber).toBe('+9779841234567');
      expect(decoded.roles).toContain(Role.REGISTERED_USER);

      // Verify audit log recorded LOGIN
      const loginIntent=mockAuditIntents.find(e=>e.action===AuditAction.LOGIN);
      expect(loginIntent).toBeDefined();
      expect(loginIntent.newValue.sessionId).toBe(decoded.sid);
      expect(mockAuditIntents.find(e=>e.action==='OTP_VERIFY_ATTEMPT').entityId).toBe(loginIntent.newValue.operationId);
      expect(JSON.stringify(mockAuditIntents)).not.toContain(session.refreshToken);
      expect(JSON.stringify(mockAuditIntents)).not.toContain(session.user.phoneNumber);
    });

    it('returns no tokens and rolls back the session when durable login audit fails',async()=>{
      const challenge=await authService.requestOtp({phoneNumber:'9841234567'});
      const code=smsProvider.getLastOtp('+9779841234567')!;
      const signing=jest.spyOn(jwtService,'sign');
      const record=mockAuditOutboxRepo.recordAuditIntent.getMockImplementation();
      mockAuditOutboxRepo.recordAuditIntent.mockImplementation(async(data:any,...args:any[])=>{if(data.action===AuditAction.LOGIN)throw new Error('Private fictional database failure');return record(data,...args);});
      await expect(authService.verifyOtp({otpSessionId:challenge.otpSessionId,code})).rejects.toThrow('Login could not be completed');
      expect(mockSessions.size).toBe(0);expect(mockAuditIntents.filter(e=>e.action===AuditAction.LOGIN)).toHaveLength(0);expect(signing).not.toHaveBeenCalled();
      await expect(authService.verifyOtp({otpSessionId:challenge.otpSessionId,code})).rejects.toThrow('OTP session expired or not found');
    });

    it('keeps a committed login usable when audit delivery fails but retains retry evidence',async()=>{
      const challenge=await authService.requestOtp({phoneNumber:'9841234567'});
      mockAuditOutboxRepo.processOutboxEntry.mockRejectedValueOnce(new Error('Private downstream failure'));
      const result=await authService.verifyOtp({otpSessionId:challenge.otpSessionId,code:smsProvider.getLastOtp('+9779841234567')!});
      expect(result.accessToken).toBeTruthy();expect(mockSessions.size).toBe(1);expect(mockAuditIntents.filter(e=>e.action===AuditAction.LOGIN)).toHaveLength(1);
      expect(mockAuditOutboxRepo.markFailed).toHaveBeenCalledWith('fictional-audit-intent','LOGIN_AUDIT_DELIVERY_FAILED');
    });

    it('refuses verification before consuming an OTP when durable login dependencies are missing',async()=>{
      const challenge=await authService.requestOtp({phoneNumber:'9841234567'});
      const unavailable=new AuthService(jwtService,mockRedisService,mockUserRepo,mockSessionRepo,mockBranchRepo,mockAuditRepo,smsProvider);
      await expect(unavailable.verifyOtp({otpSessionId:challenge.otpSessionId,code:smsProvider.getLastOtp('+9779841234567')!})).rejects.toThrow('Durable login audit is unavailable');
      expect(mockSessions.size).toBe(0);expect(mockRedisData.has(`otp:session:${challenge.otpSessionId}`)).toBe(true);
    });

    it('does not sign credentials when transaction commit cannot be confirmed',async()=>{
      const challenge=await authService.requestOtp({phoneNumber:'9841234567'});
      const code=smsProvider.getLastOtp('+9779841234567')!;
      const signing=jest.spyOn(jwtService,'sign');
      mockDatabase.transaction.mockImplementationOnce(async(callback:any)=>{await callback({});throw new Error('Fictional lost commit acknowledgement');});
      await expect(authService.verifyOtp({otpSessionId:challenge.otpSessionId,code})).rejects.toThrow('Login could not be completed');
      expect(signing).not.toHaveBeenCalled();
      // An uncertain commit may have persisted both records; it must not be
      // retried or claimed rolled back without database evidence.
      expect(mockSessions.size).toBe(1);expect(mockAuditIntents.filter(e=>e.action===AuditAction.LOGIN)).toHaveLength(1);
    });

    it('should atomically consume OTP and prevent replay attack (EC-0013)', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567')!;

      // First verification succeeds
      await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: sentOtp,
      });

      // Second verification attempt with same session and code MUST fail with OTP_EXPIRED
      await expect(
        authService.verifyOtp({
          otpSessionId: initRes.otpSessionId,
          code: sentOtp,
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.OTP_EXPIRED,
        },
      });
    });

    it('should lock challenge after exceeding 5 failed attempts (EC-0015)', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        await expect(
          authService.verifyOtp({
            otpSessionId: initRes.otpSessionId,
            code: '000000',
          }),
        ).rejects.toMatchObject({
          response: {
            errorCode: ErrorCode.INVALID_OTP,
          },
        });
      }

      // 5th wrong attempt locks session with OTP_MAX_ATTEMPTS_EXCEEDED
      await expect(
        authService.verifyOtp({
          otpSessionId: initRes.otpSessionId,
          code: '000000',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
        },
      });
    });

    it('should reject suspended account during verification (AUTH-FR-010)', async () => {
      // Pre-seed a suspended user
      const user = await mockUserRepo.findOrCreateByPhone('+9779841234567');
      await mockUserRepo.setSuspension(user.id, true, 'Violation of code of conduct');

      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567')!;

      await expect(
        authService.verifyOtp({
          otpSessionId: initRes.otpSessionId,
          code: sentOtp,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Sessions, Refresh Token Rotation & Replay Detection (AUTH-FR-006, EC-0020)', () => {
    it('should rotate refresh token on /auth/refresh and invalidate previous token', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567')!;
      const session1 = await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: sentOtp,
      });

      // Rotate token
      const session2 = await authService.refreshToken({
        refreshToken: session1.refreshToken,
      });

      expect(session2.accessToken).toBeDefined();
      expect(session2.refreshToken).toBeDefined();
      expect(session2.refreshToken).not.toBe(session1.refreshToken);
    });

    it('should detect refresh token replay attack and revoke all user sessions (EC-0020)', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841234567' });
      const sentOtp = smsProvider.getLastOtp('+9779841234567')!;
      const session1 = await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: sentOtp,
      });

      // Legitimate rotation
      await authService.refreshToken({ refreshToken: session1.refreshToken });

      // Attacker replaying old session1.refreshToken!
      await expect(
        authService.refreshToken({ refreshToken: session1.refreshToken }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.REFRESH_TOKEN_REUSED,
        },
      });

      // Confirm all sessions for user are now revoked
      const allRevoked = Array.from(mockSessions.values()).every((s) => s.revoked_at !== null);
      expect(allRevoked).toBe(true);
    });
  });

  describe('Role Assignment & Governance (BR-GOV-004, EC-0230)', () => {
    it('should prevent self-elevation when user attempts to assign roles to themselves (BR-GOV-004)', async () => {
      const userId = 'u-operator-01';

      await expect(
        authService.assignUserRole(userId, [Role.SUPER_ADMIN], userId, Role.SUPER_ADMIN),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
        },
      });
    });

    it('should prevent non-super-admin from assigning SUPER_ADMIN role', async () => {
      const operatorId = 'u-branch-admin';
      const targetUserId = 'u-target-01';
      await mockUserRepo.assignRole(operatorId, Role.BRANCH_ADMIN, 'b-kaski');

      await expect(
        authService.assignUserRole(operatorId, [Role.BRANCH_ADMIN], targetUserId, Role.SUPER_ADMIN),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
        },
      });
    });

    it('should allow Super Admin to assign roles to other users', async () => {
      const operatorId = 'u-super-admin';
      const targetUserId = 'u-target-01';
      await mockUserRepo.assignRole(operatorId, Role.SUPER_ADMIN);

      const result = await authService.assignUserRole(
        operatorId,
        [Role.SUPER_ADMIN],
        targetUserId,
        Role.BRANCH_ADMIN,
        'b-kaski',
      );

      expect(result).toBeDefined();
      expect(result.role).toBe(Role.BRANCH_ADMIN);
      expect(result.branchId).toBe('b-kaski');
    });
  });

  describe('Security Boundary: Production Mode Rejections', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should strictly reject TestSmsProviderAdapter initialization in production mode', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new TestSmsProviderAdapter()).toThrow(
        /TestSmsProviderAdapter is strictly prohibited in production mode/,
      );
    });
  });
});
