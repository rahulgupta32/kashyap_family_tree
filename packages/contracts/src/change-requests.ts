// ============================================================================
// Genealogy Change Request Contracts
// ============================================================================

import { ChangeRequestType, ChangeRequestStatus } from './enums.js';

export interface SubmitChangeRequestDto {
  targetPersonId?: string;
  branchId?: string;
  type: ChangeRequestType;
  proposedChanges: Record<string, any>;
  reason: string;
  evidenceAssetIds?: string[];
}

export interface VisualDiffFieldDto {
  field: string;
  fieldLabelNepali: string;
  fieldLabelEnglish: string;
  oldValue: any;
  newValue: any;
  changeType: 'MODIFIED' | 'ADDED' | 'REMOVED';
}

export interface VisualDiffDto {
  fields: VisualDiffFieldDto[];
  graphImpact?: {
    affectedParents?: string[];
    affectedSpouses?: string[];
    affectedChildren?: string[];
    generationShift?: number;
  };
}

export interface ChangeRequestDetailDto {
  id: string;
  type: ChangeRequestType;
  status: ChangeRequestStatus;
  targetPersonId?: string;
  branchId?: string | null;
  requesterUserId: string;
  baseVersion: number;
  version: number;
  proposedChanges: Record<string, any>;
  currentSnapshot?: Record<string, any>;
  visualDiff?: VisualDiffDto;
  reason: string;
  correctionNotes?: string;
  resubmissionCount: number;
  reviewNotes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewChangeRequestDto {
  status: ChangeRequestStatus.APPROVED | ChangeRequestStatus.REJECTED;
  reviewNotes: string;
}

export interface ResubmitChangeRequestDto {
  proposedChanges: Record<string, any>;
  reason?: string;
}
