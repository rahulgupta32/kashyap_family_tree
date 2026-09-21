import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

export interface DisposableDatabase {
  dbName: string;
  client: Client;
  databaseUrl: string;
  drop: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export function getDatabaseHost(): string {
  if (process.env.DB_HOST && process.env.DB_HOST !== '127.0.0.1' && process.env.DB_HOST !== 'localhost') {
    return process.env.DB_HOST;
  }
  if (process.platform === 'win32') {
    try {
      const wslIp = execSync('wsl hostname -I', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split(' ')[0];
      if (wslIp && /^\d+\.\d+\.\d+\.\d+$/.test(wslIp)) {
        return wslIp;
      }
    } catch (e) {}
  }
  return process.env.DB_HOST || '127.0.0.1';
}

export async function createDisposableDatabase(
  prefix: string,
  applyMigrationsUpToOrOptions?: string | { applyMigrationsUpTo?: string; skipMigrations?: boolean },
): Promise<DisposableDatabase> {
  const options =
    typeof applyMigrationsUpToOrOptions === 'string'
      ? { applyMigrationsUpTo: applyMigrationsUpToOrOptions }
      : applyMigrationsUpToOrOptions;
  const applyMigrationsUpTo = options?.applyMigrationsUpTo;
  const skipMigrations = options?.skipMigrations === true;

  const host = getDatabaseHost();
  const port = parseInt(process.env.DB_PORT || '5434', 10);
  const user = process.env.DB_USER || 'kashyap_user';
  const password = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';

  const isoDbName = `kashyap_iso_${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  // 1. Connect to maintenance db 'postgres'
  const adminClient = new Client({ host, port, user, password, database: 'postgres' });
  await adminClient.connect();

  // 2. Create isolated database
  await adminClient.query(`CREATE DATABASE "${isoDbName}";`);
  await adminClient.end();

  // Synchronize DB_HOST, DB_NAME, and DATABASE_URL environment variables
  const isoDatabaseUrl = `postgresql://${user}:${password}@${host}:${port}/${isoDbName}`;
  process.env.DB_HOST = host;
  process.env.DB_NAME = isoDbName;
  process.env.DATABASE_URL = isoDatabaseUrl;
  process.env.USE_REAL_POSTGRES = 'true';
  delete process.env.USE_PG_MEM;

  // 3. Connect to newly created isolated database
  const isoClient = new Client({ host, port, user, password, database: isoDbName });
  await isoClient.connect();

  // 4. Strict identity verification: MUST be exact match to isoDbName
  const verifyRes = await isoClient.query('SELECT current_database() as db_name;');
  const currentDb = verifyRes.rows[0].db_name;
  if (currentDb !== isoDbName) {
    throw new Error(`SAFETY_VIOLATION: Expected exact connection to ${isoDbName}, but got ${currentDb}`);
  }

  // 5. Apply migrations unless skipMigrations is set
  const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
  if (!skipMigrations && fs.existsSync(migrationsDir)) {
    // Create schema_migrations
    await isoClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64) NOT NULL,
        execution_time_ms INT NOT NULL
      );
    `);

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    for (const file of files) {
      const version = file.split('_')[0];
      if (applyMigrationsUpTo && version > applyMigrationsUpTo) {
        break;
      }
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      await isoClient.query(sql);
      await isoClient.query(
        'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;',
        [version, file, checksum, 1]
      );
    }
  }

  const drop = async () => {
    try {
      await isoClient.end();
    } catch (e) {}

    // Strict safety verification before drop: must match exact isoDbName
    if (!isoDbName.startsWith('kashyap_iso_') || isoDbName === 'kashyap_db') {
      throw new Error(`REFUSING_DROP: Target database ${isoDbName} is not disposable!`);
    }

    const cleanupClient = new Client({ host, port, user, password, database: 'postgres' });
    try {
      await cleanupClient.connect();
      await cleanupClient.query(`DROP DATABASE IF EXISTS "${isoDbName}" WITH (FORCE);`);
    } catch (e) {
    } finally {
      try {
        await cleanupClient.end();
      } catch (e) {}
      process.env.DB_NAME = 'kashyap_db';
      delete process.env.DATABASE_URL;
    }
  };

  return {
    dbName: isoDbName,
    client: isoClient,
    databaseUrl: isoDatabaseUrl,
    drop,
    cleanup: drop,
  };
}

export async function assertDatabaseIsolation(clientOrDb: any, expectedExactDbName: string) {
  const res = await clientOrDb.query('SELECT current_database() as db_name;');
  const dbName = res.rows ? res.rows[0].db_name : res[0]?.db_name;
  if (dbName !== expectedExactDbName) {
    throw new Error(`SAFETY_VIOLATION: Destructive test target mismatch! Expected exact disposable database '${expectedExactDbName}', but connection is targeting '${dbName}'!`);
  }
}
