// ============================================================================
// Claim & Verification Contracts
// ============================================================================

import { ClaimStatus } from './enums.js';
import { PersonSummaryDto } from './genealogy.js';

export interface SubmitClaimDto {
  targetPersonId: string;
  relationshipDescription: string;
  knownFamilyMembers: string[];
  evidenceAttachments: Array<{
    mediaAssetId: string;
    description: string;
    documentType: 'citizenship' | 'birth_certificate' | 'family_photo' | 'other';
  }>;
  statementOfTruth: boolean;
}

export interface ClaimDetailDto {
  id: string;
  targetPersonId: string;
  targetPerson: PersonSummaryDto;
  claimantUserId: string;
  claimantPhoneNumber: string;
  status: ClaimStatus;
  relationshipDescription: string;
  evidenceAttachments: Array<{
    id: string;
    mediaUrl: string;
    documentType: string;
    description: string;
  }>;
  reviewNotes?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewClaimDto {
  status: ClaimStatus.APPROVED | ClaimStatus.REJECTED | ClaimStatus.ADDITIONAL_INFO_REQUESTED;
  reviewNotes: string;
}
