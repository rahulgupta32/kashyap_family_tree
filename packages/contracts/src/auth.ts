// ============================================================================
// Auth & Identity Contracts
// ============================================================================

import { Role } from './enums.js';

export interface RequestOtpDto {
  phoneNumber: string; // E.164 or Nepal format (98XXXXXXXX)
}

export interface RequestOtpResponse {
  otpSessionId: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
  isTestMode?: boolean;
}

export interface VerifyOtpDto {
  otpSessionId: string;
  code: string;
  deviceInfo?: {
    deviceId: string;
    platform: 'android' | 'ios' | 'web';
    appVersion: string;
    pushToken?: string;
  };
}

export interface AuthSessionDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    phoneNumber: string;
    roles: Role[];
    personId?: string | null;
    isClaimed: boolean;
    isProfileComplete: boolean;
  };
}

export interface RefreshTokenDto {
  refreshToken: string;
}
