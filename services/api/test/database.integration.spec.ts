import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { GenealogyLinkRepository } from '../src/database/repositories/genealogy-link.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { DuplicateRepository } from '../src/database/repositories/duplicate.repository';
import { PrivacyEngineService } from '../src/modules/genealogy/privacy/privacy-engine.service';
import { DuplicateService } from '../src/modules/genealogy/duplicate.service';
import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { Gender, LivingStatus, ParentType, SpouseStatus } from '@kashyap/contracts';

describe('Database & Persistence Integration (Real PostgreSQL / WSL)', () => {
  let db: DatabaseService;
  let migrationService: MigrationService;
  let personRepo: PersonRepository;
  let linkRepo: GenealogyLinkRepository;
  let auditOutboxRepo: AuditOutboxRepository;
  let duplicateRepo: DuplicateRepository;
  let privacyEngine: PrivacyEngineService;
  let duplicateService: DuplicateService;
  let genealogyService: GenealogyService;

  beforeAll(async () => {
    // Configure environment for real PostgreSQL
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    db = new DatabaseService();
    await db.onModuleInit();

    migrationService = new MigrationService(db);
    await migrationService.onModuleInit();

    personRepo = new PersonRepository(db);
    linkRepo = new GenealogyLinkRepository(db);
    auditOutboxRepo = new AuditOutboxRepository(db);
    duplicateRepo = new DuplicateRepository(db);
    privacyEngine = new PrivacyEngineService();
    duplicateService = new DuplicateService(
      db,
      personRepo,
      linkRepo,
      duplicateRepo,
      auditOutboxRepo,
      privacyEngine,
    );
    genealogyService = new GenealogyService(
      personRepo,
      linkRepo,
      db,
      auditOutboxRepo,
      privacyEngine,
      duplicateService,
    );
  }, 30000);

  afterAll(async () => {
    if (db) {
      await db.onModuleDestroy();
    }
  });

  it('should verify real PostgreSQL database is connected and ready', () => {
    expect(db.isReady()).toBe(true);
    expect(db.getIsMemoryDb()).toBe(false);
  });

  it('should verify all schema migrations including 005 are applied', async () => {
    const res = await db.query('SELECT version, name FROM schema_migrations ORDER BY version ASC');
    const versions = res.rows.map((r: any) => r.version);
    expect(versions).toContain('000');
    expect(versions).toContain('001');
    expect(versions).toContain('002');
    expect(versions).toContain('003');
    expect(versions).toContain('004');
    expect(versions).toContain('005');
  });

  it('should create and retrieve a person with bilingual names in PostgreSQL', async () => {
    const created = await personRepo.createPerson(
      {
        generation: 3,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        birth_year_bs: 2040,
        mool_ghar: 'कास्की, नेपाल',
      },
      [
        {
          language: 'ne',
          first_name: 'राम',
          last_name: 'अधिकारी',
          full_name: 'राम अधिकारी',
          is_primary: true,
        },
        {
          language: 'en',
          first_name: 'Ram',
          last_name: 'Adhikari',
          full_name: 'Ram Adhikari',
          is_primary: true,
        },
      ],
    );

    expect(created.id).toBeDefined();
    expect(created.version).toBe(1);

    const found = await personRepo.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.mool_ghar).toBe('कास्की, नेपाल');

    const names = await personRepo.findNamesByPersonId(created.id);
    expect(names.length).toBe(2);
    expect(names.find((n) => n.language === 'ne')?.full_name).toBe('राम अधिकारी');
  });

  it('should establish parent-child relationship with DAG invariant in PostgreSQL', async () => {
    const parent = await personRepo.createPerson(
      { generation: 1, gender: Gender.MALE, living_status: LivingStatus.LIVING },
      [{ language: 'ne', first_name: 'जनक', last_name: 'अधिकारी', full_name: 'जनक अधिकारी', is_primary: true }],
    );
    const child = await personRepo.createPerson(
      { generation: 2, gender: Gender.MALE, living_status: LivingStatus.LIVING },
      [{ language: 'ne', first_name: 'राम', last_name: 'अधिकारी', full_name: 'राम अधिकारी', is_primary: true }],
    );

    await linkRepo.addParentLink(parent.id, child.id, ParentType.BIOLOGICAL);

    const parentsOfChild = await linkRepo.getParentsByChildId(child.id);
    expect(parentsOfChild.length).toBe(1);
    expect(parentsOfChild[0].parent_id).toBe(parent.id);

    const childrenOfParent = await linkRepo.getChildrenByParentId(parent.id);
    expect(childrenOfParent.length).toBe(1);
    expect(childrenOfParent[0].child_id).toBe(child.id);
  });

  it('should create bidirectional spouse relationship in PostgreSQL transaction', async () => {
    const husband = await personRepo.createPerson(
      { generation: 2, gender: Gender.MALE, living_status: LivingStatus.LIVING },
      [{ language: 'ne', first_name: 'राम', last_name: 'अधिकारी', full_name: 'राम अधिकारी', is_primary: true }],
    );
    const wife = await personRepo.createPerson(
      { generation: 2, gender: Gender.FEMALE, living_status: LivingStatus.LIVING },
      [{ language: 'ne', first_name: 'सीता', last_name: 'अधिकारी', full_name: 'सीता अधिकारी', is_primary: true }],
    );

    await linkRepo.addSpouseLink(husband.id, wife.id, SpouseStatus.CURRENT);

    const husbandSpouses = await linkRepo.getSpousesByPersonId(husband.id);
    expect(husbandSpouses.length).toBe(1);
    expect(husbandSpouses[0].spouse_id).toBe(wife.id);

    const wifeSpouses = await linkRepo.getSpousesByPersonId(wife.id);
    expect(wifeSpouses.length).toBe(1);
    expect(wifeSpouses[0].spouse_id).toBe(husband.id);
  });

  it('should rollback transaction completely when an error occurs', async () => {
    const initialCountRes = await db.query('SELECT COUNT(*) as cnt FROM persons');
    const initialCount = parseInt(initialCountRes.rows[0].cnt, 10);

    try {
      await db.transaction(async (client) => {
        await client.query(
          "INSERT INTO persons (generation, gender, living_status, version) VALUES (1, 'MALE', 'LIVING', 1)",
        );
        throw new Error('DELIBERATE_ROLLBACK_TEST');
      });
    } catch (e: any) {
      expect(e.message).toBe('DELIBERATE_ROLLBACK_TEST');
    }

    const afterCountRes = await db.query('SELECT COUNT(*) as cnt FROM persons');
    const afterCount = parseInt(afterCountRes.rows[0].cnt, 10);
    expect(afterCount).toBe(initialCount);
  });

  it('should refuse pg-mem in production mode', async () => {
    const origEnv = process.env.NODE_ENV;
    const origMem = process.env.USE_PG_MEM;
    try {
      process.env.NODE_ENV = 'production';
      process.env.USE_PG_MEM = 'true';
      const svc = new DatabaseService();
      await expect(svc.onModuleInit()).rejects.toThrow(/USE_PG_MEM is strictly prohibited in production mode/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origMem) process.env.USE_PG_MEM = origMem;
      else delete process.env.USE_PG_MEM;
    }
  });

  it('should reject missing production database configuration', async () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.DATABASE_URL;
    const origHost = process.env.DB_HOST;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;
      delete process.env.DB_HOST;
      const svc = new DatabaseService();
      await expect(svc.onModuleInit()).rejects.toThrow(/Missing required production database configuration/);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origUrl) process.env.DATABASE_URL = origUrl;
      if (origHost) process.env.DB_HOST = origHost;
    }
  });

  it('should hard fail and refuse automatic pg-mem fallback when real PostgreSQL fails to connect', async () => {
    const origPort = process.env.DB_PORT;
    try {
      process.env.DB_PORT = '59999'; // Dead port
      delete process.env.USE_PG_MEM;
      const svc = new DatabaseService();
      await expect(svc.onModuleInit()).rejects.toThrow();
      expect(svc.getIsMemoryDb()).toBe(false);
    } finally {
      process.env.DB_PORT = origPort;
    }
  });
});
