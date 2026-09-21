import { ChangeRequestsService } from '../src/modules/change-requests/change-requests.service';
import { DiffService } from '../src/modules/change-requests/diff.service';
import { ChangeRequestType, ChangeRequestStatus, Role } from '@kashyap/contracts';

describe('ChangeRequestsService (Genealogy Change Governance & Workflow)', () => {
  let changeRequestsService: ChangeRequestsService;
  let mockDb: any;
  let mockPersonRepo: any;
  let mockBranchRepo: any;
  let mockAuditOutboxRepo: any;
  let diffService: DiffService;

  beforeEach(() => {
    diffService = new DiffService();

    mockDb = {
      query: jest.fn(),
      transaction: jest.fn((cb) => cb({
        query: jest.fn(async (sql, params) => {
          if (sql.includes('FROM persons WHERE id = $1')) {
            return {
              rows: [{
                id: params[0],
                version: 1,
                branch_id: 'b-001',
                gender: 'MALE',
                living_status: 'LIVING',
                generation: 4,
              }],
            };
          }
          if (sql.includes('FROM person_names WHERE person_id = $1')) {
            return {
              rows: [
                { language: 'ne', full_name: 'दिनेश अधिकारी' },
                { language: 'en', full_name: 'Dinesh Adhikari' },
              ],
            };
          }
          if (sql.includes('INSERT INTO genealogy_change_requests')) {
            return {
              rows: [{
                id: 'chg_123',
                target_person_id: params[0],
                requester_user_id: params[1],
                type: params[2],
                base_version: params[3],
                version: 1,
                proposed_changes: JSON.parse(params[4]),
                reason: params[6],
                status: 'PENDING',
                resubmission_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          if (sql.includes('SELECT * FROM genealogy_change_requests WHERE id = $1 FOR UPDATE')) {
            return {
              rows: [{
                id: params[0],
                target_person_id: 'p-401',
                requester_user_id: 'u-401',
                type: ChangeRequestType.EDIT_PERSON,
                base_version: 1,
                version: 1,
                proposed_changes: { birthPlace: 'पोखरा' },
                reason: 'Correction',
                status: 'PENDING',
                resubmission_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          if (sql.includes('UPDATE genealogy_change_requests')) {
            return {
              rows: [{
                id: params[params.length - 1],
                target_person_id: 'p-401',
                requester_user_id: 'u-401',
                type: ChangeRequestType.EDIT_PERSON,
                base_version: 1,
                version: 2,
                status: sql.includes('APPROVED') ? 'APPROVED' : 'REJECTED',
                review_notes: sql.includes('APPROVED') ? 'Verified' : 'Rejected',
                reviewed_by: 'u-admin',
                reviewed_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }],
            };
          }
          return { rows: [] };
        }),
      })),
    };

    mockPersonRepo = {
      findById: jest.fn(async (id) => ({ id, version: 1, branch_id: 'b-001' })),
    };

    mockBranchRepo = {
      findById: jest.fn(async (id) => ({ id, name_nepali: 'कास्की शाखा' })),
    };

    mockAuditOutboxRepo = {
      recordAuditIntent: jest.fn(async () => {}),
    };

    const mockLinkRepo: any = {
      checkWouldCreateCycle: jest.fn(async () => false),
      acquireGraphMutationLock: jest.fn(async () => {}),
    };
    const mockDuplicateService: any = {
      evaluateProposedPerson: jest.fn(async () => []),
      mergePersons: jest.fn(async () => ({})),
    };
    changeRequestsService = new ChangeRequestsService(
      mockDb,
      mockPersonRepo,
      mockBranchRepo,
      mockLinkRepo,
      mockAuditOutboxRepo,
      diffService,
      mockDuplicateService,
    );
  });

  it('should submit a genealogy change request with proposed diffs', async () => {
    const req = await changeRequestsService.submitRequest('u-401', {
      targetPersonId: 'p-401',
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: {
        birthPlace: 'कास्कीकोट, पोखरा',
        occupation: 'Software Engineer',
      },
      reason: 'Updating birth place and professional details',
    });

    expect(req).toBeDefined();
    expect(req.status).toBe(ChangeRequestStatus.PENDING);
    expect(req.requesterUserId).toBe('u-401');
    expect(req.proposedChanges.birthPlace).toBe('कास्कीकोट, पोखरा');
    expect(req.visualDiff).toBeDefined();
    expect(req.visualDiff?.fields.length).toBeGreaterThan(0);
  });

  it('should allow branch admin to review and approve change request', async () => {
    const adminUser = {
      id: 'u-admin',
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: 'b-001' }],
    };

    const reviewed = await changeRequestsService.reviewRequest('chg_123', adminUser as any, {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Verified with family elder',
    });

    expect(reviewed.status).toBe(ChangeRequestStatus.APPROVED);
    expect(reviewed.reviewedByUserId).toBe('u-admin');
  });

  it('should allow branch admin to reject change request with notes', async () => {
    const adminUser = {
      id: 'u-admin',
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: 'b-001' }],
    };

    const reviewed = await changeRequestsService.reviewRequest('chg_123', adminUser as any, {
      status: ChangeRequestStatus.REJECTED,
      reviewNotes: 'Contradicts verified 4-generation lineage',
    });

    expect(reviewed.status).toBe(ChangeRequestStatus.REJECTED);
  });
});
