import { ForbiddenException } from '@nestjs/common';
import { ClaimsController } from '../src/modules/claims/claims.controller';

describe('Legacy claim-ID dispute HTTP authorization boundary', () => {
  it('requires actor-aware Person authorization instead of invoking the raw dispute mutation', async () => {
    const actor = { id: 'synthetic-outsider', roles: [], branchIds: [], roleAssignments: [] } as any;
    const body = { reason: 'Fictional private target' };
    const raw = { fileDispute: jest.fn().mockResolvedValue({ id: 'unauthorized-dispute' }) };
    const members = { submitForClaim: jest.fn().mockRejectedValue(new ForbiddenException('Private Person')) };
    const controller = new (ClaimsController as any)(raw, members);
    await expect(controller.fileDispute('claim-id', actor, body)).rejects.toMatchObject({ status: 403 });
    expect(members.submitForClaim).toHaveBeenCalledWith('claim-id', actor, body);
    expect(raw.fileDispute).not.toHaveBeenCalled();
  });

  it('preserves the authorized legacy detail response without exposing an alternate mutation path', async () => {
    const actor = { id: 'synthetic-member' } as any;
    const body = { reason: 'Fictional authorized target' };
    const saved = { id: 'saved-dispute', claimId: 'claim-id', status: 'OPEN' };
    const raw = { fileDispute: jest.fn().mockResolvedValue({ id: 'wrong-path' }) };
    const members = { submitForClaim: jest.fn().mockResolvedValue(saved) };
    const controller = new (ClaimsController as any)(raw, members);
    await expect(controller.fileDispute('claim-id', actor, body)).resolves.toEqual(saved);
    expect(members.submitForClaim).toHaveBeenCalledWith('claim-id', actor, body);
    expect(raw.fileDispute).not.toHaveBeenCalled();
  });
});
