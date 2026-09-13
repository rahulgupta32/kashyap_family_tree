import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { ClaimStatus, DisputeStatus, Role, ErrorCode } from '@kashyap/contracts';

describe('Milestone 4: Governed Claims & Two-Tier Verification Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let claimsService: ClaimsService;

  let testBranchId: string;
  let claimant1Id: string;
  let claimant2Id: string;
  let verifier1Id: string;
  let superAdminId: string;
  let person1Id: string;
  let person2Id: string;

  beforeAll(async () => {
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    claimsService = moduleRef.get<ClaimsService>(ClaimsService);

    const suffix = Math.floor(100000 + Math.random() * 900000);
    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    // Seed test data in PostgreSQL
    const bRes = await db.query(
      `INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-CLM-${suffix}', 'कास्की परीक्षण शाखा', 'Kaski Test Branch') RETURNING id`,
    );
    testBranchId = bRes.rows[0].id;

    const p1Res = await db.query(
      'INSERT INTO persons (gender, living_status, branch_id, generation, version) VALUES ($1, $2, $3, $4, 1) RETURNING id',
      ['MALE', 'LIVING', testBranchId, 4],
    );
    person1Id = p1Res.rows[0].id;

    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'राम', 'अधिकारी', 'राम अधिकारी', 'ne', TRUE)",
      [person1Id],
    );
    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'Ram', 'Adhikari', 'Ram Adhikari', 'en', TRUE)",
      [person1Id],
    );

    const p2Res = await db.query(
      'INSERT INTO persons (gender, living_status, branch_id, generation, version) VALUES ($1, $2, $3, $4, 1) RETURNING id',
      ['FEMALE', 'LIVING', testBranchId, 4],
    );
    person2Id = p2Res.rows[0].id;

    // Users
    const u1Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    claimant1Id = u1Res.rows[0].id;

    const u2Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    claimant2Id = u2Res.rows[0].id;

    const v1Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    verifier1Id = v1Res.rows[0].id;
    await db.query(
      'INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, $3)',
      [verifier1Id, Role.BRANCH_VERIFIER, testBranchId],
    );

    const saRes = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    superAdminId = saRes.rows[0].id;
    await db.query(
      'INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, NULL)',
      [superAdminId, Role.SUPER_ADMIN],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM claim_evidence_attachments WHERE claim_id IN (SELECT id FROM profile_claims WHERE claimant_user_id IN ($1, $2));', [claimant1Id, claimant2Id]);
      await db.query('DELETE FROM claim_disputes WHERE claim_id IN (SELECT id FROM profile_claims WHERE claimant_user_id IN ($1, $2));', [claimant1Id, claimant2Id]);
      await db.query('DELETE FROM profile_claims WHERE claimant_user_id IN ($1, $2);', [claimant1Id, claimant2Id]);
      await db.query('DELETE FROM user_roles WHERE user_id IN ($1, $2, $3, $4);', [claimant1Id, claimant2Id, verifier1Id, superAdminId]);
      await db.query('UPDATE persons SET claimed_user_id = NULL WHERE id IN ($1, $2);', [person1Id, person2Id]);
      await db.query('UPDATE user_accounts SET person_id = NULL, is_active = FALSE WHERE id IN ($1, $2, $3, $4);', [claimant1Id, claimant2Id, verifier1Id, superAdminId]);
      await db.query('DELETE FROM person_names WHERE person_id IN ($1, $2);', [person1Id, person2Id]);
      await db.query('DELETE FROM persons WHERE id IN ($1, $2);', [person1Id, person2Id]);
      await db.query('DELETE FROM branches WHERE id = $1;', [testBranchId]);
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('1. should submit claim, create transition and record audit intent in outbox', async () => {
    const claim = await claimsService.submitClaim(claimant1Id, {
      targetPersonId: person1Id,
      relationshipDescription: 'I am Ram Adhikari',
      knownFamilyMembers: ['Hari Adhikari'],
      evidenceAttachments: [
        {
          mediaAssetId: '00000000-0000-0000-0000-000000000101',
          documentType: 'family_photo',
          description: 'Family photograph with clan elders',
        },
      ],
      statementOfTruth: true,
    });

    expect(claim.id).toBeDefined();
    expect(claim.status).toBe(ClaimStatus.PENDING_TIER1);
    expect(claim.evidenceAttachments.length).toBe(1);
    expect(claim.evidenceAttachments[0].mediaUrl).toContain('https://storage.kashyap.org.np/evidence/');

    // Check transition table
    const transRes = await db.query(
      'SELECT * FROM workflow_state_transitions WHERE entity_id = $1 ORDER BY created_at DESC',
      [claim.id],
    );
    expect(transRes.rows.length).toBeGreaterThan(0);
    expect(transRes.rows[0].to_state).toBe('PENDING_TIER1');

    // Check audit outbox
    const auditRes = await db.query(
      "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'CLAIM_SUBMITTED'",
      [claim.id],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('2. should reject duplicate active claim for same target person', async () => {
    await expect(
      claimsService.submitClaim(claimant2Id, {
        targetPersonId: person1Id,
        relationshipDescription: 'Another claim',
        statementOfTruth: true,
      }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
      },
    });
  });

  it('3. should support correction request and resubmission workflow', async () => {
    const activeClaim = await claimsService.listClaims(undefined, { claimantUserId: claimant1Id });
    const claimId = activeClaim[0].id;

    const verifierUser = {
      id: verifier1Id,
      roles: [Role.BRANCH_VERIFIER],
      roleAssignments: [{ role: Role.BRANCH_VERIFIER, branchId: testBranchId }],
    } as any;

    // 1. Request correction
    const corrected = await claimsService.requestCorrection(claimId, verifierUser, {
      notes: 'Please attach clearer family photo',
    });
    expect(corrected.status).toBe(ClaimStatus.CORRECTION_REQUESTED);
    expect(corrected.correctionRequestNotes).toBe('Please attach clearer family photo');

    // 2. Claimant resubmits
    const resubmitted = await claimsService.resubmit(claimId, claimant1Id, {
      relationshipDescription: 'Updated with clearer photo',
      evidenceAttachments: [
        {
          mediaAssetId: '00000000-0000-0000-0000-000000000102',
          documentType: 'elder_voucher',
          description: 'Elder written statement',
        },
      ],
      statementOfTruth: true,
    });
    expect(resubmitted.status).toBe(ClaimStatus.PENDING_TIER1);
    expect(resubmitted.resubmissionCount).toBe(1);
  });

  it('4. should enforce Tier 1 vouch and Tier 2 approval separation of duties', async () => {
    const activeClaim = await claimsService.listClaims(undefined, { claimantUserId: claimant1Id });
    const claimId = activeClaim[0].id;

    const verifierUser = {
      id: verifier1Id,
      roles: [Role.BRANCH_VERIFIER],
      roleAssignments: [{ role: Role.BRANCH_VERIFIER, branchId: testBranchId }],
    } as any;

    // Tier 1 Vouch
    const vouched = await claimsService.tier1Review(claimId, verifierUser, {
      decision: 'VOUCHED',
      notes: 'Vouched by branch elder',
    });
    expect(vouched.status).toBe(ClaimStatus.PENDING_TIER2);
    expect(vouched.tier1ReviewedBy).toBe(verifier1Id);

    // Tier 2 Self/Separation check: Tier 1 reviewer cannot approve Tier 2
    const fakeSuperAdminSameAsTier1 = {
      id: verifier1Id,
      roles: [Role.SUPER_ADMIN],
      roleAssignments: [{ role: Role.SUPER_ADMIN, branchId: null }],
    } as any;

    await expect(
      claimsService.tier2Review(claimId, fakeSuperAdminSameAsTier1, {
        decision: 'APPROVED',
        notes: 'Attempting invalid same-reviewer approval',
      }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
      },
    });

    // Valid Super Admin Tier 2 Approval
    const superAdminUser = {
      id: superAdminId,
      roles: [Role.SUPER_ADMIN],
      roleAssignments: [{ role: Role.SUPER_ADMIN, branchId: null }],
    } as any;

    const approvedResult = await claimsService.tier2Review(claimId, superAdminUser, {
      decision: 'APPROVED',
      notes: 'Final Super Admin verification link established',
    });
    expect(approvedResult.claim.status).toBe(ClaimStatus.APPROVED);
    expect(approvedResult.alreadyApproved).toBe(false);

    // Verify linkage in database
    const userRow = await db.query('SELECT person_id FROM user_accounts WHERE id = $1', [claimant1Id]);
    expect(userRow.rows[0].person_id).toBe(person1Id);

    const personRow = await db.query('SELECT is_claimed, claimed_user_id, version FROM persons WHERE id = $1', [person1Id]);
    expect(personRow.rows[0].is_claimed).toBe(true);
    expect(personRow.rows[0].claimed_user_id).toBe(claimant1Id);
    expect(personRow.rows[0].version).toBeGreaterThan(1);

    // GENUINE IDEMPOTENCY: calling tier 2 review again returns alreadyApproved = true
    const reApprovedResult = await claimsService.tier2Review(claimId, superAdminUser, {
      decision: 'APPROVED',
      notes: 'Re-approval should be idempotent',
    });
    expect(reApprovedResult.alreadyApproved).toBe(true);
    expect(reApprovedResult.claim.status).toBe(ClaimStatus.APPROVED);
  });

  it('5. should support dispute filing and dispute resolution', async () => {
    const activeClaim = await claimsService.listClaims(undefined, { claimantUserId: claimant1Id });
    const claimId = activeClaim[0].id;

    // Disputant files dispute
    const dispute = await claimsService.fileDispute(claimId, claimant2Id, {
      reason: 'I am the real Ram Adhikari, claimant 1 is an imposter',
      evidenceAttachments: [
        {
          mediaAssetId: '00000000-0000-0000-0000-000000000103',
          documentType: 'clan_record',
          description: 'Historical vamshavali photocopy',
        },
      ],
    });

    expect(dispute.status).toBe(DisputeStatus.OPEN);

    const claimAfterDispute = await claimsService.getClaimById(claimId);
    expect(claimAfterDispute.status).toBe(ClaimStatus.DISPUTED);

    // Super Admin dismisses dispute
    const superAdminUser = {
      id: superAdminId,
      roles: [Role.SUPER_ADMIN],
      roleAssignments: [{ role: Role.SUPER_ADMIN, branchId: null }],
    } as any;

    const resolved = await claimsService.resolveDispute(dispute.id, superAdminUser, {
      decision: 'DISMISSED',
      notes: 'Dispute lacks valid evidence; claim restored to APPROVED',
    });

    expect(resolved.status).toBe(DisputeStatus.DISMISSED);

    const claimRestored = await claimsService.getClaimById(claimId);
    expect(claimRestored.status).toBe(ClaimStatus.APPROVED);
  });
});
