// ============================================================================
// User Profile, Privacy & Preferences Contracts
// ============================================================================

import { Role } from './enums.js';
import { PersonDetailDto } from './genealogy.js';

export interface UpdateProfileDto {
  occupation?: string;
  education?: string;
  biography?: string;
  currentAddress?: string;
  privacy?: PrivacySettingsDto;
  preferences?: NotificationPreferencesDto;
}

export type VisibilityScope = 'PUBLIC' | 'VERIFIED_COMMUNITY' | 'IMMEDIATE_FAMILY' | 'PRIVATE';

export interface PrivacySettingsDto {
  profileVisibility: VisibilityScope;
  contactVisibility: VisibilityScope;
  addressVisibility: VisibilityScope;
}

export interface NotificationPreferencesDto {
  pushEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  familyEventsEnabled: boolean;
  juthoAlertsEnabled: boolean;
  communityPostsEnabled: boolean;
}

export interface UserSessionDto {
  id: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastActiveAt?: string;
  isCurrent?: boolean;
}

export interface UserProfileDetailDto {
  id: string;
  phoneNumber: string;
  isPhoneVerified: boolean;
  personId?: string | null;
  roles: Role[];
  roleAssignments: Array<{ role: Role; branchId: string | null }>;
  person?: PersonDetailDto | null;
  privacy?: PrivacySettingsDto;
  preferences?: NotificationPreferencesDto;
  createdAt: string;
}

export interface DeleteAccountResponseDto {
  success: boolean;
  message: string;
  genealogyPreserved: boolean;
  deletedAt: string;
}
