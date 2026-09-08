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
    const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn(`Migrations directory not found at ${migrationsDir}`);
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

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
          this.logger.warn(
            `Migration ${file} checksum mismatch! Expected ${existing.rows[0].checksum}, got ${checksum}.`,
          );
        }
        continue;
      }

      this.logger.log(`Applying migration ${file}...`);
      const start = Date.now();

      try {
        // Execute migration inside transaction
        await this.db.transaction(async (client) => {
          // Split by semicolon statements if necessary or execute whole script
          await client.query(sqlContent);
          const duration = Date.now() - start;
          await client.query(
            'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4)',
            [version, file, checksum, duration],
          );
        });
        this.logger.log(` Migration ${file} applied successfully in ${Date.now() - start}ms.`);
      } catch (err: any) {
        this.logger.error(`Migration ${file} failed: ${err.message}`);
        // In in-process SQL mode (pg-mem), some PG extensions/triggers might need custom handling
        if (this.db.getIsMemoryDb()) {
          this.logger.warn('Skipping unsupported extension/trigger DDL in in-process memory mode.');
        } else {
          throw err;
        }
      }
    }

    this.logger.log('All migrations checked and up to date.');
  }
}
