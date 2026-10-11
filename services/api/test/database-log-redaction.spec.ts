import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { EventEmitter } from 'events';
jest.mock('pg', () => ({ Pool: jest.fn() }));
const secret = 'private-value-password-phone\nforged-sql-log';
describe('Database operational metadata privacy', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); jest.clearAllMocks(); });
  function setup(query = jest.fn()) {
    const db = new DatabaseService();
    (db as any).pool = { query };
    const error = jest.spyOn((db as any).logger, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn((db as any).logger, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn((db as any).logger, 'log').mockImplementation(() => undefined);
    return { db, query, error, warn, log };
  }
  it.each(['23505', secret])('retains internal exceptions while emitting safe diagnostic class %#', async code => {
    const { db, query, error } = setup();
    const thrown = Object.assign(new Error(secret), { code, detail: secret, query: secret });
    query.mockRejectedValue(thrown);
    await expect(db.query(`SELECT '${secret}'`, [secret])).rejects.toBe(thrown);
    expect(error).toHaveBeenCalledWith(`DATABASE_QUERY_UNAVAILABLE sqlstate=${code === '23505' ? '23505' : 'UNKNOWN'}`);
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
  });
  it('retains successful results and slow duration without SQL or parameters', async () => {
    const { db, query, warn } = setup(); const result = { rows: [{ value: secret }] };
    query.mockResolvedValue(result);
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1201);
    expect(await db.query(`SELECT '${secret}'`, [secret])).toBe(result);
    expect(warn).toHaveBeenCalledWith('DATABASE_QUERY_SLOW durationMs=201');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
  });
  it('redacts failed health responses', async () => {
    const { db, query } = setup(); query.mockRejectedValue(new Error(secret));
    expect(await db.checkHealth()).toMatchObject({ status: 'down', isMemoryDb: false, error: 'DATABASE_UNAVAILABLE' });
  });
  it('keeps failed startup unready and omits infrastructure/password/server details', async () => {
    process.env.NODE_ENV = 'test'; delete process.env.USE_PG_MEM;
    process.env.DB_HOST = secret; process.env.DB_NAME = secret; process.env.DB_PASSWORD = secret;
    (Pool as unknown as jest.Mock).mockImplementation(() => ({ on: jest.fn(), connect: jest.fn().mockRejectedValue(Object.assign(new Error(secret), {code:'28P01'})) }));
    const { db, log, error } = setup();
    await expect(db.onModuleInit()).rejects.toThrow(/^DATABASE_CONNECTION_UNAVAILABLE$/);
    expect(db.isReady()).toBe(false);
    expect(error).toHaveBeenCalledWith('DATABASE_CONNECTION_UNAVAILABLE sqlstate=28P01');
    expect(JSON.stringify([log.mock.calls,error.mock.calls])).not.toContain(secret);
  });
  it('preserves explicit transaction-client query behavior', async () => {
    const { db, query, error } = setup(); const client = { query: jest.fn().mockResolvedValue({rows:[]}) };
    await db.query('SELECT $1', [secret], client as any);
    expect(client.query).toHaveBeenCalledWith('SELECT $1',[secret]);
    expect(query).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
  it.each(['MAIN', 'JOURNAL'])('handles idle %s errors with safe metadata and verified health recovery', async kind => {
    const { db, query, error } = setup();
    const pool = new EventEmitter();
    (db as any).isConnected = true;
    (db as any).observePoolErrors(pool, kind);
    expect(() => pool.emit('error', Object.assign(new Error(secret), { code: '57P01', detail: secret }))).not.toThrow();
    expect(error).toHaveBeenCalledWith(`DATABASE_POOL_UNAVAILABLE pool=${kind} sqlstate=57P01`);
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
    expect(db.isReady()).toBe(kind === 'JOURNAL');
    query.mockRejectedValueOnce(new Error(secret)).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    expect((await db.checkHealth()).status).toBe('down');
    expect(db.isReady()).toBe(false);
    expect((await db.checkHealth()).status).toBe('up');
    expect(db.isReady()).toBe(true);
  });
});
