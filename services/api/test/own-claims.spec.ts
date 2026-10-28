import { UnauthorizedException } from '@nestjs/common';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { Role } from '@kashyap/contracts';

describe('Account-owned claim discovery', () => {
  const row = { id:'claim', target_person_id:'person', status:'CORRECTION_REQUESTED',
    version:2, created_at:'2026-10-22T01:00:00Z', updated_at:'2026-10-22T02:00:00Z',
    claimant_phone_number:'private-phone', correction_request_notes:'private-note', evidence:'private' };
  let query: jest.Mock, service: ClaimsService;
  beforeEach(() => {
    query = jest.fn().mockResolvedValue({rows:[row]});
    service = new ClaimsService({query} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  it.each([Role.REGISTERED_USER,Role.SUPER_ADMIN,Role.BRANCH_VERIFIER])('scopes %s to authenticated owner, never reviewer scope', async role => {
    const result = await service.listOwnClaims({id:'owner',roles:[role],branchIds:['other']} as any);
    expect(query.mock.calls[0][1]).toEqual(['owner']);
    expect(query.mock.calls[0][0]).toContain('WHERE claimant_user_id = $1');
    expect(query.mock.calls[0][0]).toContain('ORDER BY created_at DESC, id DESC LIMIT 100');
    expect(result).toEqual([{id:'claim',targetPersonId:'person',status:row.status,version:2,
      createdAt:row.created_at,updatedAt:row.updated_at}]);
  });
  it('rejects missing identity before reading private data', async () => {
    await expect(service.listOwnClaims(undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(query).not.toHaveBeenCalled();
  });
});
