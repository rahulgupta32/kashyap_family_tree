// ============================================================================
// Claim & Verification Contracts
// ============================================================================

import { ClaimStatus, DisputeStatus } from './enums.js';
import { PersonSummaryDto } from './genealogy.js';

export interface SubmitClaimDto {
  targetPersonId: string;
  relationshipDescription: string;
  knownFamilyMembers?: string[];
  evidenceAttachments?: Array<{
    mediaAssetId: string;
    description?: string;
    documentType: 'family_photo' | 'event_invitation' | 'elder_voucher' | 'address_receipt' | 'clan_record' | 'other';
  }>;
  statementOfTruth: boolean;
}

export interface ClaimEvidenceAttachmentDto {
  id: string;
  mediaAssetId: string;
  mediaUrl?: string;
  documentType: string;
  description?: string;
  disputeId?: string;
  createdAt: string;
}

export interface ClaimDetailDto {
  id: string;
  targetPersonId: string;
  targetPerson: PersonSummaryDto;
  claimantUserId: string;
  claimantPhoneNumber: string;
  status: ClaimStatus;
  relationshipDescription: string;
  knownFamilyMembers?: any;
  statementOfTruth: boolean;
  tier1ReviewedBy?: string;
  tier1ReviewedAt?: string;
  tier1Decision?: string;
  tier1Notes?: string;
  tier2ReviewedBy?: string;
  tier2ReviewedAt?: string;
  tier2Decision?: string;
  tier2Notes?: string;
  correctionRequestNotes?: string;
  resubmissionCount: number;
  evidenceAttachments: ClaimEvidenceAttachmentDto[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tier1ReviewClaimDto {
  decision: 'VOUCHED' | 'REJECTED' | 'CORRECTION_REQUESTED' | 'ESCALATED';
  notes: string;
}

export interface Tier2ReviewClaimDto {
  decision: 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED' | 'ESCALATED';
  notes: string;
}

export interface RequestClaimCorrectionDto {
  notes: string;
}

export interface ResubmitClaimDto {
  relationshipDescription?: string;
  knownFamilyMembers?: string[];
  evidenceAttachments?: Array<{
    mediaAssetId: string;
    description?: string;
    documentType: 'family_photo' | 'event_invitation' | 'elder_voucher' | 'address_receipt' | 'clan_record' | 'other';
  }>;
  statementOfTruth: boolean;
}

export interface FileClaimDisputeDto {
  reason: string;
  evidenceAttachments?: Array<{
    mediaAssetId: string;
    description?: string;
    documentType: string;
  }>;
}

export interface ClaimDisputeDetailDto {
  id: string;
  claimId: string;
  disputantUserId: string;
  disputantPhoneNumber?: string;
  reason: string;
  status: DisputeStatus;
  resolutionNotes?: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
