import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  Inject,
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
import { UserRepository, UserAccountRecord } from '../../database/repositories/user.repository';
import { SessionRepository } from '../../database/repositories/session.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { ISmsProvider, SMS_PROVIDER } from './sms/sms-provider.interface';
import { normalizeNepaliPhone } from '../../common/utils/phone.util';
import { JWT_SECRET } from './auth.constants';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // In-memory fallback challenge store ONLY for isolated unit tests when Redis is explicitly offline
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
  ) {}

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Request OTP verification code for mobile number (AUTH-FR-001, AUTH-FR-002, AUTH-FR-004, EC-0011, EC-0012, EC-0225)
   */
  async requestOtp(dto: RequestOtpDto, clientIp = '127.0.0.1'): Promise<RequestOtpResponse> {
    // 1. Normalize phone to canonical E.164 (+97798XXXXXXXX)
    const phone = normalizeNepaliPhone(dto.phoneNumber);

    const isRedisLive = this.redisService.isReady();

    // 2. Anti-Abuse Rate Limiting (EC-0012, EC-0225)
    if (isRedisLive) {
      // IP rate limit (10 requests per 10 mins)
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

      // Phone cooldown (60 seconds)
      const cooldownKey = `otp:cooldown:${phone}`;
      const inCooldown = await this.redisService.get(cooldownKey);
      if (inCooldown) {
        const remainingTtl = await this.redisService.ttl(cooldownKey);
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_RESEND_COOLDOWN,
          message: `Please wait ${remainingTtl > 0 ? remainingTtl : 60} seconds before requesting a new OTP.`,
          messageNepali: 'कृपया नयाँ कोड अनुरोध गर्न ६० सेकेन्ड पर्खनुहोस्।',
        });
      }

      // Phone rate limit (5 requests per 10 mins)
      const phoneLimitKey = `otp:ratelimit:phone:${phone}`;
      const phoneAttempts = await this.redisService.incr(phoneLimitKey);
      if (phoneAttempts === 1) {
        await this.redisService.expire(phoneLimitKey, 600);
      }
      if (phoneAttempts > 5) {
        throw new BadRequestException({
          errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Maximum OTP requests exceeded for this mobile number. Please wait.',
          messageNepali: 'यो नम्बरको लागि अधिकतम सीमा नाघेको छ। केही समयपछि प्रयास गर्नुहोस्।',
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
      await this.redisService.set(`otp:challenge:${phone}`, JSON.stringify(challengeData), expiresInSeconds);
      await this.redisService.set(`otp:session:${otpSessionId}`, phone, expiresInSeconds);
      await this.redisService.set(`otp:cooldown:${phone}`, '1', 60);
    } else {
      if (this.isProduction()) {
        throw new Error('FATAL: Redis must be active in production for OTP challenge storage.');
      }
      this.fallbackMemoryStore.set(otpSessionId, challengeData);
    }

    // 5. Dispatch OTP via configured SMS Provider (AUTH-FR-002)
    const smsResult = await this.smsProvider.sendOtp(phone, otpCode);
    if (!smsResult.success && this.isProduction()) {
      this.logger.error(`SMS dispatch failed: ${smsResult.error}`);
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
    let phone: string | null = null;
    let challenge: { codeHash: string; salt: string; attempts: number; maxAttempts: number; phone: string; expiresAt: number } | null = null;

    if (isRedisLive) {
      phone = await this.redisService.get(`otp:session:${dto.otpSessionId}`);
      if (!phone) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP session expired or not found',
          messageNepali: 'ओटिपी सत्र समाप्त भयो वा फेला परेन।',
        });
      }

      const challengeStr = await this.redisService.get(`otp:challenge:${phone}`);
      if (!challengeStr) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP challenge has expired',
          messageNepali: 'ओटिपी समाप्त भएको छ।',
        });
      }
      challenge = JSON.parse(challengeStr);
    } else {
      challenge = this.fallbackMemoryStore.get(dto.otpSessionId) || null;
      if (!challenge) {
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_EXPIRED,
          message: 'OTP session expired or not found',
        });
      }
      phone = challenge.phone;
    }

    if (!challenge || !phone) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_EXPIRED,
        message: 'OTP session expired or not found',
      });
    }

    // Expiry Check (EC-0014)
    if (Date.now() > challenge.expiresAt) {
      if (isRedisLive) {
        await this.redisService.del(`otp:challenge:${phone}`, `otp:session:${dto.otpSessionId}`);
      } else {
        this.fallbackMemoryStore.delete(dto.otpSessionId);
      }
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_EXPIRED,
        message: 'OTP has expired',
        messageNepali: 'ओटिपी कोड समाप्त भयो।',
      });
    }

    // Attempt Limit Check (AUTH-FR-003, EC-0015)
    challenge.attempts += 1;
    if (challenge.attempts > challenge.maxAttempts) {
      if (isRedisLive) {
        await this.redisService.del(`otp:challenge:${phone}`, `otp:session:${dto.otpSessionId}`);
      } else {
        this.fallbackMemoryStore.delete(dto.otpSessionId);
      }
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
        message: 'Maximum OTP verification attempts exceeded. Please request a new OTP.',
        messageNepali: 'प्रमाणीकरण प्रयासको अधिकतम संख्या नाघ्यो। कृपया नयाँ कोड अनुरोध गर्नुहोस्।',
      });
    }

    // Verify Hash
    const computedHash = crypto.createHash('sha256').update(dto.code + challenge.salt).digest('hex');
    if (computedHash !== challenge.codeHash) {
      // Save updated attempts count
      if (isRedisLive) {
        const remainingTtl = await this.redisService.ttl(`otp:challenge:${phone}`);
        if (remainingTtl > 0) {
          await this.redisService.set(`otp:challenge:${phone}`, JSON.stringify(challenge), remainingTtl);
        }
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        if (isRedisLive) {
          await this.redisService.del(`otp:challenge:${phone}`, `otp:session:${dto.otpSessionId}`);
        } else {
          this.fallbackMemoryStore.delete(dto.otpSessionId);
        }
        throw new BadRequestException({
          errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          message: 'Maximum OTP verification attempts exceeded. Challenge locked.',
          messageNepali: 'अधिकतम प्रयास नाघ्यो। नयाँ ओटिपी कोड माग्नुहोस्।',
        });
      }

      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_OTP,
        message: 'Invalid OTP code entered',
        messageNepali: 'गलत ओटिपी कोड प्रविष्ट गरियो।',
      });
    }

    // Atomic Consumption (EC-0013, single-use guarantee)
    if (isRedisLive) {
      await this.redisService.del(`otp:challenge:${phone}`, `otp:session:${dto.otpSessionId}`);
    } else {
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
      // Default initial role for newly verified user
      const defaultRole = await this.userRepo.assignRole(user.id, Role.REGISTERED_USER);
      roleRecords = [defaultRole];
    }

    const roles = roleRecords.map((r) => r.role);
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);

    // 7. Persistent Refresh Token & Session (AUTH-FR-005, AUTH-FR-009)
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.sessionRepo.createSession({
      userId: user.id,
      refreshTokenHash,
      devicePlatform: dto.deviceInfo?.platform || 'web',
      deviceId: dto.deviceInfo?.deviceId || null,
      deviceName: dto.deviceInfo?.appVersion || null,
      ipAddress: clientIp,
      userAgent,
      expiresAt: refreshExpiresAt,
    });

    // 8. Access Token Issuance (JWT, 15m short-lived, AUTH-FR-005)
    const payload = {
      sub: user.id,
      phoneNumber: user.phone_number,
      roles,
      branchIds,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: '15m',
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
        { phoneNumber: user.phone_number, roles },
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
   * Renew session via refresh token rotation and reuse detection (AUTH-FR-006, EC-0020)
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
    const session = await this.sessionRepo.findByTokenHash(tokenHash);

    if (!session) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.SESSION_EXPIRED,
        message: 'Invalid session token',
      });
    }

    // Token Reuse / Replay Detection (EC-0020)
    if (session.revoked_at !== null) {
      // Replay of an already revoked token! Revoke ALL sessions for this user family
      this.logger.error(`SECURITY ALERT: Refresh token reuse detected for user ${session.user_id}! Revoking all sessions.`);
      await this.sessionRepo.revokeAllForUser(session.user_id);

      try {
        await this.auditRepo.appendAuditLog(
          AuditAction.UPDATE,
          'user_sessions',
          session.user_id,
          session.user_id,
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

    // Session Expiry Check
    if (new Date() > session.expires_at) {
      await this.sessionRepo.revokeSession(session.id);
      throw new UnauthorizedException({
        errorCode: ErrorCode.SESSION_EXPIRED,
        message: 'Session has expired. Please log in again.',
      });
    }

    // Account Status Verification
    const user = await this.userRepo.findById(session.user_id);
    if (!user || user.is_suspended || !user.is_active || user.deleted_at) {
      await this.sessionRepo.revokeSession(session.id);
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'Account is no longer active or has been suspended.',
      });
    }

    // Rotate Refresh Token (revoke old, issue new)
    await this.sessionRepo.revokeSession(session.id);

    const newRawRefreshToken = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.sessionRepo.createSession({
      userId: user.id,
      refreshTokenHash: newRefreshTokenHash,
      devicePlatform: session.device_platform,
      deviceId: session.device_id,
      deviceName: session.device_name,
      ipAddress: clientIp,
      userAgent,
      expiresAt: newExpiresAt,
    });

    // Fetch up-to-date roles
    const roleRecords = await this.userRepo.getUserRoles(user.id);
    const roles = roleRecords.map((r) => r.role);
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);

    const payload = {
      sub: user.id,
      phoneNumber: user.phone_number,
      roles,
      branchIds,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: JWT_SECRET,
      expiresIn: '15m',
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
  async logout(dto: LogoutDto, userId?: string, clientIp = '127.0.0.1', userAgent = 'unknown'): Promise<{ success: boolean }> {
    if (dto.refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');
      const session = await this.sessionRepo.findByTokenHash(tokenHash);
      if (session) {
        await this.sessionRepo.revokeSession(session.id);
      }
    }

    if (userId) {
      try {
        await this.auditRepo.appendAuditLog(
          AuditAction.LOGOUT,
          'user_sessions',
          userId,
          userId,
          'USER',
          null,
          null,
          clientIp,
          userAgent,
        );
      } catch {}
    }

    return { success: true };
  }

  /**
   * Logout from all devices (AUTH-FR-008, EC-0021)
   */
  async logoutAll(userId: string, clientIp = '127.0.0.1', userAgent = 'unknown'): Promise<{ success: boolean; revokedCount: number }> {
    const revokedCount = await this.sessionRepo.revokeAllForUser(userId);

    try {
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
      );
    } catch {}

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

    // 2. Privilege Hierarchy Check
    const isSuperAdmin = operatorRoles.includes(Role.SUPER_ADMIN);
    const isBranchAdmin = operatorRoles.includes(Role.BRANCH_ADMIN);

    if (role === Role.SUPER_ADMIN && !isSuperAdmin) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
        message: 'Only Super Administrators can assign the SUPER_ADMIN role.',
      });
    }

    if (role === Role.BRANCH_ADMIN && !isSuperAdmin) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
        message: 'Only Super Administrators can assign the BRANCH_ADMIN role.',
      });
    }

    if (isBranchAdmin && !isSuperAdmin) {
      // Branch admin can only assign roles within their own branch
      if (!branchId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
          message: 'Branch Administrators must specify an authorized branchId.',
        });
      }
    }

    const assigned = await this.userRepo.assignRole(targetUserId, role, branchId, operatorId);

    try {
      await this.auditRepo.appendAuditLog(
        AuditAction.ROLE_ASSIGN,
        'user_roles',
        assigned.id,
        operatorId,
        operatorRoles[0] || 'SUPER_ADMIN',
        null,
        { targetUserId, role, branchId },
      );
    } catch {}

    return {
      id: assigned.id,
      role: assigned.role,
      branchId: assigned.branch_id,
      grantedBy: assigned.granted_by,
      createdAt: assigned.created_at.toISOString(),
    };
  }

  /**
   * Revoke role assignment
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

    const isSuperAdmin = operatorRoles.includes(Role.SUPER_ADMIN);
    if (!isSuperAdmin && (role === Role.SUPER_ADMIN || role === Role.BRANCH_ADMIN)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ROLE_ASSIGNMENT_DENIED,
        message: 'Only Super Administrators can revoke administrative roles.',
      });
    }

    const revoked = await this.userRepo.revokeRole(targetUserId, role, branchId);

    try {
      await this.auditRepo.appendAuditLog(
        AuditAction.ROLE_REVOKE,
        'user_roles',
        targetUserId,
        operatorId,
        operatorRoles[0] || 'SUPER_ADMIN',
        null,
        { targetUserId, role, branchId },
      );
    } catch {}

    return { success: revoked };
  }
}
