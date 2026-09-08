import { AuditService } from '../src/modules/audit/audit.service';
import { AuditAction } from '@kashyap/contracts';

describe('AuditService (Append-Only Cryptographic Chain & Tamper Detection)', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
  });

  it('should record audit actions and build a valid cryptographic SHA-256 hash chain', async () => {
    const entry1 = await auditService.record(
      AuditAction.LOGIN,
      'user_account',
      'u-401',
      'u-401',
      'VERIFIED_MEMBER',
    );

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

    const entry3 = await auditService.record(
      AuditAction.CLAIM_APPROVE,
      'profile_claim',
      'claim_001',
      'u-admin',
      'SUPER_ADMIN',
    );

    expect(entry3.prevRecordHash).toBe(entry2.currentRecordHash);

    // Verify chain integrity
    const verification = auditService.verifyChainIntegrity();
    expect(verification.isValid).toBe(true);
  });

  it('should detect tampering if an adversary alters historic audit log data', async () => {
    await auditService.record(AuditAction.LOGIN, 'user_account', 'u-401');
    await auditService.record(AuditAction.CLAIM_SUBMIT, 'profile_claim', 'claim_001');
    await auditService.record(AuditAction.CLAIM_APPROVE, 'profile_claim', 'claim_001');

    // Chain is valid initially
    expect(auditService.verifyChainIntegrity().isValid).toBe(true);

    // Tampering with index 1 (illicitly changing actor or action)
    const logs = await auditService.listAuditLogs();
    (logs[1] as any).actorId = 'u-malicious-attacker';

    // Verification must detect the tampering
    const tamperedCheck = auditService.verifyChainIntegrity();
    expect(tamperedCheck.isValid).toBe(false);
    expect(tamperedCheck.corruptedAtIndex).toBe(1);
  });
});
