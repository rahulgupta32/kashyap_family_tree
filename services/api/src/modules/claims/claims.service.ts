import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SubmitClaimDto, ClaimDetailDto, ReviewClaimDto, ClaimStatus, ErrorCode } from '@kashyap/contracts';

@Injectable()
export class ClaimsService {
  private claims = new Map<string, ClaimDetailDto>();

  async submitClaim(claimantUserId: string, dto: SubmitClaimDto): Promise<ClaimDetailDto> {
    if (!dto.statementOfTruth) {
      throw new BadRequestException({
        errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        message: 'Must agree to statement of truth',
      });
    }

    // Check if duplicate claim exists
    for (const c of this.claims.values()) {
      if (c.targetPersonId === dto.targetPersonId && c.status === ClaimStatus.SUBMITTED) {
        throw new BadRequestException({
          errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
          message: 'An active verification claim already exists for this person',
        });
      }
    }

    const claimId = `claim_${Date.now()}`;
    const newClaim: ClaimDetailDto = {
      id: claimId,
      targetPersonId: dto.targetPersonId,
      targetPerson: {
        id: dto.targetPersonId,
        primaryNameNepali: 'दिनेश अधिकारी',
        primaryNameEnglish: 'Dinesh Adhikari',
        gender: 'MALE' as any,
        livingStatus: 'LIVING' as any,
        generation: 4,
        branchId: 'b-001',
        branchName: 'कास्की शाखा',
        isClaimed: false,
      },
      claimantUserId,
      claimantPhoneNumber: '9841000001',
      status: ClaimStatus.SUBMITTED,
      relationshipDescription: dto.relationshipDescription,
      evidenceAttachments: dto.evidenceAttachments.map((a, i) => ({
        id: `att_${i}`,
        mediaUrl: `https://storage.kashyap.org/evidence/${a.mediaAssetId}`,
        documentType: a.documentType,
        description: a.description,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.claims.set(claimId, newClaim);
    return newClaim;
  }

  async listClaims(): Promise<ClaimDetailDto[]> {
    return Array.from(this.claims.values());
  }

  async reviewClaim(claimId: string, reviewerUserId: string, dto: ReviewClaimDto): Promise<ClaimDetailDto> {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    if (claim.claimantUserId === reviewerUserId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Administrators cannot verify their own claims',
      });
    }

    claim.status = dto.status;
    claim.reviewNotes = dto.reviewNotes;
    claim.reviewedByUserId = reviewerUserId;
    claim.reviewedAt = new Date().toISOString();
    claim.updatedAt = new Date().toISOString();

    return claim;
  }
}
