import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Idle PostgreSQL pool recovery (real PostgreSQL)', () => {
  let iso: DisposableDatabase, db: DatabaseService;
  beforeAll(async () => {
    iso = await createDisposableDatabase('pool_recovery');
    db = new DatabaseService(); await db.onModuleInit();
    await assertDatabaseIsolation(db, iso.dbName);
  }, 60000);
  afterAll(async () => { if (db) await db.onModuleDestroy(); if (iso) await iso.drop(); });
  it.each(['MAIN', 'JOURNAL'] as const)('survives an administratively terminated idle %s backend and reconnects', async kind => {
    const query = kind === 'MAIN' ? (sql: string) => db.query(sql) : (sql: string) => db.journalQuery(sql);
    const pid = (await query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pool: Pool = (db as any)[kind === 'MAIN' ? 'pool' : 'journalPool'];
    const error = jest.spyOn((db as any).logger, 'error').mockImplementation(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    try {
      const terminated = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Idle backend termination event was not observed')), 5000);
        pool.once('error', () => resolve());
      });
      // Exact disposable database identity was verified before obtaining this PID.
      expect((await iso.client.query('SELECT pg_terminate_backend($1) AS terminated', [pid])).rows[0].terminated).toBe(true);
      await terminated;
      expect(error).toHaveBeenCalledWith(`DATABASE_POOL_UNAVAILABLE pool=${kind} sqlstate=57P01`);
      if (kind === 'MAIN') expect(db.isReady()).toBe(false);
      const replacement = (await query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      expect(replacement).not.toBe(pid);
      expect((await db.checkHealth()).status).toBe('up');
      expect(db.isReady()).toBe(true);
    } finally { if (timer) clearTimeout(timer); error.mockRestore(); }
  });
});
