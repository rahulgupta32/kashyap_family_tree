import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import {
  RequestOtpDto,
  RequestOtpResponse,
  VerifyOtpDto,
  AuthSessionDto,
  RefreshTokenDto,
  LogoutDto,
  Role,
  ErrorCode,
  UserRoleAssignmentDto,
  UserAccountDto,
  AuditAction,
} from '@kashyap/contracts';
import { RedisService } from '../../redis/redis.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { DatabaseService } from '../../database/database.service';
import { ISmsProvider, SMS_PROVIDER } from './sms/sms-provider.interface';
import { normalizeNepaliPhone } from '../../common/utils/phone.util';
import {
  getJwtSecret,
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  JWT_ACCESS_EXPIRY,
} from './auth.constants';
import { JwtPayload } from './guards/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // In-memory fallback challenge store ONLY for isolated unit tests when explicitly enabled
  private fallbackMemoryStore = new Map<
    string,
    { codeHash: string; salt: string; attempts: number; maxAttempts: number; expiresAt: number; phone: string }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly branchRepo: BranchRepository,
    private readonly auditRepo: AuditRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: ISmsProvider,
    @Optional() private readonly db?: DatabaseService,
    @Optional() private readonly auditOutboxRepo?: AuditOutboxRepository,
  ) {}

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private isExplicitTestFallback(): boolean {
    return process.env.NODE_ENV === 'test' && process.env.ALLOW_IN_MEMORY_AUTH_FALLBACK === 'true';
  }

  /**
   * Request OTP verification code for mobile number (AUTH-FR-001, AUTH-FR-002, AUTH-FR-004, EC-0011, EC-0012, EC-0225)
   */
  async requestOtp(dto: RequestOtpDto, clientIp = '127.0.0.1'): Promise<RequestOtpResponse> {
    // 1. Normalize phone to canonical E.164 (+97798XXXXXXXX)
    const phone = normalizeNepaliPhone(dto.phoneNumber);

    const isRedisLive = this.redisService.isReady();

    if (!isRedisLive && !this.isExplicitTestFallback()) {
      throw new ServiceUnavailableException({
        errorCode: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Authentication and session services are temporarily unavailable. Please try again.',
        messageNepali: 'प्रमाणीकरण तथा सत्र सेवाहरू हाल अनुपलब्ध छन्। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।',
      });
    }

    // 2. Anti-Abuse Rate Limiting & Cooldown via Redis (EC-0012, EC-0225)
    if (isRedisLive) {
      // IP rate limit (15 requests per 10 mins)
      const ipKey = `otp:ratelimit:ip:${clientIp}`;
      const ipAttempts = await this.redisService.incr(ipKey);
      if (ipAttempts === 1) {
        await this.redisService.expire(ipKey, 600);
      }
      if (ipAttempts > 15) {
        throw new BadRequestException({
          errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Too many OTP requests from this network. Please wait 10 minutes.',
          messageNepali: 'धेरै पटक अनुरोध गरिएको छ। कृपया १० मिनेट पर्खनुहोस्।',
        });
      }
    }

    // 3. Cryptographically Secure OTP Generation (AUTH-FR-002)
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = crypto.createHash('sha256').update(otpCode + salt).digest('hex');

    const otpSessionId = `otp_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const expiresInSeconds = 300; // 5 minutes (AUTH-FR-003)
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    // 4. Store protected challenge
    const challengeData = {
      codeHash,
      salt,
      attempts: 0,
      maxAttempts: 5,
      phone,
      createdAt: Date.now(),
      expiresAt,
    };

    if (isRedisLive) {
      // Atomic Lua script for reserving cooldown and replacing active session atomically
      const reserveScript = `
        local cooldownKey = KEYS[1]
        local rateLimitPhoneKey = KEYS[2]
        local activeSessionKey = KEYS[3]
        local challengeKey = KEYS[4]
        local sessionKey = KEYS[5]

        local otpSessionId = ARGV[1]
        local challengeJson = ARGV[2]
        local expiresInSeconds = tonumber(ARGV[3])
        local cooldownSeconds = tonumber(ARGV[4])
        local maxPhoneAttempts = tonumber(ARGV[5])
        local phoneRateLimitTtl = tonumber(ARGV[6])
        local phone = ARGV[7]

        -- Check cooldown
        local inCooldown = redis.call('GET', cooldownKey)
        if inCooldown then
          local remainingTtl = redis.call('TTL', cooldownKey)
          return { -1, tostring(remainingTtl) }
        end

        -- Check phone rate limit
        local phoneAttempts = redis.call('INCR', rateLimitPhoneKey)
        if phoneAttempts == 1 then
          redis.call('EXPIRE', rateLimitPhoneKey, phoneRateLimitTtl)
        end
        if phoneAttempts > maxPhoneAttempts then
          return { -2, "RATE_LIMIT" }
        end

        -- Invalidate prior challenge session for this phone on resend
        local priorSessionId = redis.call('GET', activeSessionKey)
        if priorSessionId then
          redis.call('DEL', 'otp:session:' .. priorSessionId)
        end

        -- Store new challenge and active session atomically
        redis.call('SET', challengeKey, challengeJson, 'EX', expiresInSeconds)
        redis.call('SET', sessionKey, phone, 'EX', expiresInSeconds)
        redis.call('SET', activeSessionKey, otpSessionId, 'EX', expiresInSeconds)
        redis.call('SET', cooldownKey, '1', 'EX', cooldownSeconds)

        return { 1, "OK" }
      `;

      const result = (await this.redisService.eval(
        reserveScript,
        5,
        `otp:cooldown:${phone}`,
        `otp:ratelimit:phone:${phone}`,
        `otp:active_session:${phone}`,
        `otp:challenge:${phone}`,
        `otp:session:${otpSessionId}`,
        otpSessionId,
        JSON.stringify(challengeData),
        expiresInSeconds,
        60,
        5,
        600,
        phone,
      )) as [number, string];

      const status = result[0];
      if (status === -1) {
        const remainingTtl = parseInt(result[1], 10);
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_RESEND_COOLDOWN,
          message: `Please wait ${remainingTtl > 0 ? remainingTtl : 60} seconds before requesting a new OTP.`,
          messageNepali: 'कृपया नयाँ कोड अनुरोध गर्न ६० सेकेन्ड पर्खनुहोस्।',
        });
      }
      if (status === -2) {
        throw new BadRequestException({
          errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Maximum OTP requests exceeded for this mobile number. Please wait.',
          messageNepali: 'यो नम्बरको लागि अधिकतम सीमा नाघेको छ। केही समयपछि प्रयास गर्नुहोस्।',
        });
      }
    } else {
      this.fallbackMemoryStore.set(otpSessionId, challengeData);
    }

    // 5. Dispatch OTP via configured SMS Provider (AUTH-FR-002)
    const smsResult = await this.smsProvider.sendOtp(phone, otpCode);
    if (!smsResult.success) {
      this.logger.error(`SMS dispatch failed for phone ${phone}: ${smsResult.error}`);
      // Atomic SMS failure cleanup:
      // Clean up ONLY the failed challenge using atomic identity check without deleting newer challenges
      if (isRedisLive) {
        const cleanupLua = `
          local activeKey = KEYS[1]
          local challengeKey = KEYS[2]
          local sessionKey = KEYS[3]
          local cooldownKey = KEYS[4]
          local failedSessionId = ARGV[1]
          local retryBackoffSeconds = tonumber(ARGV[2])

          local currentActive = redis.call('GET', activeKey)
          if currentActive == failedSessionId then
            redis.call('DEL', challengeKey, sessionKey, activeKey)
            redis.call('SET', cooldownKey, '1', 'EX', retryBackoffSeconds)
            return 1
          else
            redis.call('DEL', sessionKey)
            return 0
          end
        `;
        await this.redisService.eval(
          cleanupLua,
          4,
          `otp:active_session:${phone}`,
          `otp:challenge:${phone}`,
          `otp:session:${otpSessionId}`,
          `otp:cooldown:${phone}`,
          otpSessionId,
          5, // 5 seconds retry backoff
        );
      } else {
        this.fallbackMemoryStore.delete(otpSessionId);
      }

      throw new ServiceUnavailableException({
        errorCode: ErrorCode.EXTERNAL_PROVIDER_ERROR,
        message: 'SMS delivery failed. Please try again in a few moments.',
        messageNepali: 'एसएमएस पठाउन सकिएन। कृपया केही क्षणपछि पुनः प्रयास गर्नुहोस्।',
      });
    }

    return {
      otpSessionId,
      cooldownSeconds: 60,
      expiresInSeconds,
      isTestMode: !this.isProduction(),
    };
  }

  /**
   * Verify OTP and issue persistent tokens and authenticated session
   * (AUTH-FR-003, AUTH-FR-005, AUTH-FR-010, BR-GOV-001, EC-0013, EC-0014, EC-0015, EC-0023)
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    clientIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<AuthSessionDto> {
    const isRedisLive = this.redisService.isReady();

    if (!isRedisLive && !this.isExplicitTestFallback()) {
      throw new ServiceUnavailableException({
        errorCode: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Authentication and session services are temporarily unavailable. Please try again.',
        messageNepali: 'प्रमाणीकरण तथा सत्र सेवाहरू हाल अनुपलब्ध छन्। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।',
      });
    }

    let phone: string | null = null;

    if (isRedisLive) {
      phone = await this.redisService.get(`otp:session:${dto.otpSessionId}`);
      if (!phone) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP session expired or not found',
          messageNepali: 'ओटिपी सत्र समाप्त भयो वा फेला परेन।',
        });
      }

      // Read salt and challenge data
      const challengeStr = await this.redisService.get(`otp:challenge:${phone}`);
      if (!challengeStr) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP challenge has expired',
          messageNepali: 'ओटिपी समाप्त भएको छ।',
        });
      }

      const challenge = JSON.parse(challengeStr);
      const computedHash = crypto.createHash('sha256').update(dto.code + challenge.salt).digest('hex');

      // Atomic Lua script for validation, attempt increment, and single-use consumption
      const luaScript = `
        local challengeKey = KEYS[1]
        local sessionKey = KEYS[2]
        local activeKey = KEYS[3]
        local suppliedSessionId = ARGV[1]
        local computedHash = ARGV[2]
        local maxAttempts = tonumber(ARGV[3])
        local nowMs = tonumber(ARGV[4])

        -- Atomically validate active_session === suppliedSessionId
        local activeSession = redis.call('GET', activeKey)
        if activeSession ~= suppliedSessionId then
          return { -4, "STALE_SESSION" }
        end

        local dataStr = redis.call('GET', challengeKey)
        if not dataStr then
          return { -1, "EXPIRED" }
        end

        local c = cjson.decode(dataStr)
        if nowMs > c.expiresAt then
          redis.call('DEL', challengeKey, sessionKey, activeKey)
          return { -1, "EXPIRED" }
        end

        if c.attempts >= maxAttempts then
          redis.call('DEL', challengeKey, sessionKey, activeKey)
          return { -2, "MAX_ATTEMPTS" }
        end

        if c.codeHash ~= computedHash then
          c.attempts = c.attempts + 1
          if c.attempts >= maxAttempts then
            redis.call('DEL', challengeKey, sessionKey, activeKey)
            return { -2, "MAX_ATTEMPTS" }
          else
            local ttl = redis.call('TTL', challengeKey)
            if ttl > 0 then
              redis.call('SET', challengeKey, cjson.encode(c), 'EX', ttl)
            end
            return { -3, tostring(c.attempts) }
          end
        end

        -- MATCH! Atomically consume (single-use guarantee, EC-0013)
        redis.call('DEL', challengeKey, sessionKey, activeKey)
        return { 1, "OK" }
      `;

      const result = (await this.redisService.eval(
        luaScript,
        3,
        `otp:challenge:${phone}`,
        `otp:session:${dto.otpSessionId}`,
        `otp:active_session:${phone}`,
        dto.otpSessionId,
        computedHash,
        challenge.maxAttempts || 5,
        Date.now(),
      )) as [number, string];

      const status = result[0];

      if (status === -4) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP session has been superseded by a newer request',
          messageNepali: 'यो ओटिपी सत्र नयाँ अनुरोधद्वारा प्रतिस्थापित भइसकेको छ।',
        });
      }

      if (status === -1) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP has expired or already been consumed',
          messageNepali: 'ओटिपी कोड समाप्त भयो वा पहिले नै प्रयोग भइसक्यो।',
        });
      }

      if (status === -2) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          message: 'Maximum OTP verification attempts exceeded. Please request a new OTP.',
          messageNepali: 'प्रमाणीकरण प्रयासको अधिकतम संख्या नाघ्यो। कृपया नयाँ कोड अनुरोध गर्नुहोस्।',
        });
      }

      if (status === -3) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_OTP,
          message: 'Invalid OTP code entered',
          messageNepali: 'गलत ओटिपी कोड प्रविष्ट गरियो।',
        });
      }
    } else {
      // Test-only in-memory fallback
      const challenge = this.fallbackMemoryStore.get(dto.otpSessionId);
      if (!challenge) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP session expired or not found',
        });
      }
      phone = challenge.phone;

      if (Date.now() > challenge.expiresAt) {
        this.fallbackMemoryStore.delete(dto.otpSessionId);
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP has expired',
        });
      }

      challenge.attempts += 1;
      if (challenge.attempts > challenge.maxAttempts) {
        this.fallbackMemoryStore.delete(dto.otpSessionId);
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          message: 'Maximum OTP verification attempts exceeded.',
        });
      }

      const computedHash = crypto.createHash('sha256').update(dto.code + challenge.salt).digest('hex');
      if (computedHash !== challenge.codeHash) {
        if (challenge.attempts >= challenge.maxAttempts) {
          this.fallbackMemoryStore.delete(dto.otpSessionId);
          throw new BadRequestException({
            errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
            message: 'Maximum OTP verification attempts exceeded.',
          });
        }
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_OTP,
          message: 'Invalid OTP code entered',
        });
      }

      this.fallbackMemoryStore.delete(dto.otpSessionId);
    }

    // 6. Persistent PostgreSQL Account Lookup & Status Verification (AUTH-FR-001, AUTH-FR-010, BR-GOV-001)
    const user = await this.userRepo.findOrCreateByPhone(phone);

    if (user.is_suspended) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_SUSPENDED,
        message: user.suspension_reason || 'Your account has been suspended by administration.',
        messageNepali: 'तपाईंको खाता प्रशासनद्वारा निलम्बन गरिएको छ।',
      });
    }

    if (!user.is_active || user.deleted_at) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_DELETED,
        message: 'Your account has been deactivated or deleted.',
        messageNepali: 'तपाईंको खाता निष्क्रिय वा हटाइएको छ।',
      });
    }

    if (!user.is_phone_verified) {
      await this.userRepo.setPhoneVerified(user.id, true);
    }

    // Retrieve database roles
    let roleRecords = await this.userRepo.getUserRoles(user.id);
    if (roleRecords.length === 0) {
      const defaultRole = await this.userRepo.assignRole(user.id, Role.REGISTERED_USER);
      roleRecords = [defaultRole];
    }

    const roles = roleRecords.map((r) => r.role);
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);

    // 7. Persistent Refresh Token & Session (AUTH-FR-005, AUTH-FR-009)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await this.sessionRepo.createSession({
      userId: user.id,
      refreshTokenHash,
      devicePlatform: dto.deviceInfo?.platform || 'web',
      deviceId: dto.deviceInfo?.deviceId || null,
      deviceName: dto.deviceInfo?.appVersion || null,
      ipAddress: clientIp,
      userAgent,
      expiresAt: refreshExpiresAt,
    });

    // 8. Access Token Issuance bound to persistent session sid (AUTH-FR-005)
    const payload: JwtPayload = {
      sub: user.id,
      sid: session.id,
      phoneNumber: user.phone_number,
      tokenType: 'access',
      roles,
      branchIds,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: getJwtSecret(),
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_ACCESS_EXPIRY,
    });

    // 9. Append-Only Audit Logging (AUTH-FR-011, AUD-FR-001..005)
    try {
      await this.auditRepo.appendAuditLog(
        AuditAction.LOGIN,
        'user_accounts',
        user.id,
        user.id,
        roles[0] || 'REGISTERED_USER',
        null,
        { phoneNumber: user.phone_number, roles, sessionId: session.id },
        clientIp,
        userAgent,
      );
    } catch (auditErr: any) {
      this.logger.warn(`Audit log creation failed: ${auditErr.message}`);
    }

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        roles,
        personId: user.person_id,
        isClaimed: user.person_id !== null,
        isProfileComplete: user.is_phone_verified,
      },
    };
  }

  /**
   * Renew session via transactional refresh token rotation and row locking (AUTH-FR-006, EC-0020)
   */
  async refreshToken(
    dto: RefreshTokenDto,
    clientIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<AuthSessionDto> {
    if (!dto.refreshToken) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Refresh token is required',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');

    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Transactional rotation with SELECT ... FOR UPDATE row locking
    const rotationResult = await this.sessionRepo.rotateSessionTransactional(tokenHash, {
      newRefreshTokenHash,
      expiresAt: newExpiresAt,
      devicePlatform: 'web',
      ipAddress: clientIp,
      userAgent,
    });

    if (rotationResult.status === 'NOT_FOUND') {
      throw new UnauthorizedException({
        errorCode: ErrorCode.SESSION_EXPIRED,
        message: 'Invalid session token',
      });
    }

    // Token Reuse / Replay Detection (EC-0020)
    if (rotationResult.status === 'REUSED') {
      const victimUserId = rotationResult.oldSession!.user_id;
      this.logger.error(
        `SECURITY ALERT: Refresh token reuse detected for user ${victimUserId}! All sessions terminated (EC-0020).`,
      );

      try {
        await this.auditRepo.appendAuditLog(
          AuditAction.UPDATE,
          'user_sessions',
          victimUserId,
          victimUserId,
          'SYSTEM',
          null,
          { alert: 'REFRESH_TOKEN_REUSE_DETECTED', action: 'ALL_SESSIONS_REVOKED' },
          clientIp,
          userAgent,
        );
      } catch {}

      throw new UnauthorizedException({
        errorCode: ErrorCode.REFRESH_TOKEN_REUSED,
        message: 'Security Alert: Refresh token reuse detected. All sessions terminated. Please log in again.',
        messageNepali: 'सुरक्षा सूचना: टोकन पुन: प्रयोग भएको पाइयो। सबै सत्रहरू बन्द गरिएका छन्।',
      });
    }

    if (rotationResult.status === 'EXPIRED') {
      throw new UnauthorizedException({
        errorCode: ErrorCode.SESSION_EXPIRED,
        message: 'Session has expired. Please log in again.',
      });
    }

    const newSession = rotationResult.newSession!;

    // Account Status Verification
    const user = await this.userRepo.findById(newSession.user_id);
    if (!user || user.is_suspended || !user.is_active || user.deleted_at) {
      await this.sessionRepo.revokeSession(newSession.id);
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'Account is no longer active or has been suspended.',
      });
    }

    // Fetch up-to-date roles from database
    const roleRecords = await this.userRepo.getUserRoles(user.id);
    const roles = roleRecords.map((r) => r.role);
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);

    const payload: JwtPayload = {
      sub: user.id,
      sid: newSession.id,
      phoneNumber: user.phone_number,
      tokenType: 'access',
      roles,
      branchIds,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: getJwtSecret(),
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_ACCESS_EXPIRY,
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        roles,
        personId: user.person_id,
        isClaimed: user.person_id !== null,
        isProfileComplete: user.is_phone_verified,
      },
    };
  }

  /**
   * Logout from current device/session (AUTH-FR-007)
   */
  async logout(
    dto: LogoutDto,
    userId?: string,
    sessionId?: string,
    clientIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<{ success: boolean }> {
    let targetUserId = userId;
    const sessionsToRevoke: string[] = [];

    if (sessionId) {
      sessionsToRevoke.push(sessionId);
    }

    if (dto.refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(dto.refreshToken.trim()).digest('hex');
      const session = await this.sessionRepo.findByTokenHash(tokenHash);

      if (!session) {
        // If no verified bearer session was provided, an invalid refresh token must be rejected
        if (!sessionId) {
          throw new UnauthorizedException({
            errorCode: ErrorCode.UNAUTHORIZED,
            message: 'Session not found for provided refresh token',
          });
        }
        // When an invalid refresh token accompanies a valid, verified bearer session,
        // we revoke that verified session so we never return success while leaving the intended session active.
      } else {
        // Conflicting credentials check:
        // If both a verified bearer session and a valid refresh token are provided,
        // they must belong to the same user.
        if (targetUserId && session.user_id !== targetUserId) {
          throw new UnauthorizedException({
            errorCode: ErrorCode.UNAUTHORIZED,
            message: 'Conflicting credentials: Bearer session and refresh token belong to different users',
          });
        }

        targetUserId = session.user_id;
        sessionsToRevoke.push(session.id);
      }
    } else if (!sessionId) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required for logout: valid Bearer token or refresh token must be provided',
      });
    }

    const uniqueSessions = Array.from(new Set(sessionsToRevoke));

    // Execute session revocation and audit outbox recording in the same PostgreSQL transaction
    const executeRevocation = async (client?: any) => {
      for (const sId of uniqueSessions) {
        await this.sessionRepo.revokeSession(sId, client);
      }

      if (targetUserId) {
        if (this.auditOutboxRepo) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              action: AuditAction.LOGOUT,
              entityType: 'user_sessions',
              entityId: uniqueSessions[0] || targetUserId,
              actorId: targetUserId,
              actorRole: 'USER',
              oldValue: null,
              newValue: { revokedSessions: uniqueSessions },
              ipAddress: clientIp,
              userAgent,
            },
            client,
          );
        } else {
          await this.auditRepo.appendAuditLog(
            AuditAction.LOGOUT,
            'user_sessions',
            uniqueSessions[0] || targetUserId,
            targetUserId,
            'USER',
            null,
            { revokedSessions: uniqueSessions },
            clientIp,
            userAgent,
            client,
          );
        }
      }
    };

    if (this.db) {
      await this.db.transaction(async (client) => {
        await executeRevocation(client);
      });
    } else {
      await executeRevocation();
    }

    // Post-commit delivery attempt (best-effort; failures do not roll back committed revocation)
    if (this.auditOutboxRepo) {
      try {
        await this.auditOutboxRepo.drainOutbox(this.auditRepo);
      } catch (err: any) {
        this.logger.warn(`Audit outbox drain failed post-commit during logout: ${err.message}`);
      }
    }

    return { success: true };
  }

  /**
   * Logout from all devices (AUTH-FR-008, EC-0021)
   */
  async logoutAll(
    userId: string,
    clientIp = '127.0.0.1',
    userAgent = 'unknown',
  ): Promise<{ success: boolean; revokedCount: number }> {
    let revokedCount = 0;

    const executeRevocationAll = async (client?: any) => {
      revokedCount = await this.sessionRepo.revokeAllForUser(userId, client);

      if (this.auditOutboxRepo) {
        await this.auditOutboxRepo.recordAuditIntent(
          {
            action: AuditAction.LOGOUT,
            entityType: 'user_sessions',
            entityId: userId,
            actorId: userId,
            actorRole: 'USER',
            oldValue: null,
            newValue: { scope: 'ALL_DEVICES', revokedCount },
            ipAddress: clientIp,
            userAgent,
          },
          client,
        );
      } else {
        await this.auditRepo.appendAuditLog(
          AuditAction.LOGOUT,
          'user_sessions',
          userId,
          userId,
          'USER',
          null,
          { scope: 'ALL_DEVICES', revokedCount },
          clientIp,
          userAgent,
          client,
        );
      }
    };

    if (this.db) {
      await this.db.transaction(async (client) => {
        await executeRevocationAll(client);
      });
    } else {
      await executeRevocationAll();
    }

    // Post-commit delivery attempt (best-effort; failures do not roll back committed revocation)
    if (this.auditOutboxRepo) {
      try {
        await this.auditOutboxRepo.drainOutbox(this.auditRepo);
      } catch (err: any) {
        this.logger.warn(`Audit outbox drain failed post-commit during logoutAll: ${err.message}`);
      }
    }

    return { success: true, revokedCount };
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserAccountDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new BadRequestException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'User account not found',
      });
    }

    const roleRecords = await this.userRepo.getUserRoles(userId);

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      isPhoneVerified: user.is_phone_verified,
      isActive: user.is_active,
      isSuspended: user.is_suspended,
      suspensionReason: user.suspension_reason,
      preferredLanguage: user.preferred_language,
      personId: user.person_id,
      roles: roleRecords.map((r) => ({
        id: r.id,
        role: r.role,
        branchId: r.branch_id,
        grantedBy: r.granted_by,
        createdAt: r.created_at.toISOString(),
      })),
      createdAt: user.created_at.toISOString(),
    };
  }

  /**
   * Role assignment with self-elevation check and authority governance (BR-GOV-004, EC-0230)
   */
  async assignUserRole(
    operatorId: string,
    operatorRoles: Role[],
    targetUserId: string,
    role: Role,
    branchId: string | null = null,
  ): Promise<UserRoleAssignmentDto> {
    // 1. Prevent Self-Elevation (BR-GOV-004, EC-0230)
    if (operatorId === targetUserId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
        message: 'Self-elevation is strictly prohibited. Users cannot grant roles to themselves.',
        messageNepali: 'आफैंलाई भूमिका प्रदान गर्न निषेध गरिएको छ।',
      });
    }

    // 2. Privilege Hierarchy & Branch Governance Check
    const operatorRoleRecords = await this.userRepo.getUserRoles(operatorId);
    const isSuperAdmin = operatorRoleRecords.some((r) => r.role === Role.SUPER_ADMIN);

    if (!isSuperAdmin) {
      const adminBranches = operatorRoleRecords
        .filter((r) => r.role === Role.BRANCH_ADMIN)
        .map((r) => r.branch_id);

      if (adminBranches.length === 0) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Only Super Administrators and Branch Administrators can assign roles.',
        });
      }

      // Branch Admin cannot assign administrative roles
      if (role === Role.SUPER_ADMIN || role === Role.BRANCH_ADMIN) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Only Super Administrators can assign administrative roles (SUPER_ADMIN, BRANCH_ADMIN).',
        });
      }

      // Branch Admin must specify an authorized branchId
      if (!branchId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Branch Administrators must specify an authorized branchId.',
        });
      }

      if (!adminBranches.includes(branchId)) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: You do not possess administrative authority for branch ${branchId}.`,
          messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
        });
      }
    }

    // Verify branch exists if branchId provided
    if (branchId) {
      const branch = await this.branchRepo.findById(branchId);
      if (!branch) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Target branch ${branchId} does not exist.`,
        });
      }
    }

    const runInTx = async <T>(fn: (client?: any) => Promise<T>): Promise<T> => {
      if (this.db) {
        return this.db.transaction(fn);
      }
      return fn();
    };

    return await runInTx(async (txClient) => {
      const assigned = await this.userRepo.assignRole(targetUserId, role, branchId, operatorId, txClient);

      await this.auditRepo.appendAuditLog(
        AuditAction.ROLE_ASSIGN,
        'user_roles',
        assigned.id,
        operatorId,
        isSuperAdmin ? 'SUPER_ADMIN' : 'BRANCH_ADMIN',
        null,
        { targetUserId, role, branchId },
        undefined,
        undefined,
        txClient,
      );

      return {
        id: assigned.id,
        role: assigned.role,
        branchId: assigned.branch_id,
        grantedBy: assigned.granted_by,
        createdAt: assigned.created_at.toISOString(),
      };
    });
  }

  /**
   * Revoke role assignment with branch governance
   */
  async revokeUserRole(
    operatorId: string,
    operatorRoles: Role[],
    targetUserId: string,
    role: Role,
    branchId: string | null = null,
  ): Promise<{ success: boolean }> {
    if (operatorId === targetUserId) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
        message: 'Self-modification of roles is prohibited.',
      });
    }

    const operatorRoleRecords = await this.userRepo.getUserRoles(operatorId);
    const isSuperAdmin = operatorRoleRecords.some((r) => r.role === Role.SUPER_ADMIN);

    if (!isSuperAdmin) {
      const adminBranches = operatorRoleRecords
        .filter((r) => r.role === Role.BRANCH_ADMIN)
        .map((r) => r.branch_id);

      if (adminBranches.length === 0) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Only Super Administrators and Branch Administrators can revoke roles.',
        });
      }

      if (role === Role.SUPER_ADMIN || role === Role.BRANCH_ADMIN) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Only Super Administrators can revoke administrative roles.',
        });
      }

      if (!branchId || !adminBranches.includes(branchId)) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: You do not possess administrative authority for branch ${branchId}.`,
          messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
        });
      }
    }

    const runInTx = async <T>(fn: (client?: any) => Promise<T>): Promise<T> => {
      if (this.db) {
        return this.db.transaction(fn);
      }
      return fn();
    };

    return await runInTx(async (txClient) => {
      const revoked = await this.userRepo.revokeRole(targetUserId, role, branchId, txClient);

      if (revoked) {
        await this.auditRepo.appendAuditLog(
          AuditAction.ROLE_REVOKE,
          'user_roles',
          targetUserId,
          operatorId,
          isSuperAdmin ? 'SUPER_ADMIN' : 'BRANCH_ADMIN',
          null,
          { targetUserId, role, branchId },
          undefined,
          undefined,
          txClient,
        );
      }

      return { success: revoked };
    });
  }

  async clearCooldownForTest(phone: string): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException();
    }
    const isRedisLive = this.redisService.isReady();
    if (isRedisLive) {
      await this.redisService.del(
        `otp:cooldown:${phone}`,
        `otp:ratelimit:phone:${phone}`,
        `otp:challenge:${phone}`,
        `otp:attempts:${phone}`,
        `otp:locked:${phone}`,
      );
    }
  }
}
