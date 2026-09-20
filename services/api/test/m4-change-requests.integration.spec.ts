import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { ChangeRequestsService } from '../src/modules/change-requests/change-requests.service';
import { ChangeRequestType, ChangeRequestStatus, Role, ErrorCode } from '@kashyap/contracts';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Milestone 4: Genealogy Change Requests & Concurrency Isolation Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let changeRequestsService: ChangeRequestsService;
  let isoDb: DisposableDatabase;

  let testBranchId: string;
  let destBranchId: string;
  let requesterId: string;
  let otherUserId: string;
  let branchAdminId: string;
  let superAdminId: string;
  let personId: string;

  beforeAll(async () => {
    isoDb = await createDisposableDatabase('chg');
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    process.env.DB_NAME = isoDb.dbName;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    changeRequestsService = moduleRef.get<ChangeRequestsService>(ChangeRequestsService);
    await assertDatabaseIsolation(db, isoDb.dbName);
    console.log(`[DISPOSABLE DB TARGET] Change Requests test verified running exclusively against target: ${isoDb.dbName}`);

    const suffix = Math.floor(100000 + Math.random() * 900000);
    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    const bRes = await db.query(
      "INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-CHG-" + suffix + "', 'तनहुँ परीक्षण शाखा', 'Tanahun Test Branch') RETURNING id",
    );
    testBranchId = bRes.rows[0].id;

    const b2Res = await db.query(
      "INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-DST-" + suffix + "', 'कास्की परीक्षण शाखा', 'Kaski Test Branch') RETURNING id",
    );
    destBranchId = b2Res.rows[0].id;

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
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    requesterId = u1Res.rows[0].id;

    const uOtherRes = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    otherUserId = uOtherRes.rows[0].id;

    const u2Res = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    branchAdminId = u2Res.rows[0].id;
    await db.query(
      'INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, $3)',
      [branchAdminId, Role.BRANCH_ADMIN, testBranchId],
    );

    const saRes = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    superAdminId = saRes.rows[0].id;
    await db.query(
      'INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, NULL)',
      [superAdminId, Role.SUPER_ADMIN],
    );
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (isoDb) {
      await isoDb.cleanup();
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

  it('2. should enforce authorization on getRequestById and listRequests', async () => {
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.EDIT_PERSON,
      proposedChanges: { occupation: 'Data Scientist' },
      reason: 'Privacy and authorization test',
    });

    // Requester can view own request
    const requesterActor = {
      id: requesterId,
      roles: [Role.REGISTERED_USER],
    } as any;
    const selfView = await changeRequestsService.getRequestById(req.id, requesterActor);
    expect(selfView.id).toBe(req.id);

    // Other non-reviewer user cannot view request
    const otherActor = {
      id: otherUserId,
      roles: [Role.REGISTERED_USER],
      roleAssignments: [],
    } as any;
    await expect(
      changeRequestsService.getRequestById(req.id, otherActor),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.FORBIDDEN,
      },
    });

    // List requests for member only returns member requests
    const memberList = await changeRequestsService.listRequests(requesterActor);
    expect(memberList.every((r) => r.requesterUserId === requesterId)).toBe(true);
  });

  it('3. should reject self-review of change proposals (recusal requirement)', async () => {
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

  it('4. should detect stale base version conflict (HTTP 409) and commit CONFLICT_DETECTED state', async () => {
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

  it('5. should successfully merge change request on version match and advance person version', async () => {
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
        occupation: 'Reviewed civil engineer',
        birthPlace: 'Fictional Pokhara birthplace',
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
    const details = await db.query('SELECT occupation, birth_place FROM persons WHERE id = $1', [personId]);
    expect(details.rows[0]).toEqual({ occupation: 'Reviewed civil engineer', birth_place: 'Fictional Pokhara birthplace' });

    // Verify names updated
    const names = await db.query("SELECT full_name FROM person_names WHERE person_id = $1 AND language = 'ne'", [personId]);
    expect(names.rows[0].full_name).toBe('सुरेश प्रसाद अधिकारी');
  });

  it('6. should handle ADD_CHILD change request creation and merge', async () => {
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.ADD_CHILD,
      proposedChanges: {
        gender: 'MALE',
        livingStatus: 'LIVING',
        primaryNameNepali: 'रोहित अधिकारी',
        primaryNameEnglish: 'Rohit Adhikari',
      },
      reason: 'Adding newborn child',
    });

    const adminUser = {
      id: branchAdminId,
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: testBranchId }],
    } as any;

    const approved = await changeRequestsService.reviewRequest(req.id, adminUser, {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Child verified from birth registration',
    });

    expect(approved.status).toBe(ChangeRequestStatus.APPROVED);

    // Verify child was created and parent_link established
    const links = await db.query('SELECT * FROM parent_links WHERE parent_id = $1', [personId]);
    expect(links.rows.length).toBeGreaterThanOrEqual(1);
    const childId = links.rows[0].child_id;

    const childNames = await db.query('SELECT full_name FROM person_names WHERE person_id = $1', [childId]);
    expect(childNames.rows.some((n: any) => n.full_name === 'रोहित अधिकारी')).toBe(true);
  });

  it('7. should handle BRANCH_TRANSFER with dual-branch authority requirement', async () => {
    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.BRANCH_TRANSFER,
      proposedChanges: {
        destinationBranchId: destBranchId,
      },
      reason: 'Permanent migration to Kaski branch',
    });

    // Single branch admin (source branch only) fails dual authority check
    const singleBranchAdmin = {
      id: branchAdminId,
      roles: [Role.BRANCH_ADMIN],
      roleAssignments: [{ role: Role.BRANCH_ADMIN, branchId: testBranchId }],
    } as any;

    await expect(
      changeRequestsService.reviewRequest(req.id, singleBranchAdmin, {
        status: ChangeRequestStatus.APPROVED,
        reviewNotes: 'Trying to approve transfer without destination authority',
      }),
    ).rejects.toMatchObject({
      response: {
        errorCode: ErrorCode.BRANCH_MISMATCH,
      },
    });

    // Super Admin has universal branch authority and succeeds
    const superAdminUser = {
      id: superAdminId,
      roles: [Role.SUPER_ADMIN],
      roleAssignments: [],
    } as any;

    const approved = await changeRequestsService.reviewRequest(req.id, superAdminUser, {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Transfer approved by Super Admin',
    });

    expect(approved.status).toBe(ChangeRequestStatus.APPROVED);

    // Verify target person branch_id was updated to destination branch
    const pRes = await db.query('SELECT branch_id FROM persons WHERE id = $1', [personId]);
    expect(pRes.rows[0].branch_id).toBe(destBranchId);
  });
  it('8. should approve ADD_SPOUSE request and establish verified confidence and provenance in spouse_links', async () => {
    const spouseNameNe = 'सुनिता अधिकारी';
    const spouseNameEn = 'Sunita Adhikari';

    const req = await changeRequestsService.submitRequest(requesterId, {
      targetPersonId: personId,
      type: ChangeRequestType.ADD_SPOUSE,
      proposedChanges: {
        primaryNameNepali: spouseNameNe,
        primaryNameEnglish: spouseNameEn,
        gender: 'FEMALE',
        marriageDateBs: '2060-02-10',
      },
      reason: 'Adding verified spouse with citizenship certificate',
    });

    const adminActor = {
      id: superAdminId,
      roles: [Role.SUPER_ADMIN],
      roleAssignments: [{ role: Role.SUPER_ADMIN, branchId: null }],
    } as any;

    const approvalResult = await changeRequestsService.reviewRequest(req.id, adminActor, {
      status: ChangeRequestStatus.APPROVED,
      reviewNotes: 'Marriage certificate verified by central authority',
    });

    expect(approvalResult.status).toBe(ChangeRequestStatus.APPROVED);

    // Verify spouse_links entry in database has explicit VERIFIED confidence and provenance
    const spouseRes = await db.query(
      'SELECT confidence, provenance, status FROM spouse_links WHERE person_id = $1',
      [personId],
    );

    expect(spouseRes.rows.length).toBeGreaterThan(0);
    const link = spouseRes.rows[0];
    expect(link.confidence).toBe('VERIFIED');
    expect(link.provenance).toBeDefined();
    expect(link.provenance.changeRequestId).toBe(req.id);
    expect(link.provenance.approvedBy).toBe(superAdminId);
  });
});
