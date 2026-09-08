// ============================================================================
// Genealogy Change Request Contracts
// ============================================================================

import { ChangeRequestType, ChangeRequestStatus } from './enums.js';

export interface SubmitChangeRequestDto {
  targetPersonId?: string;
  type: ChangeRequestType;
  proposedChanges: Record<string, any>;
  reason: string;
  evidenceAssetIds?: string[];
}

export interface ChangeRequestDetailDto {
  id: string;
  type: ChangeRequestType;
  status: ChangeRequestStatus;
  targetPersonId?: string;
  requesterUserId: string;
  proposedChanges: Record<string, any>;
  currentSnapshot?: Record<string, any>;
  reason: string;
  reviewNotes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface ReviewChangeRequestDto {
  status: ChangeRequestStatus.APPROVED | ChangeRequestStatus.REJECTED;
  reviewNotes: string;
}
