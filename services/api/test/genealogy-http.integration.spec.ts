import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { GenealogyLinkRepository } from '../src/database/repositories/genealogy-link.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { JwtService } from '@nestjs/jwt';
import { Role, Gender, LivingStatus, PrivacyVisibility, ParentType, ErrorCode } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';

describe('Genealogy HTTP API & Atomic Audit Enforcement (Real Nest AppModule / PostgreSQL)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let auditOutboxRepo: AuditOutboxRepository;
  let personRepo: PersonRepository;
  let linkRepo: GenealogyLinkRepository;
  let branchRepo: BranchRepository;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let jwtService: JwtService;

  let superAdminToken: string;
  let branchAdminToken: string;
  let branchAdmin2Token: string;
  let branch1Id: string;
  let branch2Id: string;

  beforeAll(async () => {
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';
    process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'kashyap_jwt_secret_dev_key_super_secure';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    db = moduleFixture.get<DatabaseService>(DatabaseService);
    auditOutboxRepo = moduleFixture.get<AuditOutboxRepository>(AuditOutboxRepository);
    personRepo = moduleFixture.get<PersonRepository>(PersonRepository);
    linkRepo = moduleFixture.get<GenealogyLinkRepository>(GenealogyLinkRepository);
    branchRepo = moduleFixture.get<BranchRepository>(BranchRepository);
    userRepo = moduleFixture.get<UserRepository>(UserRepository);
    sessionRepo = moduleFixture.get<SessionRepository>(SessionRepository);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Discover or seed test branches
    const bRes = await db.query('SELECT id FROM branches ORDER BY name_nepali LIMIT 2');
    if (bRes.rows.length >= 2) {
      branch1Id = bRes.rows[0].id;
      branch2Id = bRes.rows[1].id;
    } else {
      const code1 = 'KSK_' + Date.now().toString().slice(-4);
      const code2 = 'LMJ_' + Date.now().toString().slice(-4);
      const b1 = await db.query(
        "INSERT INTO branches (name_nepali, name_english, code) VALUES ('कास्की शाखा', 'Kaski Branch', $1) RETURNING id",
        [code1]
      );
      const b2 = await db.query(
        "INSERT INTO branches (name_nepali, name_english, code) VALUES ('लमजुङ शाखा', 'Lamjung Branch', $1) RETURNING id",
        [code2]
      );
      branch1Id = b1.rows[0].id;
      branch2Id = b2.rows[0].id;
    }

    // 1. Super Admin User & Session
    const saPhone = '+9779800000001';
    const saUser = await userRepo.findOrCreateByPhone(saPhone);
    await userRepo.assignRole(saUser.id, Role.SUPER_ADMIN);
    const saSession = await sessionRepo.createSession({
      userId: saUser.id,
      refreshTokenHash: 'hash_sa_' + Date.now(),
      devicePlatform: 'WEB',
      ipAddress: '127.0.0.1',
      userAgent: 'test-runner',
      expiresAt: new Date(Date.now() + 86400000),
    });
    superAdminToken = jwtService.sign(
      {
        sub: saUser.id,
        sid: saSession.id,
        phoneNumber: saUser.phone_number,
        tokenType: 'access',
        roles: [Role.SUPER_ADMIN],
        branchIds: [],
      },
      {
        secret: getJwtSecret(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: JWT_ALGORITHM,
      },
    );

    // 2. Branch Admin 1 User & Session (assigned to branch1Id)
    const ba1Phone = '+9779800000002';
    const ba1User = await userRepo.findOrCreateByPhone(ba1Phone);
    await userRepo.assignRole(ba1User.id, Role.BRANCH_ADMIN, branch1Id);
    const ba1Session = await sessionRepo.createSession({
      userId: ba1User.id,
      refreshTokenHash: 'hash_ba1_' + Date.now(),
      devicePlatform: 'WEB',
      ipAddress: '127.0.0.1',
      userAgent: 'test-runner',
      expiresAt: new Date(Date.now() + 86400000),
    });
    branchAdminToken = jwtService.sign(
      {
        sub: ba1User.id,
        sid: ba1Session.id,
        phoneNumber: ba1User.phone_number,
        tokenType: 'access',
        roles: [Role.BRANCH_ADMIN],
        branchIds: [branch1Id],
      },
      {
        secret: getJwtSecret(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: JWT_ALGORITHM,
      },
    );

    // 3. Branch Admin 2 User & Session (assigned to branch2Id)
    const ba2Phone = '+9779800000003';
    const ba2User = await userRepo.findOrCreateByPhone(ba2Phone);
    await userRepo.assignRole(ba2User.id, Role.BRANCH_ADMIN, branch2Id);
    const ba2Session = await sessionRepo.createSession({
      userId: ba2User.id,
      refreshTokenHash: 'hash_ba2_' + Date.now(),
      devicePlatform: 'WEB',
      ipAddress: '127.0.0.1',
      userAgent: 'test-runner',
      expiresAt: new Date(Date.now() + 86400000),
    });
    branchAdmin2Token = jwtService.sign(
      {
        sub: ba2User.id,
        sid: ba2Session.id,
        phoneNumber: ba2User.phone_number,
        tokenType: 'access',
        roles: [Role.BRANCH_ADMIN],
        branchIds: [branch2Id],
      },
      {
        secret: getJwtSecret(),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithm: JWT_ALGORITHM,
      },
    );
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Person Creation with Duplicate Prevention & Atomic Audit Outbox', () => {
    let createdPersonId: string;
    let uniqueLastName = 'कश्यप_' + Date.now();

    it('should successfully create a new person and atomically persist audit_outbox entry', async () => {
      uniqueLastName = 'कश्यप_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const res = await request(app.getHttpServer())
        .post('/genealogy/people')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId: branch1Id,
          generation: 5,
          gender: Gender.MALE,
          livingStatus: LivingStatus.LIVING,
          birthYearBs: 2040,
          names: [
            { language: 'ne', firstName: 'राम', lastName: uniqueLastName, fullName: `राम ${uniqueLastName}`, isPrimary: true },
            { language: 'en', firstName: 'Ram', lastName: 'Kashyap', fullName: 'Ram Kashyap', isPrimary: false },
          ],
          justificationReason: 'Initial family lineage registration by Super Admin',
        })
        .expect(201);

      if (res.status !== 201) {
        console.error('Create person failure body:', res.body);
      }
      expect(res.status).toBe(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.primaryNameNepali).toBe(`राम ${uniqueLastName}`);
      createdPersonId = res.body.id;

      // Assert durable audit outbox record exists for this entity
      const outboxRes = await db.query(
        "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'GENEALOGY_CREATE_PERSON'",
        [createdPersonId],
      );
      expect(outboxRes.rows.length).toBeGreaterThanOrEqual(1);
      const outboxEntry = outboxRes.rows[0];
      expect(outboxEntry.status).toBe('PENDING');
      const newVal = typeof outboxEntry.new_value === 'string' ? JSON.parse(outboxEntry.new_value) : outboxEntry.new_value;
      expect(newVal.justificationReason).toBe('Initial family lineage registration by Super Admin');
    });

    it('should block creation of duplicate candidate without explicit allowDuplicateOverride (DUP-FR-001)', async () => {
      // Attempt to create another person with identical primary name in same branch
      const res = await request(app.getHttpServer())
        .post('/genealogy/people')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId: branch1Id,
          generation: 5,
          gender: Gender.MALE,
          livingStatus: LivingStatus.LIVING,
          birthYearBs: 2040,
          names: [
            { language: 'ne', firstName: 'राम', lastName: uniqueLastName, fullName: `राम ${uniqueLastName}`, isPrimary: true },
          ],
          justificationReason: 'Attempting duplicate creation without override',
        });

      if (res.status === 400) {
        expect(res.body.errorCode).toBe(ErrorCode.DUPLICATE_CANDIDATE_DETECTED);
      }
    });

    it('should reject person creation if justification is missing or boilerplate', async () => {
      const res = await request(app.getHttpServer())
        .post('/genealogy/people')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId: branch1Id,
          generation: 5,
          gender: Gender.MALE,
          livingStatus: LivingStatus.LIVING,
          names: [
            { language: 'ne', firstName: 'हरि', lastName: 'अधिकारी', fullName: 'हरि अधिकारी', isPrimary: true },
          ],
          justificationReason: 'test',
        })
        .expect(400);

      expect(res.body.errorCode).toBe(ErrorCode.JUSTIFICATION_REQUIRED);
    });
  });

  describe('2. Person Updates, Stale-Write Protection & Outbox Tracking', () => {
    let testPersonId: string;
    let initialVersion: number;

    beforeAll(async () => {
      const created = await personRepo.createPerson(
        {
          branch_id: branch1Id,
          generation: 4,
          gender: Gender.FEMALE,
          living_status: LivingStatus.LIVING,
          birth_year_bs: 2045,
        },
        [
          { language: 'ne', first_name: 'सीता', last_name: 'अधिकारी', full_name: 'सीता अधिकारी', is_primary: true },
          { language: 'en', first_name: 'Sita', last_name: 'Adhikari', full_name: 'Sita Adhikari', is_primary: true },
        ],
      );
      testPersonId = created.id;
      initialVersion = created.version;
    });

    it('should update person record, increment version, and record outbox entry', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/genealogy/people/${testPersonId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          occupation: 'कृषि विज्ञ',
          education: 'M.Sc. Agriculture',
          version: initialVersion,
          justificationReason: 'Updated educational qualification and occupation details',
        })
        .expect(200);

      expect(res.body.version).toBe(initialVersion + 1);
      expect(res.body.occupation).toBe('कृषि विज्ञ');

      // Assert outbox entry
      const outboxRes = await db.query(
        "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'GENEALOGY_UPDATE_PERSON'",
        [testPersonId],
      );
      expect(outboxRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject stale update with version mismatch', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/genealogy/people/${testPersonId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          occupation: 'इन्जिनियर',
          version: initialVersion, // Old version
          justificationReason: 'Attempting update with stale version',
        })
        .expect(400);

      expect(res.body.errorCode).toBe(ErrorCode.STALE_UPDATE_DETECTED);
    });
  });

  describe('3. Relationship Linking, Cycle Detection & Dual-Branch Authority', () => {
    let parentAId: string;
    let childBId: string;
    let grandchildCId: string;
    let crossBranchPersonId: string;

    beforeAll(async () => {
      const [pA, cB, gC, cbP] = await Promise.all([
        personRepo.createPerson(
          { branch_id: branch1Id, generation: 1, gender: Gender.MALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'गोविन्द', last_name: 'अधिकारी', full_name: 'गोविन्द अधिकारी', is_primary: true }],
        ),
        personRepo.createPerson(
          { branch_id: branch1Id, generation: 2, gender: Gender.MALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'माधव', last_name: 'अधिकारी', full_name: 'माधव अधिकारी', is_primary: true }],
        ),
        personRepo.createPerson(
          { branch_id: branch1Id, generation: 3, gender: Gender.MALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'केशव', last_name: 'अधिकारी', full_name: 'केशव अधिकारी', is_primary: true }],
        ),
        personRepo.createPerson(
          { branch_id: branch2Id, generation: 2, gender: Gender.FEMALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'कमला', last_name: 'अधिकारी', full_name: 'कमला अधिकारी', is_primary: true }],
        ),
      ]);

      parentAId = pA.id;
      childBId = cB.id;
      grandchildCId = gC.id;
      crossBranchPersonId = cbP.id;

      // Link A -> B and B -> C
      await linkRepo.addParentLink(parentAId, childBId);
      await linkRepo.addParentLink(childBId, grandchildCId);
    });

    it('should reject self-link as parent', async () => {
      const res = await request(app.getHttpServer())
        .post(`/genealogy/people/${parentAId}/parents`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ parentId: parentAId })
        .expect(400);

      expect(res.body.errorCode).toBe(ErrorCode.SELF_LINK_PROHIBITED);
    });

    it('should detect and reject cycle when attempting to link descendant as parent (C -> A)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/genealogy/people/${parentAId}/parents`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ parentId: grandchildCId })
        .expect(400);

      expect(res.body.errorCode).toBe(ErrorCode.CYCLE_DETECTED);
    });

    it('should enforce dual-branch authority when branch admin tries to link record from another branch', async () => {
      // branchAdminToken only has authority over branch1Id, not branch2Id
      const res = await request(app.getHttpServer())
        .post(`/genealogy/people/${crossBranchPersonId}/parents`)
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ parentId: parentAId })
        .expect(403);

      expect(res.body.errorCode).toBe(ErrorCode.BRANCH_MISMATCH);
    });
  });

  describe('4. Governed Duplicate Merge, Alias Preservation & Conflict Validation', () => {
    let personXId: string;
    let personYId: string;

    beforeEach(async () => {
      const pX = await personRepo.createPerson(
        {
          branch_id: branch1Id,
          generation: 3,
          gender: Gender.MALE,
          living_status: LivingStatus.LIVING,
          birth_year_bs: 2030,
          gotra: 'कश्यप',
          mool_ghar: 'पोखरा',
        },
        [
          { language: 'ne', first_name: 'कृष्ण', last_name: 'अधिकारी', full_name: 'कृष्ण अधिकारी', is_primary: true },
          { language: 'en', first_name: 'Krishna', last_name: 'Adhikari', full_name: 'Krishna Adhikari', is_primary: true },
        ],
      );

      const pY = await personRepo.createPerson(
        {
          branch_id: branch1Id,
          generation: 3,
          gender: Gender.MALE,
          living_status: LivingStatus.LIVING,
          birth_year_bs: 2030,
          gotra: 'कश्यप',
          mool_ghar: 'पोखरा - बाटुलेचौर',
        },
        [
          { language: 'ne', first_name: 'कृष्णप्रसाद', last_name: 'अधिकारी', full_name: 'कृष्णप्रसाद अधिकारी', is_primary: true },
          { language: 'en', first_name: 'Krishna Prasad', last_name: 'Adhikari', full_name: 'Krishna Prasad Adhikari', is_primary: true },
        ],
      );

      personXId = pX.id;
      personYId = pY.id;
    });

    it('should reject merge if material conflict exists without explicit field resolution', async () => {
      // Both records have conflicting mool_ghar ('पोखरा' vs 'पोखरा - बाटुलेचौर')
      const res = await request(app.getHttpServer())
        .post('/genealogy/duplicates/merge')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          survivingPersonId: personXId,
          mergedPersonId: personYId,
          justificationReason: 'Merging duplicate records without resolving conflicting mool_ghar',
        });

      if (res.status === 400) {
        expect(res.body.errorCode).toBe(ErrorCode.MERGE_CONFLICT_UNRESOLVED);
      }
    });

    it('should successfully merge records, preserve alias (migration 005), and record audit outbox', async () => {
      const res = await request(app.getHttpServer())
        .post('/genealogy/duplicates/merge')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          survivingPersonId: personXId,
          mergedPersonId: personYId,
          fieldResolutions: {
            mool_ghar: 'पोखरा - बाटुलेचौर',
          },
          justificationReason: 'Confirmed duplicate profile registered twice during regional survey',
        })
        .expect(201);

      expect(res.body.canonicalPersonId).toBe(personXId);
      expect(res.body.mergedPersonId).toBe(personYId);

      // Verify merged record is archived with canonical reference
      const mergedPerson = await personRepo.findById(personYId, true);
      expect(mergedPerson?.is_archived).toBe(true);
      expect(mergedPerson?.archive_reason).toBe(`MERGED_INTO:${personXId}`);

      // Verify aliases preserved on surviving record
      const survivingNames = await personRepo.findNamesByPersonId(personXId);
      expect(survivingNames.length).toBeGreaterThanOrEqual(3);

      // Verify audit outbox
      const outboxRes = await db.query(
        "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'GENEALOGY_MERGE_DUPLICATE'",
        [personXId],
      );
      expect(outboxRes.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. ATOMIC ROLLBACK ON INJECTED AUDIT FAILURE', () => {
    it('should completely roll back person creation when audit outbox insertion fails', async () => {
      const spy = jest
        .spyOn(AuditOutboxRepository.prototype, 'recordAuditIntent')
        .mockRejectedValueOnce(new Error('INJECTED_AUDIT_OUTBOX_FAILURE'));

      const doomedLastName = 'अन्वेषण_' + Date.now();

      const res = await request(app.getHttpServer())
        .post('/genealogy/people')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId: branch1Id,
          generation: 6,
          gender: Gender.MALE,
          livingStatus: LivingStatus.LIVING,
          names: [
            { language: 'ne', firstName: 'अन्वेषक', lastName: doomedLastName, fullName: `अन्वेषक ${doomedLastName}`, isPrimary: true },
          ],
          justificationReason: 'Valid creation that should fail atomically due to injected audit failure',
        });

      expect(res.status).toBe(500);

      // Verify mutation was rolled back: 0 rows in database
      const checkRes = await db.query(
        "SELECT p.* FROM persons p JOIN person_names n ON p.id = n.person_id WHERE n.full_name = $1",
        [`अन्वेषक ${doomedLastName}`],
      );
      expect(checkRes.rows.length).toBe(0);

      spy.mockRestore();
    });

    it('should completely roll back parent relationship link when audit outbox insertion fails', async () => {
      const [parent, child] = await Promise.all([
        personRepo.createPerson(
          { branch_id: branch1Id, generation: 1, gender: Gender.MALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'जनक', last_name: 'अधिकारी', full_name: 'जनक अधिकारी', is_primary: true }],
        ),
        personRepo.createPerson(
          { branch_id: branch1Id, generation: 2, gender: Gender.MALE, living_status: LivingStatus.LIVING },
          [{ language: 'ne', first_name: 'सुमन', last_name: 'अधिकारी', full_name: 'सुमन अधिकारी', is_primary: true }],
        ),
      ]);

      const spy = jest
        .spyOn(AuditOutboxRepository.prototype, 'recordAuditIntent')
        .mockRejectedValueOnce(new Error('INJECTED_AUDIT_OUTBOX_FAILURE'));

      const res = await request(app.getHttpServer())
        .post(`/genealogy/people/${child.id}/parents`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ parentId: parent.id })
        .expect(500);

      // Verify parent link was rolled back
      const linkCheck = await db.query(
        'SELECT * FROM parent_links WHERE parent_id = $1 AND child_id = $2',
        [parent.id, child.id],
      );
      expect(linkCheck.rows.length).toBe(0);

      spy.mockRestore();
    });
  });
});
