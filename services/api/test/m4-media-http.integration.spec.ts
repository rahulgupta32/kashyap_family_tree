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
    const person = (await db.query("INSERT INTO persons (gender, living_status, generation, branch_id, birth_year_bs) VALUES ('MALE', 'LIVING', 3, $1, 2040) RETURNING id", [branchId])).rows[0];
    const upload = await profile.uploadPhoto(owner.id, 'image/png',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==');
    assetId = upload.assetId;
    signedProfile = upload.url.replace('/api/v1', '');
    const claim = await module.get(ClaimsService).submitClaim(owner.id, {
      targetPersonId: person.id, relationshipDescription: 'Fictional HTTP evidence fixture', statementOfTruth: true,
      evidenceAttachments: [{ mediaAssetId: assetId, documentType: 'family_photo' }],
    });
    signedEvidence = claim.evidenceAttachments[0].mediaUrl!.replace('/api/v1', '');
  });

  afterAll(async () => {
    if (app) await app.close();
    if (iso) await iso.drop();
    if (tempStorage) fs.rmSync(tempStorage, { recursive: true, force: true });
    if (oldStorage === undefined) delete process.env.STORAGE_PATH;
    else process.env.STORAGE_PATH = oldStorage;
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
