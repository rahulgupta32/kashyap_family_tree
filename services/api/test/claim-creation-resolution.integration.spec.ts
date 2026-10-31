import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Claim initial-create resolution with real account locking and immutable closure',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository,claims:ClaimsService,n=0;
 const admissionKeys=new Set<string>();
 const auth=(u:any)=>({Authorization:'Bearer '+u.token});
 async function actor(){
  const u=await app.get(UserRepository).findOrCreateByPhone('+97798475558'+String(++n).padStart(2,'0'));
  await app.get(UserRepository).setPhoneVerified(u.id,true);await app.get(UserRepository).assignRole(u.id,Role.REGISTERED_USER);
  const s=await app.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',expiresAt:new Date(Date.now()+3600000)});
  admissionKeys.add(`claims:creation-resolution:account:${u.id}`);
  return {id:u.id,token:app.get(JwtService).sign({sub:u.id,sid:s.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM})};
 }
 async function intent(){return {creationKey:randomUUID(),targetPersonId:(await db.query("INSERT INTO persons(gender,living_status,generation) VALUES('MALE','LIVING',3) RETURNING id")).rows[0].id,relationshipDescription:'Fictional retained creation body',statementOfTruth:true};}
 const resolve=(u:any,b:any)=>request(app.getHttpServer()).post('/claims/creation-resolution').set(auth(u)).send(b);
 async function counts(u:any,key:string){return (await db.query(`SELECT
  (SELECT count(*) FROM claim_creation_receipts WHERE account_id=$1 AND creation_key=$2) AS receipts,
  (SELECT count(*) FROM claim_creation_closures WHERE account_id=$1 AND creation_key=$2) AS closures,
  (SELECT count(*) FROM profile_claims WHERE claimant_user_id=$1) AS claims,
  (SELECT count(*) FROM audit_outbox WHERE actor_id=$1::text AND entity_id=$2::text AND action='PROFILE_CLAIM_CREATION_ABANDONED') AS audits`,[u.id,key])).rows[0];}
 beforeAll(async()=>{
  iso=await createDisposableDatabase('claim_creation_resolution');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);audit=module.get(AuditOutboxRepository);claims=module.get(ClaimsService);await assertDatabaseIsolation(db,iso.dbName);
 },60000);
 afterAll(async()=>{if(app){if(admissionKeys.size)await app.get(RedisService).del(...admissionKeys);await app.close();}if(iso)await iso.drop();});
 it('requires authentication, original complete metadata and active current accounts',async()=>{
  const u=await actor(),b=await intent();await request(app.getHttpServer()).post('/claims/creation-resolution').send(b).expect(401);
  for(const change of [{creationKey:undefined},{targetPersonId:'invalid'},{statementOfTruth:'true'},{evidenceAttachments:{}},{accountId:u.id}])await resolve(u,{...b,...change}).expect(400);
  await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[u.id]);
  try{await resolve(u,b).expect(403);}finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[u.id]);}
  expect(await counts(u,b.creationKey)).toEqual({receipts:'0',closures:'0',claims:'0',audits:'0'});
 });
 it('does not create closure or audit when Redis admission is unavailable',async()=>{
  const u=await actor(),body=await intent();
  const unavailable=jest.spyOn(app.get(RedisService),'isReady').mockReturnValueOnce(false);
  try{await resolve(u,body).expect(503);}finally{unavailable.mockRestore();}
  expect(await counts(u,body.creationKey)).toEqual({receipts:'0',closures:'0',claims:'0',audits:'0'});
 });
 it('bounds concurrent distinct-key closures per account using live Redis admission',async()=>{
  const u=await actor(),body=await intent();
  const results=await Promise.all(Array.from({length:11},()=>resolve(u,{...body,creationKey:randomUUID()})));
  expect(results.filter(r=>r.status===201)).toHaveLength(10);
  expect(results.filter(r=>r.status===429)).toHaveLength(1);
  expect((await db.query('SELECT count(*) AS total FROM claim_creation_closures WHERE account_id=$1',[u.id])).rows[0].total).toBe('10');
 });
 it('closes an unavailable target/evidence attempt, replays one audit, and blocks its old key permanently',async()=>{
  const u=await actor(),b={...(await intent()),targetPersonId:randomUUID(),evidenceAttachments:[{mediaAssetId:randomUUID(),documentType:'family_photo'}]};
  const results=await Promise.all([resolve(u,b),resolve(u,b),resolve(u,b)]);for(const r of results){expect(r.status).toBe(201);expect(r.body).toEqual({outcome:'ABANDONED'});expect(r.headers['cache-control']).toBe('private, no-store');}
  await request(app.getHttpServer()).post('/claims').set(auth(u)).send(b).expect(409);
  await request(app.getHttpServer()).post('/claims').set(auth(u)).send({...b,relationshipDescription:'Changed closed create'}).expect(409);
  await resolve(u,{...b,relationshipDescription:'Changed immutable payload'}).expect(409);
  expect(await counts(u,b.creationKey)).toEqual({receipts:'0',closures:'1',claims:'0',audits:'1'});
  expect((await db.query("SELECT 1 FROM workflow_state_transitions WHERE actor_user_id=$1 AND entity_type='PROFILE_CLAIM'",[u.id])).rows).toHaveLength(0);
  // A confirmed old tombstone permits the user to start a distinct valid intent safely.
  const next=await intent();await request(app.getHttpServer()).post('/claims').set(auth(u)).send(next).expect(201);
 });
 it('recovers CREATED after lost response without closing, withdrawing or changing the original claim',async()=>{
  const u=await actor(),b=await intent(),created=await claims.submitClaim(u.id,b);
  const before=(await db.query('SELECT * FROM profile_claims WHERE id=$1',[created.id])).rows[0];
  await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,b.targetPersonId]);
  for(let i=0;i<2;i++){expect((await resolve(u,b).expect(201)).body).toEqual({outcome:'CREATED',claimId:created.id});}
  await resolve(u,{...b,relationshipDescription:'Changed body'}).expect(409);
  expect(await counts(u,b.creationKey)).toEqual({receipts:'1',closures:'0',claims:'1',audits:'0'});
  expect((await db.query('SELECT * FROM profile_claims WHERE id=$1',[created.id])).rows[0]).toEqual(before);
  await expect(db.query('INSERT INTO claim_creation_closures(account_id,creation_key,payload_hash) VALUES($1,$2,$3)',[u.id,b.creationKey,'0'.repeat(64)])).rejects.toThrow('CLAIM_CREATION_ALREADY_CREATED');
 });
 it('binds closure and receipt lookups to the authenticated account even for an identical key/body',async()=>{
  const a=await actor(),b=await actor(),body=await intent();const created=await claims.submitClaim(a.id,body);
  expect((await resolve(b,body).expect(201)).body).toEqual({outcome:'ABANDONED'});
  expect((await resolve(a,body).expect(201)).body).toEqual({outcome:'CREATED',claimId:created.id});
  expect(await counts(a,body.creationKey)).toEqual({receipts:'1',closures:'0',claims:'1',audits:'0'});
  expect(await counts(b,body.creationKey)).toEqual({receipts:'0',closures:'1',claims:'0',audits:'1'});
 });
 it('serializes competing create and closure into one terminal outcome without duplicate claim/evidence/transition',async()=>{
  const u=await actor(),b=await intent();
  const results=await Promise.allSettled([claims.submitClaim(u.id,b),claims.resolveClaimCreation(u.id,b)]);
  const resolved=results[1];expect(resolved.status).toBe('fulfilled');if(resolved.status!=='fulfilled')throw new Error('resolution failed');
  const c=await counts(u,b.creationKey);
  if(resolved.value.outcome==='CREATED'){
   expect(results[0].status).toBe('fulfilled');expect(c).toEqual({receipts:'1',closures:'0',claims:'1',audits:'0'});
   expect((await db.query('SELECT 1 FROM workflow_state_transitions WHERE entity_id=$1',[resolved.value.claimId])).rows).toHaveLength(1);
  }else{
   expect(results[0].status).toBe('rejected');expect(c).toEqual({receipts:'0',closures:'1',claims:'0',audits:'1'});
  }
 });
 it('rolls back closure and audit atomically so the original key may still create after an audit outage',async()=>{
  const u=await actor(),b=await intent();const fail=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Fictional closure audit failure'));
  try{await expect(claims.resolveClaimCreation(u.id,b)).rejects.toThrow('Fictional closure audit failure');}finally{fail.mockRestore();}
  expect(await counts(u,b.creationKey)).toEqual({receipts:'0',closures:'0',claims:'0',audits:'0'});
  const created=await claims.submitClaim(u.id,b);expect(await claims.resolveClaimCreation(u.id,b)).toEqual({outcome:'CREATED',claimId:created.id});
 });
 it('recovers a lost closure commit acknowledgement without re-inserting history or audit',async()=>{
  const u=await actor(),b=await intent(),real=db.transaction.bind(db);
  const lost=jest.spyOn(db,'transaction').mockImplementationOnce(async(work:any)=>{await real(work);throw new Error('Fictional lost commit acknowledgement');});
  try{await expect(claims.resolveClaimCreation(u.id,b)).rejects.toThrow('lost commit acknowledgement');}finally{lost.mockRestore();}
  expect(await claims.resolveClaimCreation(u.id,b)).toEqual({outcome:'ABANDONED'});
  expect(await counts(u,b.creationKey)).toEqual({receipts:'0',closures:'1',claims:'0',audits:'1'});
 });
 it('retains immutable closure evidence, refuses contradictory receipts and blocks evidence-erasing downgrade',async()=>{
  const u=await actor(),b=await intent();await claims.resolveClaimCreation(u.id,b);
  await expect(db.query('DELETE FROM claim_creation_closures WHERE account_id=$1',[u.id])).rejects.toThrow('CLAIM_CREATION_CLOSURE_IMMUTABLE');
  await expect(db.query('UPDATE claim_creation_closures SET payload_hash=$2 WHERE account_id=$1',[u.id,'0'.repeat(64)])).rejects.toThrow('CLAIM_CREATION_CLOSURE_IMMUTABLE');
  await expect(db.query('INSERT INTO claim_creation_receipts(account_id,creation_key,payload_hash,claim_id) VALUES($1,$2,$3,$4)',[u.id,b.creationKey,'0'.repeat(64),randomUUID()])).rejects.toThrow('CLAIM_CREATION_PERMANENTLY_CLOSED');
  const sql=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/065_claim_creation_closures.down.sql'),'utf8');
  await expect(db.transaction(tx=>tx.query(sql))).rejects.toThrow('CLAIM_CREATION_CLOSURES_RETAINED');
 });
});
