import {Test, TestingModule} from '@nestjs/testing';
import {INestApplication} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as request from 'supertest';
import {randomUUID} from 'crypto';
import {AppModule} from '../src/app.module';
import {DatabaseService} from '../src/database/database.service';
import {UserRepository} from '../src/database/repositories/user.repository';
import {SessionRepository} from '../src/database/repositories/session.repository';
import {ChangeRequestsService} from '../src/modules/change-requests/change-requests.service';
import {AuditOutboxRepository} from '../src/database/repositories/audit-outbox.repository';
import {Role, ChangeRequestType} from '@kashyap/contracts';
import {getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER} from '../src/modules/auth/auth.constants';
import {createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation} from './helpers/disposable-db';

describe('Change request privacy projection and private attachment admission (PostgreSQL/HTTP)', () => {
  let iso: DisposableDatabase, app: INestApplication, module: TestingModule, db: DatabaseService;
  let owner: any, other: any, reviewer: any, person: string, clean: string, claim: any;
  const secret = 'Fictional restricted address, not requester input';
  const auth = (user: any) => ({Authorization: `Bearer ${user.token}`});
  const body = () => ({targetPersonId: person, type: ChangeRequestType.EDIT_PERSON,
    proposedChanges: {currentAddress: 'Fictional proposed address'}, reason: 'Fictional justified correction'});
  const assertMinimized = (result: any) => {
    expect(result).not.toHaveProperty('currentSnapshot');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.visualDiff.fields.find((field: any) => field.field === 'currentAddress').oldValue).toBeNull();
    expect(result.proposedChanges).toEqual(body().proposedChanges);
  };
  async function asset(userId: string, changes: any = {}) {
    const id = randomUUID();
    await db.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,is_private,quarantine_status,retention_status)
      VALUES($1,$2,$3,$4,$3,'image/png',100,$5,$6,$7)`,
      [id,userId,`evidence_${id}.png`,changes.bucket ?? 'private-profiles',changes.private ?? true,changes.scan ?? 'CLEAN',changes.retention ?? 'ACTIVE']);
    return id;
  }
  beforeAll(async () => {
    iso = await createDisposableDatabase('change_disclosure');
    await assertDatabaseIsolation(iso.client, iso.dbName);
    module = await Test.createTestingModule({imports: [AppModule]}).compile();
    app = module.createNestApplication(); await app.init();
    db = module.get(DatabaseService); await assertDatabaseIsolation(db, iso.dbName);
    async function user(phone: string, role = Role.REGISTERED_USER) {
      const account = await module.get(UserRepository).findOrCreateByPhone(phone);
      await module.get(UserRepository).setPhoneVerified(account.id, true);
      await module.get(UserRepository).assignRole(account.id, role);
      const session = await module.get(SessionRepository).createSession({userId: account.id, refreshTokenHash: randomUUID(),
        devicePlatform: 'WEB', ipAddress: '127.0.0.1', userAgent: 'fictional-change-privacy', expiresAt: new Date(Date.now()+3600000)});
      return {id: account.id, token: module.get(JwtService).sign({sub: account.id, sid: session.id, tokenType: 'access'},
        {secret: getJwtSecret(), issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithm: JWT_ALGORITHM})};
    }
    owner = await user('+9779847555631'); other = await user('+9779847555632'); reviewer = await user('+9779847555633', Role.SUPER_ADMIN);
    person = (await db.query("INSERT INTO persons(gender,living_status,generation,current_address,birth_date_bs,profile_visibility,address_visibility,dob_visibility) VALUES('OTHER','LIVING',3,$1,'2040-01-01','PRIVATE','PRIVATE','PRIVATE') RETURNING id", [secret])).rows[0].id;
    clean = await asset(owner.id);
  }, 60000);
  afterAll(async () => { if (app) await app.close(); if (iso) await iso.drop(); });

  it('keeps internal review snapshots while minimizing requester submit/get/list/resubmit responses', async () => {
    await request(app.getHttpServer()).get(`/genealogy/people/${person}`).set(auth(owner)).expect(403);
    claim = (await request(app.getHttpServer()).post('/change-requests').set(auth(owner)).send({...body(), evidenceAssetIds: [clean]}).expect(201)).body;
    assertMinimized(claim);
    const internal = (await db.query('SELECT current_snapshot FROM genealogy_change_requests WHERE id=$1', [claim.id])).rows[0].current_snapshot;
    expect(internal.currentAddress).toBe(secret);
    assertMinimized((await request(app.getHttpServer()).get(`/change-requests/${claim.id}`).set(auth(owner)).expect(200)).body);
    const own = (await request(app.getHttpServer()).get('/change-requests').set(auth(owner)).expect(200)).body;
    assertMinimized(own.find((row: any) => row.id === claim.id));
    await request(app.getHttpServer()).get(`/change-requests/${claim.id}`).set(auth(other)).expect(403);
    const review = (await request(app.getHttpServer()).get(`/change-requests/${claim.id}`).set(auth(reviewer)).expect(200)).body;
    expect(review.currentSnapshot.currentAddress).toBe(secret);
    await request(app.getHttpServer()).post(`/change-requests/${claim.id}/correction-request`).set(auth(reviewer)).send({notes: 'Clarify fictional proposal'}).expect(201);
    assertMinimized((await request(app.getHttpServer()).post(`/change-requests/${claim.id}/resubmit`).set(auth(owner)).send({proposedChanges: body().proposedChanges}).expect(201)).body);
  });

  it('does not disclose a snapshot through administrator-owned proposals or recused reviewer reads', async () => {
    const own = (await request(app.getHttpServer()).post('/change-requests').set(auth(reviewer)).send(body()).expect(201)).body;
    assertMinimized(own);
    assertMinimized((await request(app.getHttpServer()).get(`/change-requests/${own.id}`).set(auth(reviewer)).expect(200)).body);
    assertMinimized((await request(app.getHttpServer()).post(`/change-requests/${own.id}/escalate`).set(auth(reviewer)).send({notes: 'Fictional own escalation'}).expect(201)).body);
    const relative = (await db.query("INSERT INTO persons(gender,living_status,generation) VALUES('OTHER','LIVING',2) RETURNING id")).rows[0].id;
    await db.query('UPDATE user_accounts SET person_id=$1 WHERE id=$2', [relative, reviewer.id]);
    await db.query("INSERT INTO parent_links(parent_id,child_id,parent_type,confidence,created_by) VALUES($1,$2,'BIOLOGICAL','VERIFIED',$3)", [relative, person, reviewer.id]);
    try {
      assertMinimized((await request(app.getHttpServer()).get(`/change-requests/${claim.id}`).set(auth(reviewer)).expect(200)).body);
      const rows = (await request(app.getHttpServer()).get('/change-requests').set(auth(reviewer)).expect(200)).body;
      assertMinimized(rows.find((row: any) => row.id === claim.id));
    } finally { await db.query('UPDATE user_accounts SET person_id=NULL WHERE id=$1', [reviewer.id]); }
  });

  it('refuses foreign/public/unscanned/deleted evidence without proposal, link or transition writes', async () => {
    const assets = [await asset(other.id), await asset(owner.id,{bucket: 'public-community',private: false}),
      await asset(owner.id,{scan: 'PENDING_SCAN'}), await asset(owner.id,{retention: 'DELETED'}), randomUUID()];
    const before = (await db.query('SELECT count(*) FROM genealogy_change_requests WHERE requester_user_id=$1',[owner.id])).rows[0].count;
    for (const id of assets) {
      await request(app.getHttpServer()).post('/change-requests').set(auth(owner)).send({...body(),evidenceAssetIds:[id]}).expect(403);
      expect((await db.query('SELECT 1 FROM change_request_evidence_attachments WHERE media_asset_id=$1',[id])).rows).toHaveLength(0);
    }
    expect((await db.query('SELECT count(*) FROM genealogy_change_requests WHERE requester_user_id=$1',[owner.id])).rows[0].count).toBe(before);
  });

  it('retains row locks through attachment and audit commit against concurrent retention updates', async () => {
    const audit = module.get(AuditOutboxRepository), original = audit.recordAuditIntent.bind(audit);
    let release!: () => void, reached!: () => void;
    const paused = new Promise<void>(resolve => {release = resolve;});
    const started = new Promise<void>(resolve => {reached = resolve;});
    const spy = jest.spyOn(audit,'recordAuditIntent').mockImplementationOnce(async (intent, client) => {
      reached(); await paused; return original(intent, client);
    });
    const pending = module.get(ChangeRequestsService).submitRequest(owner.id,{...body(),evidenceAssetIds:[clean]});
    try {
      await started;
      await iso.client.query("SET statement_timeout='200ms'");
      await expect(iso.client.query("UPDATE media_assets SET retention_status='DELETED' WHERE id=$1",[clean])).rejects.toMatchObject({code:'57014'});
    } finally { release(); await iso.client.query('RESET statement_timeout'); spy.mockRestore(); }
    const saved = await pending;
    expect((await db.query('SELECT 1 FROM change_request_evidence_attachments WHERE change_request_id=$1 AND media_asset_id=$2',[saved.id,clean])).rows).toHaveLength(1);
    expect((await db.query('SELECT retention_status FROM media_assets WHERE id=$1',[clean])).rows[0].retention_status).toBe('ACTIVE');
  });
});
