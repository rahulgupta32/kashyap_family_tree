import { ChangeRequestsService } from '../src/modules/change-requests/change-requests.service';
import { ChangeRequestType, ChangeRequestStatus } from '@kashyap/contracts';

describe('ChangeRequestsService (Genealogy Change Governance & Workflow)', () => {
  let changeRequestsService: ChangeRequestsService;

  beforeEach(() => {
    changeRequestsService = new ChangeRequestsService();
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
  });

  it('should allow admin to review and approve change request', async () => {
    const req = await changeRequestsService.submitRequest('u-401', {
      targetPersonId: 'p-401',
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: { birthPlace: 'पोखरा' },
      reason: 'Correction',
    });

    const reviewed = await changeRequestsService.reviewRequest(req.id, 'u-admin', {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Verified with family elder',
    });

    expect(reviewed.status).toBe(ChangeRequestStatus.APPROVED);
    expect(reviewed.reviewedByUserId).toBe('u-admin');
    expect(reviewed.reviewedAt).toBeDefined();
  });

  it('should allow admin to reject change request with notes', async () => {
    const req = await changeRequestsService.submitRequest('u-401', {
      targetPersonId: 'p-401',
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: { generation: 1 },
      reason: 'False generation change',
    });

    const reviewed = await changeRequestsService.reviewRequest(req.id, 'u-admin', {
      status: ChangeRequestStatus.REJECTED,
      reviewNotes: 'Contradicts verified 4-generation lineage',
    });

    expect(reviewed.status).toBe(ChangeRequestStatus.REJECTED);
  });
});
