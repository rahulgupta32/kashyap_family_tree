import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.runMigrations();
  }

  private resolveMigrationsDir(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'database/migrations'),
      path.resolve(process.cwd(), '../../database/migrations'),
      path.resolve(__dirname, '../../../../database/migrations'),
      path.resolve(__dirname, '../../../database/migrations'),
      path.resolve(__dirname, '../../database/migrations'),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }

    return null;
  }

  async runMigrations() {
    this.logger.log('Checking database migrations status...');

    // 1. Create schema_migrations table if not exists
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INT NOT NULL
      );
    `);

    // 2. Discover migration files
    const migrationsDir = this.resolveMigrationsDir();
    if (!migrationsDir) {
      const msg = 'Migrations directory not found in any candidate path.';
      if (process.env.NODE_ENV === 'production' || process.env.USE_REAL_POSTGRES === 'true') {
        throw new Error(`FATAL: ${msg}`);
      }
      this.logger.warn(msg);
      return;
    }

    this.logger.log(`Resolved migrations directory: ${migrationsDir}`);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    // 3. Acquire migration advisory lock in real PG mode (ADR-004 concurrency guard)
    const isRealPg = !this.db.getIsMemoryDb();
    const MIGRATION_LOCK_ID = 2026090901;

    let client: any = null;
    if (isRealPg) {
      client = await this.db.getClient();
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      this.logger.log('Acquired PostgreSQL advisory lock for migration execution.');
    }

    try {
      for (const file of files) {
        const version = file.split('_')[0];
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

        // Check if migration already applied
        const existing = await this.db.query(
          'SELECT version, checksum FROM schema_migrations WHERE version = $1',
          [version],
        );

        if (existing.rows.length > 0) {
          if (existing.rows[0].checksum !== checksum) {
            const mismatchMsg = `FATAL: Migration ${file} checksum mismatch! Recorded: ${existing.rows[0].checksum}, Computed: ${checksum}. Tampering detected or migration altered after execution.`;
            this.logger.error(mismatchMsg);
            throw new Error(mismatchMsg);
          }
          this.logger.debug(`Migration ${file} already applied (version ${version}).`);
          continue;
        }

        this.logger.log(`Applying migration ${file}...`);
        const start = Date.now();

        try {
          // Execute migration inside transaction
          await this.db.transaction(async (txClient) => {
            await txClient.query(sqlContent);
            const duration = Date.now() - start;
            await txClient.query(
              'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
              [version, file, checksum, duration],
            );
          });
          this.logger.log(`Migration ${file} applied successfully in ${Date.now() - start}ms.`);
        } catch (err: any) {
          this.logger.error(`Migration ${file} failed: ${err.message}`, err.stack);
          // Never swallow migration failures — always propagate to halt startup!
          throw new Error(`Migration ${file} failed: ${err.message}`);
        }
      }
    } finally {
      if (isRealPg && client) {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
          this.logger.log('Released PostgreSQL advisory lock for migration execution.');
        } finally {
          client.release();
        }
      }
    }

    this.logger.log('All database migrations verified and up to date.');
  }
}
