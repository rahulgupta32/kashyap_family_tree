import { createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';
import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import { BootstrapService } from '../src/database/bootstrap.service';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { UserRepository } from '../src/database/repositories/user.repository';

describe('Concurrent Migration Initialization Regression (Real PostgreSQL)', () => {
  let disposableDb: DisposableDatabase;
  const originalEnv = process.env;

  beforeAll(async () => {
    // Spin up disposable database with skipMigrations: true so it starts completely empty
    disposableDb = await createDisposableDatabase('mig_conc', { skipMigrations: true });
  }, 60000);

  afterAll(async () => {
    process.env = originalEnv;
    if (disposableDb) {
      await disposableDb.cleanup();
    }
  }, 30000);

  it('1. Deliberately overlapping migration initializers succeed cleanly on an empty database without DDL conflicts', async () => {
    // 1. Connect to the empty disposable database
    const dbService = new DatabaseService();
    await dbService.onModuleInit();

    // Assert initial database is empty: schema_migrations table does NOT exist yet
    const initCheck = await dbService.query("SELECT to_regclass('public.schema_migrations') as tbl;");
    expect(initCheck.rows[0].tbl).toBeNull();

    // 2. Create multiple independent MigrationService instances representing concurrent worker processes
    const migrationServices = Array.from({ length: 5 }, () => new MigrationService(dbService));

    // 3. Fire overlapping concurrent runMigrations calls simultaneously
    const concurrentRuns = migrationServices.map((ms) => ms.runMigrations());

    // Also fire multiple overlapping calls on a single MigrationService instance to verify in-flight promise sharing
    const singleService = migrationServices[0];
    const sharedPromiseRuns = Array.from({ length: 5 }, () => singleService.runMigrations());

    await expect(Promise.all([...concurrentRuns, ...sharedPromiseRuns])).resolves.not.toThrow();

    // 4. Verify exact application record in schema_migrations: each migration version applied EXACTLY ONCE
    const migrationRows = await dbService.query(
      'SELECT version, name, COUNT(*) as cnt FROM schema_migrations GROUP BY version, name ORDER BY version',
    );

    const expectedVersions = ['000', '001', '002', '003', '004', '005', '006', '007', '008', '009'];
    const recordedVersions = migrationRows.rows.map((r) => r.version);

    expect(recordedVersions).toEqual(expect.arrayContaining(expectedVersions));
    for (const row of migrationRows.rows) {
      expect(parseInt(row.cnt, 10)).toBe(1);
    }

    // 5. Verify subsequent seeding succeeds cleanly
    const userRepo = new UserRepository(dbService);
    const branchRepo = new BranchRepository(dbService);
    const bootstrapService = new BootstrapService(userRepo, branchRepo, singleService);

    await expect(bootstrapService.onModuleInit()).resolves.not.toThrow();

    // Verify 5 reference branches seeded
    const branchesResult = await dbService.query('SELECT COUNT(*) as count FROM branches');
    expect(parseInt(branchesResult.rows[0].count, 10)).toBe(5);

    await dbService.onModuleDestroy();
  }, 60000);
});
