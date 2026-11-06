import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { ClaimStatus } from '@kashyap/contracts';

describe('Claim correction resubmission version fence', () => {
  let service: ClaimsService;
  let query: jest.Mock;
  let audit: { recordAuditIntent: jest.Mock };
  const claim = {
    id: 'claim-1', claimant_user_id: 'owner', status: ClaimStatus.CORRECTION_REQUESTED,
    version: 7, resubmission_count: 1,
  };

  beforeEach(() => {
    query = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT * FROM profile_claims')) return { rows: [{ ...claim }] };
      if (sql.includes('UPDATE profile_claims')) return { rows: [{ ...claim, status: ClaimStatus.PENDING_TIER1, version: 8, resubmission_count: 2 }] };
      return { rows: [] };
    });
    audit = { recordAuditIntent: jest.fn(async () => {}) };
    service = new ClaimsService({ transaction: (callback: any) => callback({ query }) } as any,
      {} as any, {} as any, {} as any, {} as any, audit as any);
    jest.spyOn(service as any, 'mapToDetailDto').mockImplementation(async (row: any) => row);
  });

  const expectNoMutation = (queryMock: jest.Mock, auditMock: jest.Mock) => {
    expect(queryMock.mock.calls).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(auditMock).not.toHaveBeenCalled();
  };

  it('rejects a stale correction revision under the row lock before any write or audit', async () => {
    await expect(service.resubmit('claim-1', 'owner', { statementOfTruth: true, expectedVersion: 6 }))
      .rejects.toBeInstanceOf(ConflictException);
    expectNoMutation(query, audit.recordAuditIntent);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '7', null])(
    'rejects malformed supplied version %s without mutation', async (expectedVersion) => {
      await expect(service.resubmit('claim-1', 'owner', { statementOfTruth: true, expectedVersion } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expectNoMutation(query, audit.recordAuditIntent);
    },
  );

  it('checks ownership before revealing a stale-version conflict', async () => {
    await expect(service.resubmit('claim-1', 'another-account', { statementOfTruth: true, expectedVersion: 6 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expectNoMutation(query, audit.recordAuditIntent);
  });

  it.each([
    { statementOfTruth: 'true' },
    { statementOfTruth: 1 },
    { statementOfTruth: false },
    { statementOfTruth: true, relationshipDescription: {} },
    { statementOfTruth: true, relationshipDescription: '   ' },
    { statementOfTruth: true, relationshipDescription: 'x'.repeat(2001) },
    { statementOfTruth: true, knownFamilyMembers: {} },
    { statementOfTruth: true, knownFamilyMembers: [null] },
    { statementOfTruth: true, knownFamilyMembers: ['x'.repeat(201)] },
    { statementOfTruth: true, knownFamilyMembers: Array(101).fill('family context') },
    { statementOfTruth: true, claimantUserId: 'another-account' },
  ])('rejects malformed correction metadata before a transaction: %j', async (body) => {
    await expect(service.resubmit('claim-1', 'owner', body as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(audit.recordAuditIntent).not.toHaveBeenCalled();
  });

  it.each([{}, null, 'invalid', Array(6).fill({})])(
    'rejects malformed evidence collections before correction mutation: %j', async (evidenceAttachments) => {
      await expect(service.resubmit('claim-1', 'owner', {
        statementOfTruth: true, expectedVersion: 7, evidenceAttachments,
      } as any)).rejects.toBeInstanceOf(BadRequestException);
      expectNoMutation(query, audit.recordAuditIntent);
    },
  );

  it.each([7, undefined])('accepts current version or established legacy omission (%s)', async (expectedVersion) => {
    const result = await service.resubmit('claim-1', 'owner', { statementOfTruth: true, expectedVersion });
    expect(result.version).toBe(8);
    expect(result.status).toBe(ClaimStatus.PENDING_TIER1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('UPDATE profile_claims'))).toHaveLength(1);
    expect(query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO workflow_state_transitions'))).toHaveLength(1);
    expect(audit.recordAuditIntent).toHaveBeenCalledTimes(1);
    expect(audit.recordAuditIntent.mock.calls[0][0]).toMatchObject({ action: 'CLAIM_RESUBMITTED' });
  });
});
