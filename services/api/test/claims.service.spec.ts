import { ClaimsService } from '../src/modules/claims/claims.service';
import { ClaimStatus, ErrorCode, Role } from '@kashyap/contracts';

describe('ClaimsService (State Transitions & Governance)', () => {
  let claimsService: ClaimsService;
  let mockDb: any;
  let mockClaimRepo: any;
  let mockPersonRepo: any;
  let mockBranchRepo: any;
  let mockUserRepo: any;
  let mockAuditOutboxRepo: any;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      transaction: jest.fn((cb) => cb({
        query: jest.fn(async (sql, params) => {
          if (sql.includes('FROM media_assets')) {
            return {
              rows: [{
                id: params[0],
                uploader_user_id: 'u-401',
                quarantine_status: 'CLEAN',
                retention_status: 'ACTIVE',
              }],
            };
          }
          if (sql.includes('FROM user_accounts')) {
            return { rows: [{ id: params[0], phone_number: '9841000001', person_id: null }] };
          }
          if (sql.includes('FROM persons WHERE id = $1')) {
            return { rows: [{ id: params[0], is_claimed: false, claimed_user_id: null, branch_id: 'b-001' }] };
          }
          if (sql.includes('FROM profile_claims WHERE target_person_id') || sql.includes('FROM profile_claims WHERE claimant_user_id')) {
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO profile_claims')) {
            return {
              rows: [{
                id: 'claim_123',
                target_person_id: params[0],
                claimant_user_id: params[1],
                status: 'PENDING_TIER1',
                relationship_description: params[2],
                known_family_members: [],
                statement_of_truth: true,
                resubmission_count: 0,
                version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          if (sql.includes('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE')) {
            return {
              rows: [{
                id: params[0],
                target_person_id: 'p-401',
                claimant_user_id: 'u-401',
                status: 'PENDING_TIER1',
                relationship_description: 'I am son',
                statement_of_truth: true,
                resubmission_count: 0,
                version: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          if (sql.includes('UPDATE profile_claims')) {
            return {
              rows: [{
                id: params[params.length - 1],
                target_person_id: 'p-401',
                claimant_user_id: 'u-401',
                status: params[0],
                tier1_decision: params[2] || null,
                version: 2,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          return { rows: [] };
        }),
      })),
    };

    mockClaimRepo = {
      findById: jest.fn(async (id) => ({
        id,
        target_person_id: 'p-401',
        claimant_user_id: 'u-401',
        status: ClaimStatus.PENDING_TIER1,
        relationship_description: 'Son',
        statement_of_truth: true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      findEvidenceByClaimId: jest.fn(async () => [
        {
          id: 'ev-1',
          claim_id: 'claim_123',
          media_asset_id: 'med-001',
          document_type: 'family_photo',
          description: 'Family Photo',
          created_at: new Date().toISOString(),
        },
      ]),
      listAll: jest.fn(async () => []),
    };

    mockPersonRepo = {
      findById: jest.fn(async (id) => ({
        id,
        gender: 'MALE',
        living_status: 'LIVING',
        generation: 4,
        is_claimed: false,
        branch_id: 'b-001',
      })),
      findNamesByPersonId: jest.fn(async () => [
        { language: 'ne', full_name: 'दिनेश अधिकारी' },
        { language: 'en', full_name: 'Dinesh Adhikari' },
      ]),
    };

    mockBranchRepo = {
      findById: jest.fn(async (id) => ({ id, name_nepali: 'कास्की शाखा' })),
    };

    mockUserRepo = {
      findById: jest.fn(async (id) => ({ id, phone_number: '9841000001' })),
    };

    mockAuditOutboxRepo = {
      recordAuditIntent: jest.fn(async () => {}),
    };

    claimsService = new ClaimsService(
      mockDb,
      mockClaimRepo,
      mockPersonRepo,
      mockBranchRepo,
      mockUserRepo,
      mockAuditOutboxRepo,
    );
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
            documentType: 'family_photo',
            description: 'Family photo with branch elders',
          },
        ],
        statementOfTruth: true,
      });

      expect(claim).toBeDefined();
      expect(claim.status).toBe(ClaimStatus.PENDING_TIER1);
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
  });

  describe('Self-Verification Prohibition & Governance (CLAIM-FR-008)', () => {
    it('should prevent an administrator from verifying their own claim (recusal)', async () => {
      const adminUser = {
        id: 'u-401',
        phoneNumber: '9841000001',
        roles: [Role.BRANCH_VERIFIER],
        roleAssignments: [{ role: Role.BRANCH_VERIFIER, branchId: 'b-001' }],
      };

      await expect(
        claimsService.tier1Review('claim_123', adminUser as any, {
          decision: 'VOUCHED',
          notes: 'Self approval attempt',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        },
      });
    });

    it('should allow independent verifier to vouch claim', async () => {
      const verifierUser = {
        id: 'u-verifier-01',
        phoneNumber: '9841000002',
        roles: [Role.BRANCH_VERIFIER],
        roleAssignments: [{ role: Role.BRANCH_VERIFIER, branchId: 'b-001' }],
      };

      const reviewed = await claimsService.tier1Review('claim_123', verifierUser as any, {
        decision: 'VOUCHED',
        notes: 'Vouched by branch elder',
      });

      expect(reviewed.status).toBe(ClaimStatus.PENDING_TIER2);
    });
  });
});
