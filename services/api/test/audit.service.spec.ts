import { AuditService } from '../src/modules/audit/audit.service';
import { AuditAction } from '@kashyap/contracts';

describe('AuditService (Append-Only Cryptographic Chain Tests)', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
  });

  it('should record audit actions and compute SHA-256 hash chains', async () => {
    const entry1 = await auditService.record(
      AuditAction.LOGIN,
      'user_account',
      'u-401',
      'u-401',
      'VERIFIED_MEMBER',
    );

    expect(entry1).toBeDefined();
    expect(entry1.prevRecordHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(entry1.currentRecordHash).toHaveLength(64);

    const entry2 = await auditService.record(
      AuditAction.CLAIM_SUBMIT,
      'profile_claim',
      'claim_001',
      'u-401',
      'VERIFIED_MEMBER',
    );

    expect(entry2.prevRecordHash).toBe(entry1.currentRecordHash);
    expect(entry2.currentRecordHash).toHaveLength(64);

    const logs = await auditService.listAuditLogs();
    expect(logs.length).toBe(2);
  });
});
