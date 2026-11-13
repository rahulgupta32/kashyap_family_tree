import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { ProfileService } from '../src/modules/profile/profile.service';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Private media HTTP authorization (real sessions/PostgreSQL; test scanner)', () => {
  let app: INestApplication;
  let db: DatabaseService;
  let iso: DisposableDatabase;
  let profile: ProfileService;
  let branchId: string;
  let assetId: string;
  let signedProfile: string;
  let signedEvidence: string;
  let owner: { id: string; token: string };
  let stranger: { id: string; token: string };
  let reviewer: { id: string; token: string };
  let central: { id: string; token: string };
  let global: { id: string; token: string };
  let personId: string, claimId: string;
  const oldStorage = process.env.STORAGE_PATH;
  let tempStorage: string;

  beforeAll(async () => {
    iso = await createDisposableDatabase('media_http');
    await assertDatabaseIsolation(iso.client, iso.dbName);
    tempStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'kashyap-media-http-'));
    process.env.STORAGE_PATH = tempStorage;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = module.get(DatabaseService);
    await assertDatabaseIsolation(db, iso.dbName);
    profile = module.get(ProfileService);
    const users = module.get(UserRepository);
    const sessions = module.get(SessionRepository);
    const jwt = module.get(JwtService);
    branchId = (await db.query("INSERT INTO branches (code, name_nepali, name_english) VALUES ('MEDIA_HTTP', 'परीक्षण', 'Fictional media branch') RETURNING id")).rows[0].id;
    async function identity(phone: string, role: Role) {
      const user = await users.findOrCreateByPhone(phone);
      await users.assignRole(user.id, role, role === Role.BRANCH_ADMIN ? branchId : null);
      const session = await sessions.createSession({ userId: user.id, refreshTokenHash: crypto.randomUUID(),
        devicePlatform: 'WEB', ipAddress: '127.0.0.1', userAgent: 'media-http-test', expiresAt: new Date(Date.now() + 3600000) });
      const token = jwt.sign({ sub: user.id, sid: session.id, phoneNumber: phone, tokenType: 'access' },
        { secret: getJwtSecret(), issuer: JWT_ISSUER, audience: JWT_AUDIENCE, algorithm: JWT_ALGORITHM });
      return { id: user.id, token };
    }
    owner = await identity('+9779847100001', Role.REGISTERED_USER);
    stranger = await identity('+9779847100002', Role.REGISTERED_USER);
    reviewer = await identity('+9779847100003', Role.BRANCH_ADMIN);
    central = await identity('+9779847100004', Role.CENTRAL_ADMIN);
    global = await identity('+9779847100005', Role.SUPER_ADMIN);
    const person = (await db.query("INSERT INTO persons (gender, living_status, generation, branch_id, birth_year_bs) VALUES ('MALE', 'LIVING', 3, $1, 2040) RETURNING id", [branchId])).rows[0];
    personId = person.id;
    const upload = await profile.uploadPhoto(owner.id, 'image/png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==');
    assetId = upload.assetId;
    signedProfile = upload.url.replace('/api/v1', '');
    const claim = await module.get(ClaimsService).submitClaim(owner.id, {
      targetPersonId: person.id, relationshipDescription: 'Fictional HTTP evidence fixture', statementOfTruth: true,
      evidenceAttachments: [{ mediaAssetId: assetId, documentType: 'family_photo' }],
    });
    signedEvidence = claim.evidenceAttachments[0].mediaUrl!.replace('/api/v1', '');
    claimId = claim.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (iso) await iso.drop();
    if (tempStorage) fs.rmSync(tempStorage, { recursive: true, force: true });
    if (oldStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = oldStorage;
  });

  it('rejects central authority on alternate evidence routes, including valid signed and processing URLs', async () => {
    const signed = profile.generateSignedMediaUrl(assetId, central.id).replace('/api/v1', '');
    for (const url of [`/claims/evidence/${assetId}`, `/profile/media/${assetId}`,
      `/me/media/${assetId}`, `/profile/media/${assetId}?variant=display`, signed,
      `/profile/media/${assetId}/processing`]) {
      await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${central.token}`).expect(403);
    }
    await request(app.getHttpServer()).post(`/profile/media/${assetId}/retry`)
      .set('Authorization', `Bearer ${central.token}`).send({}).expect(403);
    await request(app.getHttpServer()).get(`/profile/media/${assetId}`)
      .set('Authorization', `Bearer ${global.token}`).expect(200);
  });

  it('uses current family recusal on evidence bytes and descriptors without removing uploader access', async () => {
    const relative = (await db.query("INSERT INTO persons(gender,living_status,generation,branch_id) VALUES('OTHER','LIVING',2,$1) RETURNING id", [branchId])).rows[0].id;
    await db.query("INSERT INTO parent_links(parent_id,child_id,parent_type,confidence,created_by) VALUES($1,$2,'BIOLOGICAL','VERIFIED',$3)", [relative, personId, global.id]);
    for (const actor of [reviewer, global]) {
      await db.query('UPDATE user_accounts SET person_id=$1 WHERE id=$2', [relative, actor.id]);
      try {
        for (const url of [`/claims/evidence/${assetId}`, `/profile/media/${assetId}`, `/me/media/${assetId}`,
          `/profile/media/${assetId}?variant=thumbnail`]) {
          await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${actor.token}`).expect(403);
        }
        const detail = (await request(app.getHttpServer()).get(`/claims/${claimId}`)
          .set('Authorization', `Bearer ${actor.token}`).expect(200)).body;
        expect(detail.evidenceAttachments).toEqual([]);
        expect(detail.claimantPhoneNumber).not.toBe('+9779847100001');
      } finally { await db.query('UPDATE user_accounts SET person_id=NULL WHERE id=$1', [actor.id]); }
    }
    await request(app.getHttpServer()).get(`/claims/evidence/${assetId}`)
      .set('Authorization', `Bearer ${owner.token}`).expect(200);
  });

  it('binds reviewer evidence URLs to the actual authorized viewer rather than the claimant', async () => {
    const detail = (await request(app.getHttpServer()).get(`/claims/${claimId}`)
      .set('Authorization', `Bearer ${reviewer.token}`).expect(200)).body;
    const action = (await request(app.getHttpServer()).post(`/claims/${claimId}/correction-request`)
      .set('Authorization', `Bearer ${reviewer.token}`)
      .send({notes: 'Please clarify this synthetic relationship'}).expect(201)).body;
    const actionUrl = action.evidenceAttachments[0].mediaUrl.replace('/api/v1', '');
    expect(new URL(actionUrl, 'https://synthetic.invalid').searchParams.get('u')).toBe(reviewer.id);
    await request(app.getHttpServer()).get(actionUrl).set('Authorization', `Bearer ${reviewer.token}`).expect(200);
    const signed = detail.evidenceAttachments[0].mediaUrl.replace('/api/v1', '');
    expect(new URL(signed, 'https://synthetic.invalid').searchParams.get('u')).toBe(reviewer.id);
    await request(app.getHttpServer()).get(signed).set('Authorization', `Bearer ${reviewer.token}`).expect(200);
    await request(app.getHttpServer()).get(signed).set('Authorization', `Bearer ${owner.token}`).expect(403);
  });

  it('applies purpose restrictions to proposal-only evidence without widening the claim download route', async () => {
    const uploaded = await profile.uploadClaimEvidence(owner.id, {mimeType: 'image/png',
      dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==',
      documentType: 'family_photo', evidenceNoticeAccepted: true});
    const id = uploaded.mediaAssetId;
    await request(app.getHttpServer()).post('/change-requests').set('Authorization', `Bearer ${owner.token}`)
      .send({targetPersonId: personId, type: 'EDIT_PERSON', proposedChanges: {birthPlace: 'Synthetic place'},
        reason: 'Fictional evidence authorization regression', evidenceAssetIds: [id]}).expect(201);
    await request(app.getHttpServer()).get(`/profile/media/${id}`).set('Authorization', `Bearer ${central.token}`).expect(403);
    await request(app.getHttpServer()).get(`/claims/evidence/${id}`).set('Authorization', `Bearer ${reviewer.token}`).expect(403);
    await request(app.getHttpServer()).get(`/profile/media/${id}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
    await request(app.getHttpServer()).get(`/profile/media/${id}`).set('Authorization', `Bearer ${global.token}`).expect(200);
    await db.query('UPDATE user_accounts SET person_id=$1 WHERE id=$2', [personId, global.id]);
    try {
      await request(app.getHttpServer()).get(`/profile/media/${id}`).set('Authorization', `Bearer ${global.token}`).expect(403);
      await request(app.getHttpServer()).get(`/claims/evidence/${id}`).set('Authorization', `Bearer ${global.token}`).expect(403);
    } finally { await db.query('UPDATE user_accounts SET person_id=NULL WHERE id=$1', [global.id]); }
  });

  it('keeps fresh unsubmitted evidence private to its uploader rather than treating it as an avatar', async () => {
    const upload = await profile.uploadClaimEvidence(owner.id, {mimeType: 'image/png',
      dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==',
      documentType: 'family_photo', evidenceNoticeAccepted: true});
    for (const actor of [central, global]) {
      for (const url of [`/claims/evidence/${upload.mediaAssetId}`, `/profile/media/${upload.mediaAssetId}`, `/me/media/${upload.mediaAssetId}`]) {
        await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${actor.token}`).expect(403);
      }
    }
    await request(app.getHttpServer()).get(`/profile/media/${upload.mediaAssetId}`)
      .set('Authorization', `Bearer ${owner.token}`).expect(200);
  });

  it.each(['profile', 'claims'])('%s route requires a session even with a valid owner signature', async (kind) => {
    const url = kind === 'profile' ? signedProfile : signedEvidence;
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${owner.token}`).expect(200).expect('Content-Type', /image\/png/);
  });

  it.each(['profile', 'claims'])('%s route rejects another account using the owner signature or unsigned asset ID', async (kind) => {
    const signed = kind === 'profile' ? signedProfile : signedEvidence;
    const unsigned = kind === 'profile' ? `/profile/media/${assetId}` : `/claims/evidence/${assetId}`;
    await request(app.getHttpServer()).get(signed).set('Authorization', `Bearer ${stranger.token}`).expect(403);
    await request(app.getHttpServer()).get(unsigned).set('Authorization', `Bearer ${stranger.token}`).expect(403);
  });

  it('permits assigned evidence reviewer, then immediately denies the same JWT after role revocation', async () => {
    const url = `/claims/evidence/${assetId}`;
    await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${reviewer.token}`).expect(200);
    await request(app.getHttpServer()).get(`/profile/media/${assetId}`).set('Authorization', `Bearer ${reviewer.token}`).expect(403);
    await assertDatabaseIsolation(db, iso.dbName);
    await db.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2 AND branch_id = $3', [reviewer.id, Role.BRANCH_ADMIN, branchId]);
    await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${reviewer.token}`).expect(403);
  });

  it.each(['profile', 'claims'])('%s route rejects malformed and expired signatures without a 500 response', async (kind) => {
    const url = new URL(kind === 'profile' ? signedProfile : signedEvidence, 'http://localhost');
    url.searchParams.set('sig', 'z'.repeat(64));
    await request(app.getHttpServer()).get(url.pathname + url.search).set('Authorization', `Bearer ${owner.token}`).expect(401);
    url.searchParams.set('expires', '1');
    url.searchParams.set('sig', '0'.repeat(64));
    await request(app.getHttpServer()).get(url.pathname + url.search).set('Authorization', `Bearer ${owner.token}`).expect(401);
  });

  it('rechecks quarantine and retention on both routes, including previously signed owner URLs', async () => {
    await assertDatabaseIsolation(db, iso.dbName);
    for (const [column, state, expected] of [
      ['quarantine_status', 'QUARANTINED', 403], ['quarantine_status', 'SCANNER_FAILED', 403],
      ['retention_status', 'DELETED', 404], ['retention_status', 'PURGED', 404],
    ] as const) {
      await db.query("UPDATE media_assets SET quarantine_status = 'CLEAN', retention_status = 'ACTIVE' WHERE id = $1", [assetId]);
      await db.query(`UPDATE media_assets SET ${column} = $1 WHERE id = $2`, [state, assetId]);
      for (const url of [signedProfile, signedEvidence]) {
        await request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${owner.token}`).expect(expected);
      }
    }
  });
});
