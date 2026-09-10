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

export interface LogoutDto {
  refreshToken?: string;
}

export interface AssignRoleDto {
  userId: string;
  role: Role;
  branchId?: string | null;
}

export interface RevokeRoleDto {
  userId: string;
  role: Role;
  branchId?: string | null;
}

export interface UserRoleAssignmentDto {
  id: string;
  role: Role;
  branchId?: string | null;
  grantedBy?: string | null;
  createdAt: string;
}

export interface UserAccountDto {
  id: string;
  phoneNumber: string;
  isPhoneVerified: boolean;
  isActive: boolean;
  isSuspended: boolean;
  suspensionReason?: string | null;
  preferredLanguage: string;
  personId?: string | null;
  roles: UserRoleAssignmentDto[];
  createdAt: string;
}

export interface BranchDto {
  id: string;
  nameNepali: string;
  nameEnglish: string;
  code: string;
  moolGhar?: string | null;
  kuldevata?: string | null;
  description?: string | null;
  createdAt: string;
}
