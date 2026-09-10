import {
  RequestOtpDto,
  RequestOtpResponse,
  VerifyOtpDto,
  AuthSessionDto,
  RefreshTokenDto,
  LogoutDto,
  UserAccountDto,
} from '@kashyap/contracts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiClient {
  static async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResponse> {
    const res = await fetch(`${API_BASE}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'OTP request failed');
    }
    return data;
  }

  static async verifyOtp(dto: VerifyOtpDto): Promise<AuthSessionDto> {
    const res = await fetch(`${API_BASE}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'OTP verification failed');
    }
    return data;
  }

  static async refreshToken(dto: RefreshTokenDto): Promise<AuthSessionDto> {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.messageNepali || data.message || 'Token refresh failed');
    }
    return data;
  }

  static async logout(dto: LogoutDto, token?: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(dto),
      });
    } catch {
      // Best effort logout
    }
  }

  static async getMe(token: string): Promise<UserAccountDto> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch user profile');
    }
    return data;
  }
}
