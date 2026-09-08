import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { Role, ErrorCode } from '@kashyap/contracts';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('AuthService (Comprehensive Unit & Security Tests)', () => {
  let authService: AuthService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'kashyap_test_secret_key_2026' });
    authService = new AuthService(jwtService);
  });

  describe('OTP Request & Phone Validation', () => {
    it('should issue OTP session for standard 10-digit Nepali mobile number (98XXXXXXXX)', async () => {
      const res = await authService.requestOtp({ phoneNumber: '9841234567' });
      expect(res).toBeDefined();
      expect(res.otpSessionId).toMatch(/^otp_/);
      expect(res.cooldownSeconds).toBe(60);
      expect(res.expiresInSeconds).toBe(300);
    });

    it('should accept +977 prefix format', async () => {
      const res = await authService.requestOtp({ phoneNumber: '+9779841234567' });
      expect(res).toBeDefined();
      expect(res.otpSessionId).toBeDefined();
    });

    it('should accept 97 prefix format', async () => {
      const res = await authService.requestOtp({ phoneNumber: '9741234567' });
      expect(res).toBeDefined();
    });

    it('should reject non-Nepali or invalid length numbers', async () => {
      const invalidNumbers = ['12345', '98412', '984123456789', 'abcdefghij', '+15551234567'];
      for (const phone of invalidNumbers) {
        await expect(authService.requestOtp({ phoneNumber: phone })).rejects.toMatchObject({
          response: {
            errorCode: ErrorCode.INVALID_PHONE_NUMBER,
          },
        });
      }
    });
  });

  describe('OTP Verification & Attempt Limits', () => {
    it('should verify test OTP code 123456 and issue valid JWT accessToken and refreshToken', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });
      const session = await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: '123456',
      });

      expect(session).toBeDefined();
      expect(session.accessToken).toBeDefined();
      expect(session.refreshToken).toBeDefined();
      expect(session.user.phoneNumber).toBe('9841000001');
      expect(session.user.roles).toContain(Role.VERIFIED_MEMBER);
      expect(session.user.personId).toBe('p-401');

      // Verify JWT token signature and payload
      const decoded: any = jwtService.verify(session.accessToken);
      expect(decoded.sub).toBe('u-401');
      expect(decoded.phoneNumber).toBe('9841000001');
      expect(decoded.roles).toContain(Role.VERIFIED_MEMBER);
    });

    it('should reject incorrect OTP code with INVALID_OTP error code', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });
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
    });

    it('should prevent OTP replay (single-use token consumption)', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });
      // First verification succeeds
      await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: '123456',
      });

      // Second attempt with same session must fail
      await expect(
        authService.verifyOtp({
          otpSessionId: initRes.otpSessionId,
          code: '123456',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.OTP_EXPIRED,
        },
      });
    });

    it('should lock session after exceeding maximum allowed attempts (5 attempts)', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.verifyOtp({
            otpSessionId: initRes.otpSessionId,
            code: '999999',
          }),
        ).rejects.toMatchObject({
          response: {
            errorCode: ErrorCode.INVALID_OTP,
          },
        });
      }

      // 6th attempt must be rejected with OTP_MAX_ATTEMPTS_EXCEEDED
      await expect(
        authService.verifyOtp({
          otpSessionId: initRes.otpSessionId,
          code: '123456',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
        },
      });
    });
  });

  describe('Admin Authentication & Multi-Role Issuance', () => {
    it('should recognize admin phone 9841000099 and assign SUPER_ADMIN and BRANCH_ADMIN roles', async () => {
      const initRes = await authService.requestOtp({ phoneNumber: '9841000099' });
      const session = await authService.verifyOtp({
        otpSessionId: initRes.otpSessionId,
        code: '123456',
      });

      expect(session.user.id).toBe('u-admin');
      expect(session.user.roles).toContain(Role.SUPER_ADMIN);
      expect(session.user.roles).toContain(Role.BRANCH_ADMIN);
      expect(session.user.personId).toBeNull();
    });
  });
});
