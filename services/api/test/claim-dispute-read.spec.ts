import { ClaimStatus, DisputeStatus, Role } from '@kashyap/contracts';
import { ClaimsService } from '../src/modules/claims/claims.service';

const claimId = '00000000-0000-4000-8000-000000000011';
const disputeId = '00000000-0000-4000-8000-000000000012';

describe('Private Super Admin dispute inspection', () => {
  let service: ClaimsService, repo: any;
  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue({ id: claimId, status: ClaimStatus.DISPUTED }),
      findDisputesByClaimId: jest.fn().mockResolvedValue([{
        id: disputeId, claim_id: claimId, disputant_user_id: 'disputant',
        reason: 'Private fictional reason', status: DisputeStatus.OPEN,
        resolution_notes: null, resolved_by: null, resolved_at: null,
        created_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z',
        phone_number: 'NEVER EXPOSE', internal_column: 'NEVER EXPOSE',
      }]),
    };
    service = new ClaimsService({} as any, repo, {} as any, {} as any, {} as any, {} as any);
  });
  it.each([undefined, { id: 'member', roles: [Role.REGISTERED_USER] },
    { id: 'verifier', roles: [Role.BRANCH_VERIFIER] }, { id: 'branch-admin', roles: [Role.BRANCH_ADMIN] },
    { id: 'central', roles: [Role.CENTRAL_ADMIN] }])('denies non-adjudicators before any database access: %p', async actor => {
    await expect(service.listClaimDisputes(claimId, actor as any)).rejects.toMatchObject({ status: 403 });
    expect(repo.findById).not.toHaveBeenCalled(); expect(repo.findDisputesByClaimId).not.toHaveBeenCalled();
  });
  it('validates identity and existence before reading private disputes', async () => {
    const admin = { id: 'admin', roles: [Role.SUPER_ADMIN] } as any;
    await expect(service.listClaimDisputes('invalid', admin)).rejects.toMatchObject({ status: 400 });
    expect(repo.findById).not.toHaveBeenCalled();
    repo.findById.mockResolvedValue(null);
    await expect(service.listClaimDisputes(claimId, admin)).rejects.toMatchObject({ status: 404 });
    expect(repo.findDisputesByClaimId).not.toHaveBeenCalled();
  });
  it('returns only the explicit adjudication contract, including terminal resolution evidence', async () => {
    const admin = { id: 'admin', roles: [Role.SUPER_ADMIN] } as any;
    const result = await service.listClaimDisputes(claimId, admin);
    expect(result[0]).toMatchObject({ id: disputeId, claimId, disputantUserId: 'disputant', reason: 'Private fictional reason', status: DisputeStatus.OPEN });
    expect(result[0]).not.toHaveProperty('phone_number'); expect(result[0]).not.toHaveProperty('internal_column');
    repo.findDisputesByClaimId.mockResolvedValue([{ ...(await repo.findDisputesByClaimId.mock.results[0].value)[0],
      status: DisputeStatus.RESOLVED, resolution_notes: 'Preserved decision', resolved_by: 'admin', resolved_at: '2026-10-29T01:00:00Z' }]);
    expect((await service.listClaimDisputes(claimId, admin))[0]).toMatchObject({ status: DisputeStatus.RESOLVED, resolutionNotes: 'Preserved decision', resolvedByUserId: 'admin' });
  });
});
