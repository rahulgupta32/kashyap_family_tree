import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { ChangeRequestsService } from '../src/modules/change-requests/change-requests.service';
import { ChangeRequestType, ChangeRequestStatus, Role, ErrorCode } from '@kashyap/contracts';

describe('Milestone 4: Genealogy Change Requests & Concurrency Isolation Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let changeRequestsService: ChangeRequestsService;

  let testBranchId: string;
  let requesterId: string;
  let branchAdminId: string;
  let superAdminId: string;
  let personId: string;

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
    changeRequestsService = moduleRef.get<ChangeRequestsService>(ChangeRequestsService);

    const suffix = Math.floor(100000 + Math.random() * 900000);
    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    const bRes = await db.query(
      `INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-CHG-${suffix}', 'तनहुँ परीक्षण शाखा', 'Tanahun Test Branch') RETURNING id`,
    );
    testBranchId = bRes.rows[0].id;

    const pRes = await db.query(
      'INSERT INTO persons (gender, living_status, branch_id, generation, birth_year_bs, version) VALUES ($1, $2, $3, $4, $5, 1) RETURNING id',
      ['MALE', 'LIVING', testBranchId, 4, 2040],
    );
    personId = pRes.rows[0].id;

    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'सुरेश', 'अधिकारी', 'सुरेश अधिकारी', 'ne', TRUE)",
      [personId],
    );
    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'Suresh', 'Adhikari', 'Suresh Adhikari', 'en', TRUE)",
      [personId],
    );

    const u1Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    requesterId = u1Res.rows[0].id;

    const u2Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('${randPhone()}', TRUE) RETURNING id`,
    );
    branchAdminId = u2Res.rows[0].id;
    await db.query(
      'INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, $3)',
      [branchAdminId, Role.BRANCH_ADMIN, testBranchId],
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
      await db.query('DELETE FROM change_request_evidence_attachments WHERE change_request_id IN (SELECT id FROM genealogy_change_requests WHERE requester_user_id = $1);', [requesterId]);
      await db.query('DELETE FROM genealogy_change_requests WHERE requester_user_id = $1;', [requesterId]);
      await db.query('DELETE FROM user_roles WHERE user_id IN ($1, $2, $3);', [requesterId, branchAdminId, superAdminId]);
      await db.query('UPDATE persons SET claimed_user_id = NULL WHERE id = $1;', [personId]);
      await db.query('UPDATE user_accounts SET person_id = NULL, is_active = FALSE WHERE id IN ($1, $2, $3);', [requesterId, branchAdminId, superAdminId]);
      await db.query('DELETE FROM person_names WHERE person_id = $1;', [personId]);
      await db.query('DELETE FROM persons WHERE id = $1;', [personId]);
      await db.query('DELETE FROM branches WHERE id = $1;', [testBranchId]);
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('1. should submit change request with base version, snapshot and visual diff', async () => {
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: {
        birthDateBs: '2040-05-15',
        occupation: 'Civil Engineer',
      },
      reason: 'Updating verified birth date from family records',
    });

    expect(req.id).toBeDefined();
    expect(req.status).toBe(ChangeRequestStatus.PENDING);
    expect(req.baseVersion).toBe(1);
    expect(req.visualDiff).toBeDefined();
    expect(req.visualDiff?.fields.length).toBeGreaterThan(0);
  });

  it('2. should reject self-review of change proposals (recusal requirement)', async () => {
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: { occupation: 'Doctor' },
      reason: 'Self proposal',
    });

    const requesterAsReviewer = {
      id: requesterId,
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: testBranchId }],
    } as any;

    await expect(
      changeRequestsService.reviewRequest(req.id, requesterAsReviewer, {
        status: ChangeRequestStatus.APPROVED,
        reviewNotes: 'Trying to self approve',
      }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
      },
    });
  });

  it('3. should detect stale base version conflict (HTTP 409) and commit CONFLICT_DETECTED state', async () => {
    // 1. Requester submits change request at person version = 1
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: { occupation: 'Architect' },
      reason: 'Original proposal',
    });
    expect(req.baseVersion).toBe(1);

    // 2. Someone concurrently modifies the person in database, bumping version to 2
    await db.query('UPDATE persons SET version = 2, updated_at = NOW() WHERE id = $1', [personId]);

    // 3. Reviewer attempts to approve stale request -> fails with 409 Conflict
    const adminUser = {
      id: branchAdminId,
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: testBranchId }],
    } as any;

    await expect(
      changeRequestsService.reviewRequest(req.id, adminUser, {
        status: ChangeRequestStatus.APPROVED,
        reviewNotes: 'Approval attempt on stale base version',
      }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.STALE_UPDATE_DETECTED,
      },
    });

    // 4. Assert transaction committed CONFLICT_DETECTED state in database
    const reqRow = await db.query('SELECT status FROM genealogy_change_requests WHERE id = $1', [req.id]);
    expect(reqRow.rows[0].status).toBe('CONFLICT_DETECTED');

    // 5. Assert audit outbox recorded CHANGE_REQUEST_CONFLICT_DETECTED
    const auditRes = await db.query(
      "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'CHANGE_REQUEST_CONFLICT_DETECTED'",
      [req.id],
    );
    expect(auditRes.rows.length).toBe(1);
  });

  it('4. should successfully merge change request on version match and advance person version', async () => {
    // Current person version is 2
    const currentPerson = await db.query('SELECT version FROM persons WHERE id = $1', [personId]);
    const currentVer = currentPerson.rows[0].version;

    // Resubmit or submit fresh request matching current version
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: {
        primaryNameNepali: 'सुरेश प्रसाद अधिकारी',
        livingStatus: 'LIVING',
      },
      reason: 'Adding middle name Prasad',
    });
    expect(req.baseVersion).toBe(currentVer);

    const adminUser = {
      id: branchAdminId,
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: testBranchId }],
    } as any;

    const merged = await changeRequestsService.reviewRequest(req.id, adminUser, {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Approved after verification',
    });

    expect(merged.status).toBe(ChangeRequestStatus.APPROVED);

    // Verify person version advanced
    const updatedPerson = await db.query('SELECT version FROM persons WHERE id = $1', [personId]);
    expect(updatedPerson.rows[0].version).toBe(currentVer + 1);

    // Verify names updated
    const names = await db.query("SELECT full_name FROM person_names WHERE person_id = $1 AND language = 'ne'", [personId]);
    expect(names.rows[0].full_name).toBe('सुरेश प्रसाद अधिकारी');
  });
});
