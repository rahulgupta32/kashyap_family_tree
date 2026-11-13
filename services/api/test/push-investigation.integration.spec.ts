import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { Role } from '@kashyap/contracts';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { PushInvestigationService } from '../src/modules/audit/push-investigation.service';
import { AuditRecoveryService } from '../src/modules/audit/audit-recovery.service';
import { PUSH_NOTIFICATION_PROVIDER } from '../src/modules/notifications/push-provider.interface';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, getJwtSecret } from '../src/modules/auth/auth.constants';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Privileged push investigation (real PostgreSQL, no provider transmission)', () => {
  let iso: DisposableDatabase, app: INestApplication, db: DatabaseService, service: PushInvestigationService;
  let auditRecovery: AuditRecoveryService, reviewer: any, other: any, count = 0;
  const provider = { send: jest.fn() };
  beforeAll(async () => {
    iso = await createDisposableDatabase('push_investigation');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUSH_NOTIFICATION_PROVIDER).useValue(provider).compile();
    app = module.createNestApplication(); await app.init(); db = module.get(DatabaseService);
    await assertDatabaseIsolation(db, iso.dbName);
    service = module.get(PushInvestigationService); auditRecovery = module.get(AuditRecoveryService);
    async function actor(phone: string) {
      const id = (await db.query('INSERT INTO user_accounts(phone_number,is_phone_verified) VALUES($1,true) RETURNING id', [phone])).rows[0].id;
      await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'SUPER_ADMIN')", [id]);
      const sessionId = (await db.query(`INSERT INTO user_sessions(user_id,refresh_token_hash,device_platform,expires_at,mfa_verified_at,mfa_generation)
        VALUES($1,$2,'WEB',clock_timestamp()+INTERVAL '1 hour',clock_timestamp(),1) RETURNING id`, [id, randomUUID()])).rows[0].id;
      await db.query('INSERT INTO account_authenticators(user_id,generation,enabled_at) VALUES($1,1,clock_timestamp())', [id]);
      const token = module.get(JwtService).sign({ sub: id, sid: sessionId, phoneNumber: phone, tokenType: 'access' },
        { secret: getJwtSecret(), issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithm: JWT_ALGORITHM });
      return { id, sessionId, token, roles: [Role.SUPER_ADMIN] };
    }
    reviewer = await actor('+9779847800011'); other = await actor('+9779847800012');
  }, 60000);
  afterEach(() => { jest.restoreAllMocks(); expect(provider.send).not.toHaveBeenCalled(); });
  afterAll(async () => { if (app) await app.close(); if (iso) await iso.drop(); });
  const bearer = (user: any) => ({ Authorization: `Bearer ${user.token}` });
  async function seed(status = 'RECONCILIATION_REQUIRED', channel = 'PUSH', created = new Date().toISOString()) {
    const user = (await db.query('INSERT INTO user_accounts(phone_number) VALUES($1) RETURNING id',
      ['+977984781' + String(++count).padStart(4, '0')])).rows[0].id;
    const id = (await db.query(`INSERT INTO notification_dispatches(recipient_user_id,channel,event_type,payload,error_message,delivery_status,created_at)
      VALUES($1,$2,'PRIVATE_FICTIONAL_EVENT',$3,'PRIVATE_FICTIONAL_PROVIDER_ERROR',$4,$5) RETURNING id`,
      [user, channel, JSON.stringify({ privateFamilyDetail: 'PRIVATE_FICTIONAL_PAYLOAD' }), status, created])).rows[0].id;
    return { id, user };
  }
  async function attempt(dispatch: string, status: string, outcome: string | null = null, expired = false) {
    const id = (await db.query(`INSERT INTO push_delivery_attempts(dispatch_id,registration_id,token_generation)
      VALUES($1,$2,$3) RETURNING id`, [dispatch, randomUUID(), randomUUID()])).rows[0].id;
    if (status !== 'PLANNED') {
      const claim = randomUUID();
      await db.query(`UPDATE push_delivery_attempts SET status='SENDING',claim_id=$2,
        lease_expires_at=clock_timestamp()+$3::interval WHERE id=$1`, [id, claim, expired ? '-1 minute' : '1 minute']);
      if (status !== 'SENDING') await db.query(`UPDATE push_delivery_attempts SET status=$2::varchar,
        receipt_hash=CASE WHEN $2::varchar='ACCEPTED' THEN $3::text ELSE NULL END,completed_at=clock_timestamp() WHERE id=$1`, [id, status, 'a'.repeat(64)]);
      if (outcome) await db.query(`INSERT INTO push_provider_observations(attempt_id,claim_id,outcome,receipt_hash)
        VALUES($1,$2,$3::varchar,CASE WHEN $3::varchar='ACCEPTED' THEN $4::text ELSE NULL END)`, [id, claim, outcome, 'b'.repeat(64)]);
    }
    return id;
  }
  it('enforces authenticated current Super Admin/MFA access with no-store responses', async () => {
    await request(app.getHttpServer()).get('/audit/delivery/pushes').expect(401);
    const f = await seed();
    const list = await request(app.getHttpServer()).get('/audit/delivery/pushes').set(bearer(reviewer)).expect(200);
    expect(list.headers['cache-control']).toBe('no-store'); expect(list.body.items.some((x: any) => x.id === f.id)).toBe(true);
    await request(app.getHttpServer()).get(`/audit/delivery/pushes/${f.id}`).set(bearer(reviewer)).expect(200);
    await db.query("UPDATE user_roles SET role='CENTRAL_ADMIN' WHERE user_id=$1", [other.id]);
    await request(app.getHttpServer()).get('/audit/delivery/pushes').set(bearer(other)).expect(403);
    await db.query("UPDATE user_roles SET role='SUPER_ADMIN' WHERE user_id=$1", [other.id]);
    await db.query('UPDATE user_sessions SET mfa_generation=0 WHERE id=$1', [other.sessionId]);
    await request(app.getHttpServer()).get(`/audit/delivery/pushes/${f.id}`).set(bearer(other)).expect(403);
    await db.query('UPDATE user_sessions SET mfa_generation=1 WHERE id=$1', [other.sessionId]);
  });
  it('checks current authority in service calls and denies suspension, stale authentication and owner-revoked sessions', async () => {
    await db.query("UPDATE user_roles SET role='BRANCH_ADMIN' WHERE user_id=$1", [other.id]);
    await expect(service.list(other)).rejects.toThrow('Current Super Admin');
    await db.query("UPDATE user_roles SET role='SUPER_ADMIN' WHERE user_id=$1", [other.id]);
    await db.query('UPDATE user_accounts SET is_suspended=true WHERE id=$1', [other.id]);
    await expect(service.list(other)).rejects.toThrow('Current Super Admin');
    await db.query('UPDATE user_accounts SET is_suspended=false WHERE id=$1', [other.id]);
    await db.query("UPDATE user_sessions SET authenticated_at=clock_timestamp()-INTERVAL '2 hours' WHERE id=$1", [other.sessionId]);
    await expect(service.list(other)).rejects.toThrow('fresh authentication');
    await db.query('UPDATE user_sessions SET authenticated_at=clock_timestamp(),owner_revoked_at=clock_timestamp() WHERE id=$1', [other.sessionId]);
    await expect(service.list(other)).rejects.toThrow('fresh authentication');
    await expect(auditRecovery.list(other)).rejects.toThrow('fresh authentication');
    await db.query('UPDATE user_sessions SET owner_revoked_at=NULL WHERE id=$1', [other.sessionId]);
  });
  it('requires the currently enabled authenticator generation', async () => {
    await db.query('UPDATE account_authenticators SET generation=2 WHERE user_id=$1', [other.id]);
    await expect(service.list(other)).rejects.toThrow('authenticator verification');
    await db.query('UPDATE account_authenticators SET generation=1,enabled_at=NULL WHERE user_id=$1', [other.id]);
    await expect(service.list(other)).rejects.toThrow('authenticator verification');
    await db.query('UPDATE account_authenticators SET enabled_at=clock_timestamp() WHERE user_id=$1', [other.id]);
  });
  it('preserves microsecond/tied-ID cursors without duplicate or missing held records', async () => {
    const fixtures = await Promise.all(Array.from({ length: 3 }, () => seed('FAILED', 'PUSH', '1900-01-01T00:00:00.123456Z')));
    const expected = fixtures.map(f => f.id).sort();
    const first = await service.list(reviewer, { limit: '2' });
    expect(first.items.map(i => i.id)).toEqual(expected.slice(0, 2));
    expect(first.nextCursor).toBe(`1900-01-01T00:00:00.123456Z|${expected[1]}`);
    const next = await service.list(reviewer, { limit: '1', cursor: first.nextCursor });
    expect(next.items.map(i => i.id)).toEqual([expected[2]]);
  });
  it('includes unresolved active claims and failures, excluding ordinary pending, terminal and non-push dispatches', async () => {
    const expired = await seed('PROCESSING'), unknown = await seed('PENDING'), failed = await seed('FAILED');
    await attempt(expired.id, 'SENDING', null, true); await attempt(unknown.id, 'UNKNOWN');
    const pending = await seed('PENDING'), sent = await seed('SENT'), skipped = await seed('SKIPPED'), sms = await seed('FAILED', 'SMS');
    const ids = (await service.list(reviewer, { limit: '50' })).items.map(i => i.id);
    for (const f of [expired, unknown, failed]) expect(ids).toContain(f.id);
    for (const f of [pending, sent, skipped, sms]) expect(ids).not.toContain(f.id);
    expect((await service.detail(reviewer, sent.id)).attempts).toEqual([]);
    await expect(service.detail(reviewer, sms.id)).rejects.toThrow('not found');
    await expect(service.detail(reviewer, randomUUID())).rejects.toThrow('not found');
  });
  it('distinguishes late committed proof, rejection and missing evidence without exposing credentials or mutating evidence', async () => {
    const f = await seed();
    await attempt(f.id, 'UNKNOWN', 'ACCEPTED'); await attempt(f.id, 'REJECTED', 'REJECTED');
    const unknown = await attempt(f.id, 'UNKNOWN'); await attempt(f.id, 'SENDING', null, true);
    // An observation for a different claim must never supply this attempt's result.
    await db.query("INSERT INTO push_provider_observations(attempt_id,claim_id,outcome,receipt_hash) VALUES($1,$2,'ACCEPTED',$3)",
      [unknown, randomUUID(), 'b'.repeat(64)]);
    const before = (await db.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1 ORDER BY id', [f.id])).rows;
    const observations = (await db.query('SELECT o.* FROM push_provider_observations o JOIN push_delivery_attempts a ON a.id=o.attempt_id WHERE a.dispatch_id=$1 ORDER BY o.id', [f.id])).rows;
    const result = await service.detail(reviewer, f.id);
    expect(result.attempts.map((a: any) => a.effectiveOutcome).sort()).toEqual(['ACCEPTED', 'REJECTED', 'SENDING', 'UNKNOWN'].sort());
    expect(result.attempts.some((a: any) => a.claimExpired && !a.observationRecorded)).toBe(true);
    expect(result.acceptanceOnly).toBe(true);
    const serialized = JSON.stringify({ detail: result, page: await service.list(reviewer) });
    for (const secret of ['PRIVATE_FICTIONAL', 'recipient_user_id', 'registration_id', 'token_generation', 'receipt_hash', 'claim_id', f.user, 'a'.repeat(64), 'b'.repeat(64)]) expect(serialized).not.toContain(secret);
    expect((await db.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1 ORDER BY id', [f.id])).rows).toEqual(before);
    expect((await db.query('SELECT o.* FROM push_provider_observations o JOIN push_delivery_attempts a ON a.id=o.attempt_id WHERE a.dispatch_id=$1 ORDER BY o.id', [f.id])).rows).toEqual(observations);
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1', [f.id])).rows[0].delivery_status).toBe('RECONCILIATION_REQUIRED');
  });
  it('rejects malformed identifiers, cursors and limits and redacts dependency errors', async () => {
    for (const q of [{ limit: '0' }, { limit: '51' }, { limit: ['2'] }, { cursor: 'private injected cursor' },
      { cursor: `2026-02-30T00:00:00.123456Z|${randomUUID()}` }, { recipientId: reviewer.id }]) {
      await expect(service.list(reviewer, q)).rejects.toThrow();
    }
    await expect(service.detail(reviewer, 'private-token-value')).rejects.toThrow('Invalid dispatch');
    const spy = jest.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAIL'));
    await expect(service.list(reviewer)).rejects.toThrow('Push investigation is unavailable'); spy.mockRestore();
  });
  it('reports an unavailable corrupt oversized roster instead of presenting partial healthy evidence', async () => {
    const f = await seed();
    for (let n = 0; n < 51; n++) await attempt(f.id, 'PLANNED');
    await expect(service.detail(reviewer, f.id)).rejects.toThrow('Push investigation is unavailable');
  });
});
