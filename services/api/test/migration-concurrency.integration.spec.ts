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
    // Spin up disposable database without running up-front migrations (we will test initial migration run)
    disposableDb = await createDisposableDatabase('mig_conc');
  }, 60000);

  afterAll(async () => {
    process.env = originalEnv;
    if (disposableDb) {
      await disposableDb.cleanup();
    }
  }, 30000);

  it('1. Deliberately overlapping migration initializers succeed cleanly without DDL conflicts', async () => {
    // 1. Create real database service pointing to the empty disposable database
    const dbService = new DatabaseService();
    await dbService.onModuleInit();

    // 2. Create multiple independent MigrationService instances representing concurrent workers/pods
    const migrationServices = Array.from({ length: 5 }, () => new MigrationService(dbService));

    // 3. Fire overlapping concurrent runMigrations calls simultaneously
    const concurrentRuns = migrationServices.map((ms) => ms.runMigrations());

    // Also fire multiple overlapping calls on a single MigrationService instance to verify in-flight promise sharing
    const singleService = migrationServices[0];
    const sharedPromiseRuns = Array.from({ length: 5 }, () => singleService.runMigrations());

    await expect(Promise.all([...concurrentRuns, ...sharedPromiseRuns])).resolves.not.toThrow();

    // 4. Verify exact application record in schema_migrations: each migration version applied EXACTLY ONCE
    const migrationRows = await dbService.query(
      'SELECT version, COUNT(*) as cnt FROM schema_migrations GROUP BY version ORDER BY version',
    );

    expect(migrationRows.rows.length).toBeGreaterThan(0);
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
