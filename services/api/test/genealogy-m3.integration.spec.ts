import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { RedisService } from '../src/redis/redis.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { GenealogyLinkRepository } from '../src/database/repositories/genealogy-link.repository';
import { DuplicateRepository } from '../src/database/repositories/duplicate.repository';
import { BootstrapService } from '../src/database/bootstrap.service';
import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { SearchService } from '../src/modules/genealogy/search.service';
import { DuplicateService } from '../src/modules/genealogy/duplicate.service';
import { PrivacyEngineService } from '../src/modules/genealogy/privacy/privacy-engine.service';
import {
  Gender,
  LivingStatus,
  PrivacyVisibility,
  ParentType,
  SpouseStatus,
  Role,
  ErrorCode,
} from '@kashyap/contracts';

describe('Genealogy Core & Duplicate Governance Integration (Real PostgreSQL / D: Storage)', () => {
  let db: DatabaseService;
  let migrationService: MigrationService;
  let redisService: RedisService;
  let userRepo: UserRepository;
  let sessionRepo: SessionRepository;
  let branchRepo: BranchRepository;
  let auditRepo: AuditRepository;
  let auditOutboxRepo: AuditOutboxRepository;
  let personRepo: PersonRepository;
  let linkRepo: GenealogyLinkRepository;
  let duplicateRepo: DuplicateRepository;
  let privacyEngine: PrivacyEngineService;
  let searchService: SearchService;
  let duplicateService: DuplicateService;
  let genealogyService: GenealogyService;

  let testBranchId: string;
  let superAdminUser: any;
  let branchAdminUser: any;
  let regularUser: any;

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
    process.env.SEED_ADMINS = 'true';

    db = new DatabaseService();
    await db.onModuleInit();

    migrationService = new MigrationService(db);
    await migrationService.onModuleInit();

    redisService = new RedisService();
    await redisService.onModuleInit();

    userRepo = new UserRepository(db);
    sessionRepo = new SessionRepository(db);
    branchRepo = new BranchRepository(db);
    auditRepo = new AuditRepository(db);
    auditOutboxRepo = new AuditOutboxRepository(db);
    personRepo = new PersonRepository(db);
    linkRepo = new GenealogyLinkRepository(db);
    duplicateRepo = new DuplicateRepository(db);

    const bootstrapService = new BootstrapService(userRepo, branchRepo);
    await bootstrapService.onModuleInit();

    privacyEngine = new PrivacyEngineService();
    duplicateService = new DuplicateService(
      db,
      personRepo,
      linkRepo,
      duplicateRepo,
      auditOutboxRepo,
      privacyEngine,
    );
    searchService = new SearchService(personRepo, privacyEngine);
    genealogyService = new GenealogyService(
      personRepo,
      linkRepo,
      db,
      auditOutboxRepo,
      privacyEngine,
      duplicateService,
    );

    const branches = await branchRepo.findAll();
    expect(branches.length).toBeGreaterThan(0);
    testBranchId = branches[0].id;

    superAdminUser = await userRepo.findByPhone('+9779800000001');
    branchAdminUser = await userRepo.findByPhone('+9779800000002');
    
    const regPhone = '+977984' + Math.floor(1000000 + Math.random() * 9000000);
    regularUser = await userRepo.findOrCreateByPhone(regPhone);
  }, 45000);

  afterAll(async () => {
    if (redisService) await redisService.onModuleDestroy();
    if (db) await db.onModuleDestroy();
  });

  async function createTestPerson(overrides: Partial<any> = {}) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return await genealogyService.createPerson(
      {
        names: [
          {
            language: 'ne',
            firstName: overrides.firstNameNepali || ('राम-' + randomSuffix),
            lastName: overrides.lastNameNepali || 'अधिकारी',
            fullName: ((overrides.firstNameNepali || ('राम-' + randomSuffix)) + ' ' + (overrides.lastNameNepali || 'अधिकारी')).trim(),
            isPrimary: true,
          },
          {
            language: 'en',
            firstName: overrides.firstNameEnglish || ('Ram-' + randomSuffix),
            lastName: overrides.lastNameEnglish || 'Adhikari',
            fullName: ((overrides.firstNameEnglish || ('Ram-' + randomSuffix)) + ' ' + (overrides.lastNameEnglish || 'Adhikari')).trim(),
            isPrimary: false,
          },
        ],
        gender: overrides.gender || Gender.MALE,
        livingStatus: overrides.livingStatus || LivingStatus.LIVING,
        branchId: testBranchId,
        generation: overrides.generation || 4,
        birthYearBs: overrides.birthYearBs || 2040,
        birthDateBs: overrides.birthDateBs || '2040-01-01',
        birthPlace: overrides.birthPlace || 'पोखरा',
        moolGhar: overrides.moolGhar || 'कास्की',
        justificationReason: 'प्रशासनिक परीक्षण दर्ता',
        phoneVisibility: PrivacyVisibility.PUBLIC,
        addressVisibility: PrivacyVisibility.PUBLIC,
        dobVisibility: overrides.dobVisibility || PrivacyVisibility.PUBLIC,
      },
      {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      },
    );
  }

  describe('1. Concurrency & Cycle Prevention (GEN-FR-004, EC-0040, Amendment 1)', () => {
    it('should reject self-parent link (EC-0040)', async () => {
      const p = await createTestPerson();
      await expect(
        genealogyService.addParentLink(p.id, p.id, ParentType.BIOLOGICAL, {
          id: superAdminUser.id,
          roles: [Role.SUPER_ADMIN],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.SELF_LINK_PROHIBITED },
      });
    });

    it('should reject direct 2-node cycle (A -> B, B -> A)', async () => {
      const parent = await createTestPerson();
      const child = await createTestPerson();

      await genealogyService.addParentLink(child.id, parent.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      await expect(
        genealogyService.addParentLink(parent.id, child.id, ParentType.BIOLOGICAL, {
          id: superAdminUser.id,
          roles: [Role.SUPER_ADMIN],
        }),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.CYCLE_DETECTED },
      });
    });

    it('should maintain acyclic invariant under concurrent cross-edge additions (Amendment 1)', async () => {
      const a = await createTestPerson();
      const b = await createTestPerson();
      const c = await createTestPerson();
      const d = await createTestPerson();

      // C is parent of B
      await genealogyService.addParentLink(b.id, c.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      // A is parent of D
      await genealogyService.addParentLink(d.id, a.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      // Concurrently add A is child of B AND C is child of D
      const op1 = genealogyService.addParentLink(a.id, b.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      const op2 = genealogyService.addParentLink(c.id, d.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      const results = await Promise.allSettled([op1, op2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Due to pg_advisory_xact_lock on lineage graph, both cannot succeed into a cyclic state
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  describe('2. Stale Update Protection & Versioning (GEN-FR-012, Amendment 4)', () => {
    it('should reject stale updates when version does not match', async () => {
      const p = await createTestPerson();
      expect(p.version).toBe(1);

      const updated = await genealogyService.updatePerson(
        p.id,
        {
          names: [
            { language: 'ne', firstName: 'राम कुमार', lastName: 'अधिकारी', fullName: 'राम कुमार अधिकारी', isPrimary: true },
          ],
          justificationReason: 'नागरिकता अनुसार नाम संशोधन',
          version: 1,
        },
        { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
      );
      expect(updated.version).toBe(2);

      await expect(
        genealogyService.updatePerson(
          p.id,
          {
            names: [
              { language: 'ne', firstName: 'राम बहादुर', lastName: 'अधिकारी', fullName: 'राम बहादुर अधिकारी', isPrimary: true },
            ],
            justificationReason: 'अर्को संशोधन',
            version: 1,
          },
          { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
        ),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.STALE_UPDATE_DETECTED },
      });
    });

    it('should require justification reason for updates (GEN-FR-011, ADM-FR-005)', async () => {
      const p = await createTestPerson();
      await expect(
        genealogyService.updatePerson(
          p.id,
          {
            names: [
              { language: 'ne', firstName: 'नयाँ नाम', lastName: 'अधिकारी', fullName: 'नयाँ नाम अधिकारी', isPrimary: true },
            ],
            justificationReason: '',
            version: p.version || 1,
          },
          { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
        ),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.JUSTIFICATION_REQUIRED },
      });
    });
  });

  describe('3. Pre-Creation Duplicate Evaluation (Amendment 3)', () => {
    it('should evaluate uncommitted facts and score potential duplicates', async () => {
      const existing = await createTestPerson({
        firstNameNepali: 'हरि प्रसाद',
        lastNameNepali: 'अधिकारी',
        birthYearBs: 2035,
      });

      const matches = await duplicateService.evaluateProposedPerson({
        names: [
          { language: 'ne', firstName: 'हरि प्रसाद', lastName: 'अधिकारी', fullName: 'हरि प्रसाद अधिकारी', isPrimary: true },
        ],
        branchId: testBranchId,
        birthYearBs: 2035,
      });

      expect(matches.length).toBeGreaterThan(0);
      const matched = matches.find((m) => m.person.id === existing.id);
      expect(matched).toBeDefined();
      expect(matched!.score).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('4. Governed Duplicate Merge (GEN-FR-015, Amendment 4)', () => {
    it('should merge two persons, migrate links, archive absorbed, and redirect prior ID', async () => {
      const surviving = await createTestPerson({ firstNameNepali: 'केशव (Surviving)' });
      const absorbed = await createTestPerson({ firstNameNepali: 'केशव (Absorbed)' });
      const child = await createTestPerson({ firstNameNepali: 'छोरा' });

      await genealogyService.addParentLink(absorbed.id, child.id, ParentType.BIOLOGICAL, {
        id: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });

      const result = await duplicateService.mergePersons(
        {
          survivingPersonId: surviving.id,
          mergedPersonId: absorbed.id,
          justificationReason: 'प्रशासनिक निर्णय अनुसार दोहोरो दर्ता एकीकरण',
          survivingPersonVersion: surviving.version,
          mergedPersonVersion: absorbed.version,
        },
        { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
      );

      expect(result.canonicalPersonId).toBe(surviving.id);
      expect(result.mergedPersonId).toBe(absorbed.id);

      const rawAbsorbed = await personRepo.findById(absorbed.id, true);
      expect(rawAbsorbed?.is_archived).toBe(true);

      const resolved = await personRepo.resolveCanonicalPerson(absorbed.id);
      expect(resolved?.canonicalId).toBe(surviving.id);

      const survivingDetail = await genealogyService.getPersonById(surviving.id, {
        userId: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });
      expect(survivingDetail.children.some((c) => c.personId === child.id)).toBe(true);
    });

    it('should reject merge when both records are claimed by distinct users (CANNOT_MERGE_CLAIMED_PERSONS)', async () => {
      const p1 = await createTestPerson();
      const p2 = await createTestPerson();

      const user2Phone = '+977984' + Math.floor(1000000 + Math.random() * 9000000);
      const user2 = await userRepo.findOrCreateByPhone(user2Phone);
      await db.query('UPDATE persons SET is_claimed = TRUE, claimed_user_id = $1 WHERE id = $2', [regularUser.id, p1.id]);
      await db.query('UPDATE persons SET is_claimed = TRUE, claimed_user_id = $1 WHERE id = $2', [user2.id, p2.id]);

      await expect(
        duplicateService.mergePersons(
          {
            survivingPersonId: p1.id,
            mergedPersonId: p2.id,
            justificationReason: 'दाबी भएका व्यक्तिहरूको एकीकरण प्रयास',
            survivingPersonVersion: p1.version,
            mergedPersonVersion: p2.version,
          },
          { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
        ),
      ).rejects.toMatchObject({
        response: { errorCode: ErrorCode.CANNOT_MERGE_CLAIMED_PERSONS },
      });
    });
  });

  describe('5. Privacy Governance & Masking (PRIV-FR-001..004, 007..008, Amendment 2)', () => {
    it('should mask contact info and sensitive data of protected minors for guests', async () => {
      const minor = await createTestPerson({
        firstNameNepali: 'नाबालक बालक',
        birthYearBs: 2077,
        birthDateBs: '2077-01-01',
        isLiving: true,
        privacyVisibility: PrivacyVisibility.PUBLIC,
      });

      const guestView = await genealogyService.getPersonById(minor.id, undefined);
      expect(guestView.birthPlace).toBeUndefined();
      expect(guestView.moolGhar).toBeUndefined();

      const adminView = await genealogyService.getPersonById(minor.id, {
        userId: superAdminUser.id,
        roles: [Role.SUPER_ADMIN],
      });
      expect(adminView.birthPlace).toBe('पोखरा');
      expect(adminView.moolGhar).toBe('कास्की');
    });
  });

  describe('6. Privacy-Filtered Export (GEN-FR-018, PRIV-FR-007)', () => {
    it('should export genealogy data in JSON and CSV format with role-based filtering', async () => {
      const jsonExport = await genealogyService.exportGenealogy(
        { branchId: testBranchId, format: 'json' },
        { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
      );
      expect(jsonExport.totalRecords).toBeGreaterThan(0);
      expect(Array.isArray(jsonExport.persons)).toBe(true);

      const csvExport = await genealogyService.exportGenealogy(
        { branchId: testBranchId, format: 'csv' },
        { id: superAdminUser.id, roles: [Role.SUPER_ADMIN] },
      );
      expect(csvExport.totalRecords).toBeGreaterThan(0);
      expect(Array.isArray(csvExport.persons)).toBe(true);
    });
  });
});
