import {Test} from '@nestjs/testing';
import {INestApplication} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as request from 'supertest';
import {randomUUID} from 'crypto';
import {AppModule} from '../src/app.module';
import {DatabaseService} from '../src/database/database.service';
import {UserRepository} from '../src/database/repositories/user.repository';
import {SessionRepository} from '../src/database/repositories/session.repository';
import {AuditOutboxRepository} from '../src/database/repositories/audit-outbox.repository';
import {ClaimsService} from '../src/modules/claims/claims.service';
import {Role} from '@kashyap/contracts';
import {getJwtSecret,JWT_ALGORITHM,JWT_AUDIENCE,JWT_ISSUER} from '../src/modules/auth/auth.constants';
import {createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation} from './helpers/disposable-db';
describe('Private claim upload, attachment, replay and reviewer access (PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository,claims:ClaimsService,a:any,b:any,c:any,reviewer:any,asset:any,person:string,claim:any;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
 const auth=(u=a)=>({Authorization:`Bearer ${u.token}`});
 const uploadBody={mimeType:'image/png',dataBase64:png,documentType:'family_photo',evidenceNoticeAccepted:true};
 async function target(){return(await db.query("INSERT INTO persons(gender,living_status,generation) VALUES('MALE','LIVING',3) RETURNING id")).rows[0].id;}
 beforeAll(async()=>{
  iso=await createDisposableDatabase('claim_evidence');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);audit=module.get(AuditOutboxRepository);claims=module.get(ClaimsService);await assertDatabaseIsolation(db,iso.dbName);
  async function user(phone:string,role=Role.REGISTERED_USER){const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).setPhoneVerified(u.id,true);await module.get(UserRepository).assignRole(u.id,role);
   const s=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'fictional-evidence-fixture',expiresAt:new Date(Date.now()+3600000)});
   return{id:u.id,token:module.get(JwtService).sign({sub:u.id,sid:s.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM})};}
  a=await user('+9779847555621');b=await user('+9779847555622');c=await user('+9779847555623');reviewer=await user('+9779847555624',Role.SUPER_ADMIN);person=await target();
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires auth/notice and refuses prohibited document categories',async()=>{
  await request(app.getHttpServer()).post('/me/claim-evidence').send(uploadBody).expect(401);
  for(const body of [{...uploadBody,documentType:'passport'},{...uploadBody,evidenceNoticeAccepted:false},{...uploadBody,actorId:a.id}])await request(app.getHttpServer()).post('/me/claim-evidence').set(auth()).send(body).expect(400);
 });
 it('uploads private evidence without changing avatar and keeps unrelated readers out',async()=>{
  const before=(await db.query('SELECT avatar_asset_id FROM user_accounts WHERE id=$1',[a.id])).rows[0];
  asset=(await request(app.getHttpServer()).post('/me/claim-evidence').set(auth()).send(uploadBody).expect(201)).body;
  expect(asset).toMatchObject({documentType:'family_photo',quarantineStatus:'CLEAN'});expect(asset).not.toHaveProperty('url');
  expect((await db.query('SELECT avatar_asset_id FROM user_accounts WHERE id=$1',[a.id])).rows[0]).toEqual(before);
  expect((await db.query('SELECT bucket,is_private,uploader_user_id FROM media_assets WHERE id=$1',[asset.mediaAssetId])).rows[0]).toEqual({bucket:'private-profiles',is_private:true,uploader_user_id:a.id});
  await request(app.getHttpServer()).get(`/claims/evidence/${asset.mediaAssetId}`).set(auth(b)).expect(403);
 });
 it('atomically creates one claim/attachment/transition/audit for concurrent keyed retries',async()=>{
  const body={creationKey:randomUUID(),targetPersonId:person,relationshipDescription:'Fictional self claim',statementOfTruth:true,evidenceAttachments:[{mediaAssetId:asset.mediaAssetId,documentType:'family_photo'}]};
  const results=await Promise.all([1,2,3].map(()=>request(app.getHttpServer()).post('/claims').set(auth()).send(body).expect(201)));claim=results[0].body;
  expect(new Set(results.map(r=>r.body.id)).size).toBe(1);expect(claim.evidenceAttachments).toHaveLength(1);
  expect((await db.query('SELECT count(*) FROM claim_creation_receipts WHERE account_id=$1',[a.id])).rows[0].count).toBe('1');
  expect((await db.query("SELECT count(*) FROM audit_outbox WHERE entity_id=$1 AND action='CLAIM_SUBMITTED'",[claim.id])).rows[0].count).toBe('1');
  expect((await db.query('SELECT count(*) FROM workflow_state_transitions WHERE entity_id=$1',[claim.id])).rows[0].count).toBe('1');
  await request(app.getHttpServer()).post('/claims').set(auth()).send({...body,relationshipDescription:'Changed content'}).expect(409);
  const visible=(await request(app.getHttpServer()).get(`/claims/${claim.id}`).set(auth(reviewer)).expect(200)).body;expect(visible.evidenceAttachments[0].mediaAssetId).toBe(asset.mediaAssetId);
  await request(app.getHttpServer()).get(`/claims/evidence/${asset.mediaAssetId}`).set(auth(reviewer)).expect(200);
  await request(app.getHttpServer()).get(`/claims/${claim.id}`).set(auth(b)).expect(403);
 });
 it('lists only current-account minimized summaries even for reviewers and ignores claimant filters',async()=>{
  await request(app.getHttpServer()).get('/claims/mine').expect(401);
  const own=(await request(app.getHttpServer()).get(`/claims/mine?claimantUserId=${b.id}`).set(auth()).expect('Cache-Control','private, no-store').expect(200)).body;
  expect(own).toHaveLength(1);expect(own[0]).toMatchObject({id:claim.id,status:'PENDING_TIER1',version:1});
  expect(Object.keys(own[0]).sort()).toEqual(['createdAt','id','status','targetPersonId','updatedAt','version'].sort());
  expect((await request(app.getHttpServer()).get('/claims/mine').set(auth(b)).expect(200)).body).toEqual([]);
  expect((await request(app.getHttpServer()).get('/claims/mine').set(auth(reviewer)).expect(200)).body).toEqual([]);
 });
 it('serializes concurrent correction resubmissions and fences later correction cycles',async()=>{
  const correction=(await request(app.getHttpServer()).post(`/claims/${claim.id}/correction-request`).set(auth(reviewer)).send({notes:'Clarify fictional relation'}).expect(201)).body;
  const body={expectedVersion:correction.version,relationshipDescription:'Updated fictional relation',statementOfTruth:true};
  await request(app.getHttpServer()).post(`/claims/${claim.id}/resubmit`).set(auth(b)).send(body).expect(403);
  await request(app.getHttpServer()).post(`/claims/${claim.id}/resubmit`).set(auth()).send({...body,evidenceAttachments:{}}).expect(400);
  const results=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post(`/claims/${claim.id}/resubmit`).set(auth()).send(body)));
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  const current=(await request(app.getHttpServer()).get(`/claims/${claim.id}`).set(auth()).expect(200)).body;
  expect(current).toMatchObject({status:'PENDING_TIER1',version:correction.version+1,resubmissionCount:1,relationshipDescription:body.relationshipDescription});
  expect(current.evidenceAttachments.map((e:any)=>e.mediaAssetId)).toEqual([asset.mediaAssetId]);
  expect((await db.query("SELECT count(*) FROM audit_outbox WHERE entity_id=$1 AND action='CLAIM_RESUBMITTED'",[claim.id])).rows[0].count).toBe('1');
  const later=(await request(app.getHttpServer()).post(`/claims/${claim.id}/correction-request`).set(auth(reviewer)).send({notes:'Second fictional review'}).expect(201)).body;
  await request(app.getHttpServer()).post(`/claims/${claim.id}/resubmit`).set(auth()).send(body).expect(409);
  const unchanged=(await request(app.getHttpServer()).get(`/claims/${claim.id}`).set(auth()).expect(200)).body;
  expect(unchanged).toMatchObject({status:'CORRECTION_REQUESTED',version:later.version,resubmissionCount:1});
 });
 it('does not let another account attach the upload',async()=>{
  const body={targetPersonId:await target(),relationshipDescription:'Fictional different member',statementOfTruth:true,evidenceAttachments:[{mediaAssetId:asset.mediaAssetId,documentType:'family_photo'}]};
  await request(app.getHttpServer()).post('/claims').set(auth(b)).send(body).expect(403);
  expect((await db.query('SELECT 1 FROM profile_claims WHERE claimant_user_id=$1',[b.id])).rows).toHaveLength(0);
 });
 it('rolls back claim and receipt on audit failure; retry uses same key and current account',async()=>{
  const body={creationKey:randomUUID(),targetPersonId:await target(),relationshipDescription:'Fictional rollback',statementOfTruth:true};
  const fail=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected claim audit outage'));
  try{await expect(claims.submitClaim(c.id,body)).rejects.toThrow('Injected');}finally{fail.mockRestore();}
  expect((await db.query('SELECT 1 FROM claim_creation_receipts WHERE account_id=$1',[c.id])).rows).toHaveLength(0);
  const created=await claims.submitClaim(c.id,body);expect((await claims.submitClaim(c.id,body)).id).toBe(created.id);
  const other=await claims.submitClaim(b.id,{...body,targetPersonId:await target()});expect(other.id).not.toBe(created.id);
 });
 it('retains immutable receipts and rejects downgrade erasing replay evidence',async()=>{
  await expect(db.query('DELETE FROM claim_creation_receipts WHERE account_id=$1',[a.id])).rejects.toThrow('CLAIM_CREATE_RECEIPT_IMMUTABLE');
  const fs=require('fs'),path=require('path');await expect(db.transaction(tx=>tx.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/062_claim_creation_receipts.down.sql'),'utf8')))).rejects.toThrow('CLAIM_CREATE_RECEIPTS_RETAINED');
 });
});
