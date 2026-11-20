import { randomBytes, createHash } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { BranchRepository } from '../src/database/repositories/branch.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';
import { createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Refresh mutation and durable evidence (real PostgreSQL)', () => {
  let isolated: DisposableDatabase;
  let db: DatabaseService;
  let users: UserRepository;
  let sessions: SessionRepository;
  let outbox: AuditOutboxRepository;
  let service: AuthService;
  let actor: string;
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');

  beforeAll(async () => {
    isolated = await createDisposableDatabase('refresh_audit');
    db = new DatabaseService();
    await db.onModuleInit();
    users = new UserRepository(db);
    sessions = new SessionRepository(db);
    outbox = new AuditOutboxRepository(db);
    service = new AuthService(new JwtService(), {} as any, users, sessions,
      new BranchRepository(db), new AuditRepository(db), new TestSmsProviderAdapter(), db, outbox);
  });
  beforeEach(async () => {
    actor = (await users.findOrCreateByPhone(`+977984${Math.floor(1000000 + Math.random() * 9000000)}`)).id;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { if (db) await db.onModuleDestroy(); if (isolated) await isolated.cleanup(); });

  async function seed(expired = false) {
    const token = randomBytes(32).toString('hex');
    const session = await sessions.createSession({ userId: actor, refreshTokenHash: hash(token),
      devicePlatform: 'ANDROID', expiresAt: new Date(Date.now() + (expired ? -1000 : 3600000)) });
    return { token, session };
  }
  async function evidence(action = 'UPDATE') {
    return (await db.query('SELECT * FROM audit_outbox WHERE actor_id=$1 AND action=$2 ORDER BY created_at,id',
      [actor, action])).rows;
  }

  it('retains redacted rotation evidence linked to the committed successor', async () => {
    const { token, session } = await seed();
    const result = await service.refreshToken({ refreshToken: token });
    const rows = await evidence();
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_id).toBe(session.id);
    expect(rows[0].new_value.outcome).toBe('REFRESH_ROTATED');
    const successor = await sessions.findByTokenHash(hash(result.refreshToken));
    expect(rows[0].new_value.successorSessionId).toBe(successor!.id);
    expect((await sessions.findById(session.id))!.revoked_at).not.toBeNull();
    const serialized = JSON.stringify(rows[0].new_value);
    for (const secret of [token, result.refreshToken, hash(token), hash(result.refreshToken)]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('rolls back successor and old-session revocation when evidence insertion fails', async () => {
    const { token, session } = await seed();
    jest.spyOn(outbox, 'recordAuditIntent').mockRejectedValue(new Error('fictional private database diagnostic'));
    await expect(service.refreshToken({ refreshToken: token })).rejects.toMatchObject({ status: 503 });
    expect((await sessions.findById(session.id))!.revoked_at).toBeNull();
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(1);
    expect(await evidence()).toHaveLength(0);
    expect((await db.query('SELECT count(*)::int AS count FROM user_sessions WHERE user_id=$1', [actor])).rows[0].count).toBe(1);
  });

  it('returns no credentials after a lost commit acknowledgement while preserving actual evidence', async () => {
    const { token, session } = await seed();
    const transaction = db.transaction.bind(db);
    jest.spyOn(db, 'transaction').mockImplementationOnce(async (callback: any) => {
      await transaction(callback);
      throw new Error('fictional lost commit acknowledgement');
    });
    await expect(service.refreshToken({ refreshToken: token })).rejects.toMatchObject({ status: 503 });
    expect((await sessions.findById(session.id))!.revoked_at).not.toBeNull();
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(1);
    expect((await evidence())[0].new_value.outcome).toBe('REFRESH_ROTATED');
  });

  it('retains retryable evidence when immediate audit delivery fails', async () => {
    const { token } = await seed();
    jest.spyOn(outbox, 'processOutboxEntry').mockRejectedValue(new Error('fictional private delivery diagnostic'));
    expect((await service.refreshToken({ refreshToken: token })).accessToken).toBeDefined();
    const rows = await evidence();
    expect(rows[0]).toMatchObject({ status: 'FAILED', retry_count: 1, last_error: 'REFRESH_AUDIT_DELIVERY_FAILED' });
    expect(rows[0].next_attempt_at).not.toBeNull();
  });

  it('commits replay evidence together with revocation of every current session', async () => {
    const { token } = await seed();
    await seed();
    await service.refreshToken({ refreshToken: token });
    await expect(service.refreshToken({ refreshToken: token })).rejects.toMatchObject({ status: 401 });
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(0);
    expect((await evidence()).map(row => row.new_value.outcome)).toContain('REFRESH_REPLAY_ALL_SESSIONS_REVOKED');
  });

  it('commits expiry evidence together with revocation without creating a successor', async () => {
    const { token, session } = await seed(true);
    await expect(service.refreshToken({ refreshToken: token })).rejects.toMatchObject({ status: 401 });
    expect((await sessions.findById(session.id))!.revoked_at).not.toBeNull();
    expect((await evidence())[0].new_value).toEqual({ outcome: 'REFRESH_EXPIRED_SESSION_REVOKED' });
  });

  it('does not suppress security revocation when replay evidence insertion is unavailable', async () => {
    const { token } = await seed();
    await service.refreshToken({ refreshToken: token });
    jest.spyOn(outbox, 'recordAuditIntent').mockRejectedValue(new Error('fictional evidence outage'));
    await expect(service.refreshToken({ refreshToken: token })).rejects.toMatchObject({ status: 503 });
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(0);
    expect(await evidence()).toHaveLength(1);
  });

  it('serializes concurrent refreshes and retains both rotation and replay revocation', async () => {
    const { token } = await seed();
    const results = await Promise.allSettled([service.refreshToken({ refreshToken: token }), service.refreshToken({ refreshToken: token })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(0);
    expect((await evidence()).map(row => row.new_value.outcome).sort()).toEqual([
      'REFRESH_REPLAY_ALL_SESSIONS_REVOKED', 'REFRESH_ROTATED',
    ]);
  });

  it('limits logout to the intended session and retains its own redacted audit intent', async () => {
    const first=await seed(),second=await seed();
    await service.logout({refreshToken:first.token});
    expect((await sessions.findById(first.session.id))!.revoked_at).not.toBeNull();
    expect((await sessions.findById(second.session.id))!.revoked_at).toBeNull();
    const rows=await evidence('LOGOUT');expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({status:'PROCESSED',entity_id:first.session.id,new_value:{revokedSessions:[first.session.id]}});
    expect(JSON.stringify(rows[0].new_value)).not.toContain(first.token);
    expect(JSON.stringify(rows[0].new_value)).not.toContain(hash(first.token));
  });

  it('retains account-wide logout count and revocation in a single transaction', async () => {
    await seed();await seed();
    expect(await service.logoutAll(actor)).toEqual({success:true,revokedCount:2});
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(0);
    expect((await evidence('LOGOUT'))[0].new_value).toEqual({scope:'ALL_DEVICES',revokedCount:2});
  });

  it('rolls back every revocation when logout-all evidence insertion fails', async () => {
    await seed();await seed();
    jest.spyOn(outbox,'recordAuditIntent').mockRejectedValue(new Error('private fictional insertion failure'));
    await expect(service.logoutAll(actor)).rejects.toMatchObject({status:503});
    expect(await sessions.getActiveSessionsForUser(actor)).toHaveLength(2);
    expect(await evidence('LOGOUT')).toHaveLength(0);
  });

  it('returns no logout success on a lost acknowledgement while preserving actual committed revocation and evidence', async () => {
    const {token,session}=await seed();const transaction=db.transaction.bind(db);
    jest.spyOn(db,'transaction').mockImplementationOnce(async(callback:any)=>{
      await transaction(callback);throw new Error('private fictional lost acknowledgement');
    });
    await expect(service.logout({refreshToken:token})).rejects.toMatchObject({status:503});
    expect((await sessions.findById(session.id))!.revoked_at).not.toBeNull();
    const rows=await evidence('LOGOUT');expect(rows).toHaveLength(1);expect(rows[0].status).toBe('PENDING');
  });

  it('does not roll back logout or drain unrelated backlog after immediate delivery fails', async () => {
    const {token,session}=await seed();
    const unrelated=await outbox.recordAuditIntent({action:'UPDATE',entityType:'user_sessions',entityId:session.id,actorId:actor,newValue:{fixture:'unrelated'}});
    const drain=jest.spyOn(outbox,'drainOutbox');
    jest.spyOn(outbox,'processOutboxEntry').mockRejectedValue(new Error('private fictional delivery failure'));
    expect(await service.logout({refreshToken:token})).toEqual({success:true});
    expect(drain).not.toHaveBeenCalled();
    expect((await sessions.findById(session.id))!.revoked_at).not.toBeNull();
    const rows=await evidence('LOGOUT');expect(rows[0]).toMatchObject({status:'FAILED',retry_count:1,last_error:'LOGOUT_AUDIT_DELIVERY_FAILED'});
    expect(rows[0].next_attempt_at).not.toBeNull();
    expect((await db.query('SELECT status FROM audit_outbox WHERE id=$1',[unrelated.id])).rows[0].status).toBe('PENDING');
  });

  it('refuses logout mutations without durable dependencies instead of silently falling back', async () => {
    const {token,session}=await seed();
    const unavailable=new AuthService(new JwtService(),{} as any,users,sessions,new BranchRepository(db),new AuditRepository(db),new TestSmsProviderAdapter());
    await expect(unavailable.logout({refreshToken:token})).rejects.toMatchObject({status:503});
    await expect(unavailable.logoutAll(actor)).rejects.toMatchObject({status:503});
    expect((await sessions.findById(session.id))!.revoked_at).toBeNull();expect(await evidence('LOGOUT')).toHaveLength(0);
  });
});
