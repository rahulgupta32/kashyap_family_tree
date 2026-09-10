import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RequestOtpDto, RequestOtpResponse, VerifyOtpDto, AuthSessionDto, Role, ErrorCode } from '@kashyap/contracts';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // In-memory OTP storage for development/testing; production connects to Redis + SMS Provider
  private otpStore = new Map<string, { code: string; phoneNumber: string; expiresAt: number; attempts: number }>();

  constructor(private readonly jwtService: JwtService) {}

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResponse> {
    const cleanPhone = dto.phoneNumber.trim().replace(/\s+/g, '');
    const isStandardPhone = /^(?:\+977)?(?:98|97)\d{8}$/.test(cleanPhone);
    const isTestNumber = cleanPhone === '9841000001' || cleanPhone === '9841000099';

    // In production, test numbers are NOT exempt from format validation
    if (!isStandardPhone && (this.isProduction() || !isTestNumber)) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_PHONE_NUMBER,
        message: 'Invalid Nepali mobile number format',
      });
    }

    const otpSessionId = `otp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // SECURITY CONTROL: Fixed test OTP '123456' is strictly forbidden in production!
    const isMockTestNumber = !this.isProduction() && (
      cleanPhone === '9841000001' ||
      cleanPhone === '9841000099' ||
      cleanPhone.endsWith('000001') ||
      cleanPhone.endsWith('000099')
    );

    let code: string;
    if (isMockTestNumber) {
      code = '123456';
      this.logger.warn(`TEST MODE: Issued static OTP 123456 for test phone ${cleanPhone}. Strictly forbidden in production.`);
    } else {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const expiresInSeconds = 300; // 5 minutes

    this.otpStore.set(otpSessionId, {
      code,
      phoneNumber: cleanPhone,
      expiresAt: Date.now() + expiresInSeconds * 1000,
      attempts: 0,
    });

    return {
      otpSessionId,
      cooldownSeconds: 60,
      expiresInSeconds,
      isTestMode: !this.isProduction(),
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthSessionDto> {
    const session = this.otpStore.get(dto.otpSessionId);
    if (!session) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_EXPIRED,
        message: 'OTP session expired or not found',
      });
    }

    if (Date.now() > session.expiresAt) {
      this.otpStore.delete(dto.otpSessionId);
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_EXPIRED,
        message: 'OTP has expired',
      });
    }

    session.attempts += 1;
    if (session.attempts > 5) {
      this.otpStore.delete(dto.otpSessionId);
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
        message: 'Maximum OTP verification attempts exceeded',
      });
    }

    if (session.code !== dto.code) {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_OTP,
        message: 'Invalid OTP code entered',
      });
    }

    // OTP Verified! Consume session
    this.otpStore.delete(dto.otpSessionId);

    // SECURITY CONTROL: Until persistent database-backed authentication exists,
    // production authentication is strictly rejected. Fabricated timestamp users are forbidden.
    if (this.isProduction()) {
      this.logger.error('CRITICAL SECURITY: Production authentication rejected. Persistent database authentication is pending implementation.');
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Production authentication is disabled until persistent database authentication is fully implemented.',
      });
    }

    // Test/development shortcut (Permitted only in non-production environments)
    const isAdmin = session.phoneNumber === '9841000099' || session.phoneNumber.endsWith('000099');
    const userId = isAdmin ? 'u-admin' : 'u-401';
    const roles = isAdmin ? [Role.SUPER_ADMIN, Role.BRANCH_ADMIN] : [Role.VERIFIED_MEMBER];
    const personId = isAdmin ? null : 'p-401';
    const isClaimed = !isAdmin;
    this.logger.warn(`TEST MODE: Auth shortcut assigned identity ${userId} with roles [${roles.join(', ')}]`);

    const payload = {
      sub: userId,
      phoneNumber: session.phoneNumber,
      roles,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '30d' });

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400,
      user: {
        id: userId,
        phoneNumber: session.phoneNumber,
        roles,
        personId,
        isClaimed,
        isProfileComplete: true,
      },
    };
  }
}
