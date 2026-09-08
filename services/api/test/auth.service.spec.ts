import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { Role, ErrorCode } from '@kashyap/contracts';

describe('AuthService (Unit Tests)', () => {
  let authService: AuthService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test_jwt_secret' });
    authService = new AuthService(jwtService);
  });

  it('should generate an OTP session for a valid Nepali mobile number', async () => {
    const res = await authService.requestOtp({ phoneNumber: '9841000001' });
    expect(res).toBeDefined();
    expect(res.otpSessionId).toMatch(/^otp_/);
    expect(res.cooldownSeconds).toBe(60);
    expect(res.expiresInSeconds).toBe(300);
  });

  it('should reject invalid mobile number format with INVALID_PHONE_NUMBER error code', async () => {
    await expect(authService.requestOtp({ phoneNumber: '12345' })).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.INVALID_PHONE_NUMBER,
      },
    });
  });

  it('should verify test OTP code 123456 and issue JWT session tokens', async () => {
    const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });
    const session = await authService.verifyOtp({
      otpSessionId: initRes.otpSessionId,
      code: '123456',
    });

    expect(session).toBeDefined();
    expect(session.accessToken).toBeDefined();
    expect(session.user.phoneNumber).toBe('9841000001');
    expect(session.user.roles).toContain(Role.VERIFIED_MEMBER);
  });

  it('should reject incorrect OTP code with INVALID_OTP error code', async () => {
    const initRes = await authService.requestOtp({ phoneNumber: '9841000001' });
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
  });
});
