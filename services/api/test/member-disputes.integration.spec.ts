import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Member disputes, real PostgreSQL/Redis/HTTP and private adjudication', () => {
 let app:INestApplication, db:DatabaseService, iso:DisposableDatabase, claims:ClaimsService, audit:AuditOutboxRepository, dispatcher:NotificationDispatcherService;
 let owner:any, challenger:any, unrelated:any, branchReviewer:any, admin:any, person:string, branch:string, foreignBranch:string, claimId:string, asset:string, dispute:any;
 const auth=(user:any)=>({Authorization:`Bearer ${user.token}`});
 const key=randomUUID();
 const reason='Fictional identity dispute; independent review required';
 let body:any;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('member_disputes');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);claims=module.get(ClaimsService);audit=module.get(AuditOutboxRepository);dispatcher=module.get(NotificationDispatcherService);
  await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('DISPUTE_A','काल्पनिक क','Fictional A') RETURNING id")).rows[0].id;
  foreignBranch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('DISPUTE_B','काल्पनिक ख','Fictional B') RETURNING id")).rows[0].id;
  async function user(phone:string,role=Role.REGISTERED_USER,scope?:string){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).setPhoneVerified(u.id,true);await module.get(UserRepository).assignRole(u.id,role,scope);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'synthetic-dispute',expiresAt:new Date(Date.now()+3600000)});
   await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,FALSE,FALSE,FALSE)',[u.id]);
   return{id:u.id,roles:[role],roleAssignments:[{role,branchId:scope??null}],branchIds:scope?[scope]:[],token:module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM})};
  }
  owner=await user('+9779847660001');challenger=await user('+9779847660002');unrelated=await user('+9779847660003');
  branchReviewer=await user('+9779847660004',Role.BRANCH_VERIFIER,branch);admin=await user('+9779847660005',Role.SUPER_ADMIN);
  person=(await db.query("INSERT INTO persons(gender,living_status,generation,branch_id,is_claimed,claimed_user_id,profile_visibility) VALUES('MALE','LIVING',3,$1,TRUE,$2,'PUBLIC') RETURNING id",[branch,owner.id])).rows[0].id;
  await db.query('UPDATE user_accounts SET person_id=$1 WHERE id=$2',[person,owner.id]);
  claimId=(await db.query("INSERT INTO profile_claims(target_person_id,claimant_user_id,relationship_description,statement_of_truth,status) VALUES($1,$2,'Fictional approved claim',TRUE,'APPROVED') RETURNING id",[person,owner.id])).rows[0].id;
  const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
  asset=(await request(app.getHttpServer()).post('/me/claim-evidence').set(auth(challenger)).send({mimeType:'image/png',dataBase64:png,documentType:'family_photo',evidenceNoticeAccepted:true}).expect(201)).body.mediaAssetId;
  body={submissionKey:key,reason,evidenceAttachments:[{mediaAssetId:asset,documentType:'family_photo'}]};
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 const submit=(u:any,data=body)=>request(app.getHttpServer()).post(`/claims/people/${person}/dispute`).set(auth(u)).send(data);
 it('requires authentication, correct state/owner, bounded input and current Person visibility',async()=>{
  await request(app.getHttpServer()).post(`/claims/people/${person}/dispute`).send(body).expect(401);
  await submit(owner).expect(400);
  await submit(challenger,{...body,reason:'x'.repeat(4001)}).expect(400);
  await submit(challenger,{...body,actorId:admin.id}).expect(400);
  await db.query("UPDATE persons SET profile_visibility='PRIVATE' WHERE id=$1",[person]);
  try{await submit(challenger).expect(403);}finally{await db.query("UPDATE persons SET profile_visibility='PUBLIC' WHERE id=$1",[person]);}
  expect((await db.query('SELECT count(*) FROM member_dispute_receipts')).rows[0].count).toBe('0');
 });
 it('atomically rolls back audit failure and accepts concurrent identical retry once',async()=>{
  const failure=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Fictional audit outage'));
  try{await submit(challenger).expect(500);}finally{failure.mockRestore();}
  expect((await db.query('SELECT status FROM profile_claims WHERE id=$1',[claimId])).rows[0].status).toBe('APPROVED');
  expect((await db.query('SELECT count(*) FROM member_dispute_receipts')).rows[0].count).toBe('0');
  const results=await Promise.all([1,2,3].map(()=>submit(challenger).expect('Cache-Control','private, no-store').expect(201)));
  dispute=results[0].body;expect(new Set(results.map(r=>r.body.id)).size).toBe(1);expect(dispute).toMatchObject({status:'OPEN',targetPersonId:person,reason});
  expect(dispute).not.toHaveProperty('claimId');expect(dispute).not.toHaveProperty('disputantUserId');
  await submit(challenger,{...body,reason:'Changed immutable intent'}).expect(409);
  await submit(challenger,{...body,submissionKey:randomUUID()}).expect(400);
  for(const table of ['claim_disputes','member_dispute_receipts'])expect((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count).toBe('1');
  expect((await db.query("SELECT count(*) FROM audit_outbox WHERE action='CLAIM_DISPUTED' AND entity_id=$1",[dispute.id])).rows[0].count).toBe('1');
 });
 it('minimizes account-owned history, rejects foreign cursors and protects dispute evidence from opponents/branch review',async()=>{
  const mine=(await request(app.getHttpServer()).get('/claims/disputes/mine').set(auth(challenger)).expect('Cache-Control','private, no-store').expect(200)).body;
  expect(mine.items).toHaveLength(1);expect(JSON.stringify(mine)).not.toContain(claimId);expect(JSON.stringify(mine)).not.toContain(owner.id);
  expect((await request(app.getHttpServer()).get('/claims/disputes/mine').set(auth(unrelated)).expect(200)).body.items).toEqual([]);
  await request(app.getHttpServer()).get(`/claims/disputes/mine?cursor=${dispute.id}`).set(auth(unrelated)).expect(400);
  await request(app.getHttpServer()).get(`/claims/${claimId}`).set(auth(challenger)).expect(403);
  for(const reader of [owner,branchReviewer]){
   const detail=(await request(app.getHttpServer()).get(`/claims/${claimId}`).set(auth(reader)).expect(200)).body;
   expect(JSON.stringify(detail)).not.toContain(asset);
   await request(app.getHttpServer()).get(`/claims/evidence/${asset}`).set(auth(reader)).expect(403);
  }
  for(const reader of [challenger,admin])await request(app.getHttpServer()).get(`/claims/evidence/${asset}`).set(auth(reader)).expect(200);
  const adjudication=(await request(app.getHttpServer()).get(`/claims/${claimId}`).set(auth(admin)).expect(200)).body;
  expect(adjudication.evidenceAttachments).toEqual(expect.arrayContaining([expect.objectContaining({mediaAssetId:asset,disputeId:dispute.id})]));
  await db.query('UPDATE user_roles SET branch_id=$1 WHERE user_id=$2 AND role=$3',[foreignBranch,branchReviewer.id,Role.BRANCH_VERIFIER]);
  try{await request(app.getHttpServer()).get(`/claims/${claimId}`).set(auth(branchReviewer)).expect(403);}finally{await db.query('UPDATE user_roles SET branch_id=$1 WHERE user_id=$2 AND role=$3',[branch,branchReviewer.id,Role.BRANCH_VERIFIER]);}
 });
 it('retains terminal decisions/replay and both-party notices without identity takeover or mutable receipts',async()=>{
  await request(app.getHttpServer()).post(`/claims/disputes/${dispute.id}/resolve`).set(auth(branchReviewer)).send({decision:'RESOLVED',notes:'Not authorized'}).expect(403);
  await request(app.getHttpServer()).post(`/claims/disputes/${dispute.id}/resolve`).set(auth(admin)).send({decision:'DISMISSED',notes:'Independent fictional dismissal'}).expect(201);
  expect((await submit(challenger).expect(201)).body).toMatchObject({id:dispute.id,status:'DISMISSED'});
  const events=(await db.query("SELECT * FROM audit_outbox WHERE action='DISPUTE_DISMISSED' AND entity_id=$1",[dispute.id])).rows;
  expect(events).toHaveLength(1);await dispatcher.processRecord(events[0]);await dispatcher.processRecord(events[0]);
  const recipients=(await db.query('SELECT recipient_user_id FROM notification_inbox WHERE outbox_id=$1',[events[0].id])).rows.map(r=>r.recipient_user_id);
  expect(recipients.sort()).toEqual([owner.id,challenger.id,admin.id].sort());
  const again=(await submit(challenger,{...body,submissionKey:randomUUID()}).expect(201)).body;
  await request(app.getHttpServer()).post(`/claims/disputes/${again.id}/resolve`).set(auth(admin)).send({decision:'RESOLVED',notes:'Independent fictional upheld decision'}).expect(201);
  const history=(await request(app.getHttpServer()).get('/claims/disputes/mine').set(auth(challenger)).expect(200)).body.items;
  expect(history.map((r:any)=>r.status).sort()).toEqual(['DISMISSED','RESOLVED']);
  expect((await db.query('SELECT person_id FROM user_accounts WHERE id=$1',[owner.id])).rows[0].person_id).toBeNull();
  expect((await db.query('SELECT is_claimed FROM persons WHERE id=$1',[person])).rows[0].is_claimed).toBe(false);
  await expect(db.query('DELETE FROM member_dispute_receipts WHERE account_id=$1',[challenger.id])).rejects.toThrow('MEMBER_DISPUTE_RECEIPT_RETAINED');
  const down=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/066_member_dispute_receipts.down.sql'),'utf8');
  await expect(db.query(down)).rejects.toThrow('MEMBER_DISPUTE_RECEIPTS_RETAINED');
 });
});
