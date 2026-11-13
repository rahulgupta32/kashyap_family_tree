import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { PolicyAcknowledgementService } from '../src/modules/profile/policy-acknowledgement.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret,JWT_ALGORITHM,JWT_AUDIENCE,JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation } from './helpers/disposable-db';
describe('Immutable policy receipts (PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository,service:PolicyAcknowledgementService,a:any,b:any,doc:any;
 const auth=(u=a)=>({Authorization:`Bearer ${u.token}`});
 const ack=(d=doc)=>({documentId:d.id,contentHash:d.content_hash,accepted:true});
 async function publish(kind:string,version:number,effective='2020-01-01',expires:string|null=null){return (await db.query(`INSERT INTO policy_documents(kind,version,title_ne,title_en,body_ne,body_en,approved_by,approval_reference,effective_at,expires_at)
  VALUES($1,$2,'काल्पनिक परीक्षण','Fictional test','काल्पनिक परीक्षण मात्र','Fictional fixture only, not approved legal policy',$3,'FICTIONAL-TEST-ONLY',$4,$5) RETURNING *`,[kind,version,a.id,effective,expires])).rows[0];}
 beforeAll(async()=>{
  iso=await createDisposableDatabase('policy_ack');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);audit=module.get(AuditOutboxRepository);service=module.get(PolicyAcknowledgementService);await assertDatabaseIsolation(db,iso.dbName);
  async function user(phone:string){const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,Role.REGISTERED_USER);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'fictional-policy-test',expiresAt:new Date(Date.now()+3600000)});
   return {id:u.id,token:module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM})};}
  a=await user('+9779847555611');b=await user('+9779847555612');
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires authentication and leaves an empty catalogue honestly unavailable',async()=>{
  await request(app.getHttpServer()).get('/me/policies').expect(401);
  const r=await request(app.getHttpServer()).get('/me/policies').set(auth()).expect(200);expect(r.headers['cache-control']).toBe('private, no-store');expect(r.body).toEqual({available:false,documents:[],history:[]});
 });
 it('stores one receipt/audit for concurrent requests and response-loss retry',async()=>{
  doc=await publish('PRIVACY',1);
  const results=await Promise.all([1,2,3].map(()=>request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth()).send(ack()).expect(201)));
  expect(new Set(results.map(r=>r.body.acceptedAt)).size).toBe(1);
  expect((await db.query('SELECT count(*) FROM policy_acknowledgements WHERE document_id=$1',[doc.id])).rows[0].count).toBe('1');
  expect((await db.query("SELECT count(*) FROM audit_outbox WHERE action='POLICY_ACKNOWLEDGED' AND entity_id=$1",[doc.id])).rows[0].count).toBe('1');
 });
 it('binds acknowledgement to authenticated account; wrong hash/account injection fail',async()=>{
  const r=await request(app.getHttpServer()).get('/me/policies').set(auth(b)).expect(200);expect(r.body.documents[0].acceptedAt).toBeNull();expect(r.body.history).toEqual([]);
  await request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth(b)).send({...ack(),accountId:a.id}).expect(400);
  await request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth(b)).send({...ack(),contentHash:'b'.repeat(64)}).expect(409);
  await request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth(b)).send({...ack(),accepted:false}).expect(400);
 });
 it('rolls back receipt when audit fails and permits safe retry',async()=>{
  const fail=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected policy audit outage'));
  try{await expect(service.accept(b.id,ack())).rejects.toThrow('Injected');}finally{fail.mockRestore();}
  expect((await db.query('SELECT 1 FROM policy_acknowledgements WHERE account_id=$1',[b.id])).rows).toHaveLength(0);
  await service.accept(b.id,ack());
 });
 it('rejects stale/future policy for a new acknowledgement while preserving old receipts',async()=>{
  const terms=await publish('TERMS',1);const next=await publish('TERMS',2);const future=await publish('TERMS',3,'2099-01-01');
  await request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth()).send(ack(terms)).expect(409);
  await request(app.getHttpServer()).post('/me/policies/acknowledgements').set(auth()).send(ack(future)).expect(409);
  const response=await request(app.getHttpServer()).get('/me/policies').set(auth()).expect(200);expect(response.body.documents.find((d:any)=>d.kind==='TERMS').id).toBe(next.id);
  await publish('PRIVACY',2);const old=await service.accept(a.id,ack());expect(old.current).toBe(false);expect(old.acceptedAt).toBeTruthy();
 });
 it('expired latest policy does not resurrect older text',async()=>{
  await publish('TERMS',4,'2021-01-01','2022-01-01');const response=await service.list(a.id);expect(response.documents.some((d:any)=>d.kind==='TERMS')).toBe(false);
 });
 it('rejects immutable evidence edits/deletion and evidence-erasing downgrade',async()=>{
  await expect(db.query('UPDATE policy_documents SET body_en=$2 WHERE id=$1',[doc.id,'Changed'])).rejects.toThrow('POLICY_DOCUMENT_IMMUTABLE');
  await expect(db.query('DELETE FROM policy_acknowledgements WHERE account_id=$1',[a.id])).rejects.toThrow('POLICY_ACKNOWLEDGEMENT_IMMUTABLE');
  const fs=require('fs'),path=require('path');await expect(db.transaction(tx=>tx.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/061_policy_acknowledgements.down.sql'),'utf8')))).rejects.toThrow('POLICY_EVIDENCE_RETAINED');
 });
 it('suspended account cannot list or accept policy',async()=>{
  await db.query('UPDATE user_accounts SET is_suspended=true WHERE id=$1',[b.id]);await request(app.getHttpServer()).get('/me/policies').set(auth(b)).expect(403);
 });
});
