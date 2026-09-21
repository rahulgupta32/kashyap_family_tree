import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);
  private migrationPromise: Promise<void> | null = null;

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

  async runMigrations(): Promise<void> {
    if (this.migrationPromise) {
      return this.migrationPromise;
    }

    this.migrationPromise = this.executeMigrations().catch((err) => {
      this.migrationPromise = null;
      throw err;
    });

    return this.migrationPromise;
  }

  private async querySql(queryRunner: PoolClient | DatabaseService, sql: string, params?: any[]) {
    if (queryRunner instanceof DatabaseService) {
      return queryRunner.query(sql, params);
    }
    return (queryRunner as PoolClient).query(sql, params);
  }

  private async executeMigrations(): Promise<void> {
    this.logger.log('Checking database migrations status...');

    const isRealPg = !this.db.getIsMemoryDb();
    const MIGRATION_LOCK_ID = 2026090901;

    let dedicatedClient: PoolClient | null = null;

    try {
      if (isRealPg) {
        dedicatedClient = await this.db.getClient();
        await dedicatedClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
        this.logger.log('Acquired PostgreSQL advisory lock for migration execution.');
      }

      const queryRunner: PoolClient | DatabaseService = dedicatedClient || this.db;

      // 1. Create schema_migrations table AFTER advisory lock is acquired
      await this.querySql(
        queryRunner,
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64) NOT NULL,
          execution_time_ms INT NOT NULL
        );`,
      );

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

      // 3. Apply each unapplied migration
      for (const file of files) {
        const version = file.split('_')[0];
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

        // Check if migration already applied
        const existing = await this.querySql(
          queryRunner,
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
          if (dedicatedClient) {
            await dedicatedClient.query('BEGIN');
            await dedicatedClient.query(sqlContent);
            const duration = Date.now() - start;
            await dedicatedClient.query(
              'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
              [version, file, checksum, duration],
            );
            await dedicatedClient.query('COMMIT');
          } else {
            await this.db.transaction(async (txClient) => {
              await txClient.query(sqlContent);
              const duration = Date.now() - start;
              await txClient.query(
                'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
                [version, file, checksum, duration],
              );
            });
          }
          this.logger.log(`Migration ${file} applied successfully in ${Date.now() - start}ms.`);
        } catch (err: any) {
          if (dedicatedClient) {
            try {
              await dedicatedClient.query('ROLLBACK');
            } catch (rbErr) {}
          }
          this.logger.error(`Migration ${file} failed: ${err.message}`, err.stack);
          throw new Error(`Migration ${file} failed: ${err.message}`);
        }
      }

      this.logger.log('All database migrations verified and up to date.');
    } finally {
      if (isRealPg && dedicatedClient) {
        try {
          await dedicatedClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
          this.logger.log('Released PostgreSQL advisory lock for migration execution.');
        } catch (unlockErr: any) {
          this.logger.error(`Failed to release advisory lock: ${unlockErr.message}`);
        } finally {
          dedicatedClient.release();
        }
      }
    }
  }
}
