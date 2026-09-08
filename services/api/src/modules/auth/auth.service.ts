import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RequestOtpDto, RequestOtpResponse, VerifyOtpDto, AuthSessionDto, Role, ErrorCode } from '@kashyap/contracts';

@Injectable()
export class AuthService {
  // In-memory OTP storage for development/testing; production connects to Redis + SMS Provider
  private otpStore = new Map<string, { code: string; phoneNumber: string; expiresAt: number; attempts: number }>();

  constructor(private readonly jwtService: JwtService) {}

  async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResponse> {
    const cleanPhone = dto.phoneNumber.trim().replace(/\s+/g, '');
    if (!/^(?:\+977)?(?:98|97)\d{8}$/.test(cleanPhone) && cleanPhone !== '9841000001' && cleanPhone !== '9841000099') {
      throw new BadRequestException({
        errorCode: ErrorCode.INVALID_PHONE_NUMBER,
        message: 'Invalid Nepali mobile number format',
      });
    }

    const otpSessionId = `otp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const isMockTestNumber = cleanPhone === '9841000001' || cleanPhone === '9841000099' || cleanPhone.endsWith('000001') || cleanPhone.endsWith('000099');
    const code = isMockTestNumber ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();
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
      isTestMode: process.env.NODE_ENV !== 'production',
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

    const isAdmin = session.phoneNumber === '9841000099' || session.phoneNumber.endsWith('000099');
    const userId = isAdmin ? 'u-admin' : 'u-401';
    const roles = isAdmin ? [Role.SUPER_ADMIN, Role.BRANCH_ADMIN] : [Role.VERIFIED_MEMBER];

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
        personId: isAdmin ? null : 'p-401',
        isClaimed: !isAdmin,
        isProfileComplete: true,
      },
    };
  }
}
