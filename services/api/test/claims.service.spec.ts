import { ClaimsService } from '../src/modules/claims/claims.service';
import { ClaimStatus, ErrorCode } from '@kashyap/contracts';

describe('ClaimsService (State Transitions & Self-Verification Governance)', () => {
  let claimsService: ClaimsService;

  beforeEach(() => {
    claimsService = new ClaimsService();
  });

  describe('Claim Submission & Statement of Truth', () => {
    it('should submit a valid claim with evidence attachments and statement of truth', async () => {
      const claim = await claimsService.submitClaim('u-401', {
        targetPersonId: 'p-401',
        relationshipDescription: 'I am Dinesh Adhikari, son of Krishna Bahadur Adhikari',
        knownFamilyMembers: ['Krishna Bahadur Adhikari', 'Suresh Adhikari'],
        evidenceAttachments: [
          {
            mediaAssetId: 'med-001',
            documentType: 'citizenship',
            description: 'Nepali Citizenship Certificate',
          },
        ],
        statementOfTruth: true,
      });

      expect(claim).toBeDefined();
      expect(claim.status).toBe(ClaimStatus.SUBMITTED);
      expect(claim.claimantUserId).toBe('u-401');
      expect(claim.evidenceAttachments.length).toBe(1);
    });

    it('should reject claim if statement of truth is false', async () => {
      await expect(
        claimsService.submitClaim('u-401', {
          targetPersonId: 'p-401',
          relationshipDescription: 'Description',
          knownFamilyMembers: [],
          evidenceAttachments: [],
          statementOfTruth: false,
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        },
      });
    });

    it('should reject duplicate active claim for the same person', async () => {
      await claimsService.submitClaim('u-401', {
        targetPersonId: 'p-401',
        relationshipDescription: 'Claim 1',
        knownFamilyMembers: [],
        evidenceAttachments: [],
        statementOfTruth: true,
      });

      // Submitting second claim for same person while first is active
      await expect(
        claimsService.submitClaim('u-402', {
          targetPersonId: 'p-401',
          relationshipDescription: 'Claim 2',
          knownFamilyMembers: [],
          evidenceAttachments: [],
          statementOfTruth: true,
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
        },
      });
    });
  });

  describe('Self-Verification Prohibition & Governance (CLAIM-FR-008)', () => {
    it('should prevent an administrator from verifying their own claim (recusal)', async () => {
      const claim = await claimsService.submitClaim('u-admin', {
        targetPersonId: 'p-402',
        relationshipDescription: 'Admin self claim',
        knownFamilyMembers: [],
        evidenceAttachments: [],
        statementOfTruth: true,
      });

      // Admin u-admin tries to approve their own claim
      await expect(
        claimsService.reviewClaim(claim.id, 'u-admin', {
          status: ClaimStatus.APPROVED,
          reviewNotes: 'Self approval attempt',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        },
      });
    });

    it('should allow independent verifier to approve claim', async () => {
      const claim = await claimsService.submitClaim('u-401', {
        targetPersonId: 'p-401',
        relationshipDescription: 'Valid claim',
        knownFamilyMembers: [],
        evidenceAttachments: [],
        statementOfTruth: true,
      });

      const reviewed = await claimsService.reviewClaim(claim.id, 'u-admin', {
        status: ClaimStatus.APPROVED,
        reviewNotes: 'Citizenship verified against national registry',
      });

      expect(reviewed.status).toBe(ClaimStatus.APPROVED);
      expect(reviewed.reviewedByUserId).toBe('u-admin');
      expect(reviewed.reviewedAt).toBeDefined();
    });
  });
});
