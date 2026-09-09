import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { GenealogyLinkRepository } from '../src/database/repositories/genealogy-link.repository';
import { GenealogyService } from '../src/modules/genealogy/genealogy.service';
import { Gender, LivingStatus, ParentType, SpouseStatus } from '@kashyap/contracts';

describe('Database & Persistence Integration (Real PostgreSQL / WSL)', () => {
  let db: DatabaseService;
  let migrationService: MigrationService;
  let personRepo: PersonRepository;
  let linkRepo: GenealogyLinkRepository;
  let genealogyService: GenealogyService;

  beforeAll(async () => {
    // Configure environment for real PostgreSQL
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'kashyap_user';
    process.env.DB_PASSWORD = 'kashyap_secure_dev_password';
    process.env.DB_NAME = 'kashyap_db';

    db = new DatabaseService();
    await db.onModuleInit();

    migrationService = new MigrationService(db);
    await migrationService.onModuleInit();

    personRepo = new PersonRepository(db);
    linkRepo = new GenealogyLinkRepository(db);
    genealogyService = new GenealogyService(personRepo, linkRepo, db);
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

  it('should execute health check successfully against real PostgreSQL', async () => {
    const health = await db.checkHealth();
    expect(health.status).toBe('up');
    expect(health.isMemoryDb).toBe(false);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should verify schema_migrations table is created and tracked', async () => {
    const res = await db.query('SELECT version, name FROM schema_migrations ORDER BY version ASC');
    expect(res.rows).toBeDefined();
    expect(Array.isArray(res.rows)).toBe(true);
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('should perform transactional person creation with multi-lingual names in PostgreSQL', async () => {
    const created = await personRepo.createPerson(
      {
        generation: 1,
        gender: Gender.MALE,
        living_status: LivingStatus.LIVING,
        gotra: 'कश्यप',
        mool_ghar: 'कास्कीकोट',
      },
      [
        { language: 'ne', first_name: 'हरि', last_name: 'अधिकारी', full_name: 'हरि अधिकारी (परीक्षण)', is_primary: true },
        { language: 'en', first_name: 'Hari', last_name: 'Adhikari', full_name: 'Hari Adhikari (Test)', is_primary: false },
      ],
    );

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.gotra).toBe('कश्यप');

    // Retrieve and verify
    const fetched = await personRepo.findById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.mool_ghar).toBe('कास्कीकोट');

    const names = await personRepo.findNamesByPersonId(created.id);
    expect(names.length).toBe(2);
    expect(names[0].is_primary).toBe(true);
  });

  it('should create parent-child relationships and retrieve descendant hierarchy via CTE', async () => {
    const parent = await personRepo.createPerson(
      { generation: 1, gender: Gender.MALE, living_status: LivingStatus.DECEASED, gotra: 'कश्यप' },
      [{ language: 'ne', first_name: 'जनक', last_name: 'अधिकारी', full_name: 'जनक अधिकारी (परीक्षण)', is_primary: true }],
    );

    const child = await personRepo.createPerson(
      { generation: 2, gender: Gender.MALE, living_status: LivingStatus.LIVING, gotra: 'कश्यप' },
      [{ language: 'ne', first_name: 'सुमन', last_name: 'अधिकारी', full_name: 'सुमन अधिकारी (परीक्षण)', is_primary: true }],
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
      { generation: 1, gender: Gender.MALE, living_status: LivingStatus.LIVING, gotra: 'कश्यप' },
      [{ language: 'ne', first_name: 'पति', last_name: 'अधिकारी', full_name: 'पति अधिकारी (परीक्षण)', is_primary: true }],
    );

    const wife = await personRepo.createPerson(
      { generation: 1, gender: Gender.FEMALE, living_status: LivingStatus.LIVING, gotra: 'कश्यप' },
      [{ language: 'ne', first_name: 'पत्नी', last_name: 'अधिकारी', full_name: 'पत्नी अधिकारी (परीक्षण)', is_primary: true }],
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
    const initialCount = (await db.query('SELECT COUNT(*) as c FROM persons')).rows[0].c;

    await expect(
      db.transaction(async (client) => {
        await client.query("INSERT INTO persons (generation, gender, living_status, gotra) VALUES (99, 'UNKNOWN', 'LIVING', 'कश्यप')");
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      }),
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    const afterCount = (await db.query('SELECT COUNT(*) as c FROM persons')).rows[0].c;
    expect(afterCount).toBe(initialCount);
  });

  it('should refuse pg-mem in production mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_PG_MEM = 'true';

    const prodDb = new DatabaseService();
    await expect(prodDb.onModuleInit()).rejects.toThrow('USE_PG_MEM is strictly prohibited in production mode');

    delete process.env.NODE_ENV;
    delete process.env.USE_PG_MEM;
  });

  it('should reject missing production database configuration', async () => {
    process.env.NODE_ENV = 'production';
    const oldUrl = process.env.DATABASE_URL;
    const oldPass = process.env.DB_PASSWORD;
    delete process.env.DATABASE_URL;
    delete process.env.DB_PASSWORD;

    const prodDb = new DatabaseService();
    await expect(prodDb.onModuleInit()).rejects.toThrow('Missing required production database configuration');

    if (oldUrl) process.env.DATABASE_URL = oldUrl;
    if (oldPass) process.env.DB_PASSWORD = oldPass;
    delete process.env.NODE_ENV;
  });

  it('should hard fail and refuse automatic pg-mem fallback when real PostgreSQL fails to connect', async () => {
    const badDb = new DatabaseService();
    const oldPort = process.env.DB_PORT;
    process.env.DB_PORT = '59999'; // invalid port

    await expect(badDb.onModuleInit()).rejects.toThrow('Database connection failed');
    expect(badDb.getIsMemoryDb()).toBe(false);

    if (oldPort) process.env.DB_PORT = oldPort;
    else delete process.env.DB_PORT;
  });
});
