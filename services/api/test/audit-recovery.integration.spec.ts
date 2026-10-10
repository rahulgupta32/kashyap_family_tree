import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { Role } from '@kashyap/contracts';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { AuditRecoveryService } from '../src/modules/audit/audit-recovery.service';
import { getJwtSecret,JWT_ISSUER,JWT_AUDIENCE,JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase,assertDatabaseIsolation,DisposableDatabase } from './helpers/disposable-db';

describe('Two-person audit recovery with PostgreSQL and HTTP guards',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,outbox:AuditOutboxRepository,audit:AuditRepository,service:AuditRecoveryService;
 let proposer:any,approver:any,third:any;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('audit_recovery');
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);await assertDatabaseIsolation(db,iso.dbName);outbox=module.get(AuditOutboxRepository);audit=module.get(AuditRepository);service=module.get(AuditRecoveryService);
  async function actor(phone:string){
   const id=(await db.query('INSERT INTO user_accounts(phone_number,is_phone_verified) VALUES($1,true) RETURNING id',[phone])).rows[0].id;
   await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'SUPER_ADMIN')",[id]);
   const sessionId=(await db.query("INSERT INTO user_sessions(user_id,refresh_token_hash,device_platform,expires_at,mfa_verified_at,mfa_generation) VALUES($1,$2,'WEB',CURRENT_TIMESTAMP+INTERVAL '1 hour',CURRENT_TIMESTAMP,1) RETURNING id",[id,randomUUID()])).rows[0].id;
   await db.query('INSERT INTO account_authenticators(user_id,generation,enabled_at) VALUES($1,1,CURRENT_TIMESTAMP)',[id]);
   const token=module.get(JwtService).sign({sub:id,sid:sessionId,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id,sessionId,roles:[Role.SUPER_ADMIN],token};
  }
  proposer=await actor('+9779847300011');approver=await actor('+9779847300012');third=await actor('+9779847300013');
 },60000);
 afterEach(()=>jest.restoreAllMocks());
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 async function seed(){const event=await outbox.recordAuditIntent({action:'UPDATE',entityType:'fictional',entityId:randomUUID(),newValue:{fixture:'Private fictional payload'}});await db.query("UPDATE audit_outbox SET status='FAILED',retry_count=10,last_error='AUDIT_DELIVERY_FAILED' WHERE id=$1",[event.id]);return event;}
 async function proposal(event:any){const id=randomUUID();await service.propose(proposer,event.id,{requestId:id,reasonCode:'DEPENDENCY_RECOVERED'});return id;}
 const bearer=(actor:any)=>({Authorization:`Bearer ${actor.token}`});
 it('guards anonymous/current-role/MFA access and excludes retained payloads from the review',async()=>{
  await request(app.getHttpServer()).get('/audit/delivery/recovery').expect(401);
  const event=await seed();const response=await request(app.getHttpServer()).get('/audit/delivery/recovery').set(bearer(proposer)).expect(200);
  expect(response.headers['cache-control']).toBe('no-store');expect(JSON.stringify(response.body)).not.toContain('Private fictional');expect(JSON.stringify(response.body)).not.toContain('AUDIT_DELIVERY_FAILED');
  await db.query("UPDATE user_roles SET role='CENTRAL_ADMIN' WHERE user_id=$1",[third.id]);
  await request(app.getHttpServer()).post(`/audit/delivery/${event.id}/recovery`).set(bearer(third)).send({requestId:randomUUID(),reasonCode:'DEPENDENCY_RECOVERED'}).expect(403);
  await db.query("UPDATE user_roles SET role='SUPER_ADMIN' WHERE user_id=$1",[third.id]);
  await db.query('UPDATE user_sessions SET mfa_generation=0 WHERE id=$1',[third.sessionId]);
  await request(app.getHttpServer()).get('/audit/delivery/recovery').set(bearer(third)).expect(403);
  await db.query('UPDATE user_sessions SET mfa_generation=1 WHERE id=$1',[third.sessionId]);
 });
 it('requires distinct approval and delivers once across concurrent duplicate approvals without resetting failures',async()=>{
  const event=await seed(),id=await proposal(event);
  await expect(service.approve(proposer,id)).rejects.toThrow('different Super Admin');
  const results=await Promise.all([service.approve(approver,id),service.approve(approver,id)]);
  expect(results.map(r=>r.alreadyDecided).sort()).toEqual([false,true]);
  expect((await db.query('SELECT status,retry_count FROM audit_outbox WHERE id=$1',[event.id])).rows[0]).toEqual({status:'PROCESSED',retry_count:10});
  expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[event.id])).rows).toHaveLength(1);
  expect((await db.query('SELECT * FROM audit_delivery_recovery_decisions WHERE request_id=$1',[id])).rows).toHaveLength(1);
  await expect(service.approve(third,id)).rejects.toThrow('Another approver');
 });
 it('retains failed manual delivery and never reopens automatic retries',async()=>{
  const event=await seed(),id=await proposal(event);
  jest.spyOn(audit,'appendAuditLog').mockImplementationOnce(async(...args:any[])=>{await args[9].query("SELECT 'private failure'::integer");return {} as any;});
  expect((await service.approve(approver,id)).outcome).toBe('FAILED');
  const row=(await db.query('SELECT status,retry_count,last_error FROM audit_outbox WHERE id=$1',[event.id])).rows[0];
  expect(row).toEqual({status:'FAILED',retry_count:10,last_error:'AUDIT_RECOVERY_DELIVERY_FAILED'});
  expect(await outbox.processScheduledEntry(event.id,audit)).toBe('SKIPPED');
  const evidence=(await outbox.findByEntityId(id)).find(e=>e.action==='AUDIT_RECOVERY_DECIDED');expect(evidence!.new_value).toEqual({retainedEventId:event.id,outcome:'FAILED'});
 });
 it('rolls back delivered evidence and decision if durable outcome insertion fails',async()=>{
  const event=await seed(),id=await proposal(event);jest.spyOn(outbox,'recordAuditIntent').mockRejectedValueOnce(new Error('Private evidence outage'));
  await expect(service.approve(approver,id)).rejects.toThrow('unconfirmed');
  expect((await db.query('SELECT status FROM audit_outbox WHERE id=$1',[event.id])).rows[0].status).toBe('FAILED');
  expect((await db.query('SELECT * FROM audit_delivery_recovery_decisions WHERE request_id=$1',[id])).rows).toHaveLength(0);
  expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[event.id])).rows).toHaveLength(0);
 });
 it('recovers a lost commit acknowledgement by returning the retained decision without redelivery',async()=>{
  const event=await seed(),id=await proposal(event),real=db.transaction.bind(db);
  jest.spyOn(db,'transaction').mockImplementationOnce(async(work:any)=>{await real(work);throw new Error('lost commit acknowledgement');});
  await expect(service.approve(approver,id)).rejects.toThrow('unconfirmed');
  expect(await service.approve(approver,id)).toEqual({id,outcome:'PROCESSED',alreadyDecided:true});
  expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[event.id])).rows).toHaveLength(1);
 });
 it('serializes duplicate proposals, rejects competing or changed IDs and refuses evidence-erasing rollback',async()=>{
  const event=await seed(),id=randomUUID(),input={requestId:id,reasonCode:'DEPENDENCY_RECOVERED'};
  expect((await Promise.all([service.propose(proposer,event.id,input),service.propose(proposer,event.id,input)])).map(r=>r.alreadyProposed).sort()).toEqual([false,true]);
  await expect(service.propose(approver,event.id,input)).rejects.toThrow('different proposal');
  await expect(service.propose(proposer,event.id,{...input,requestId:randomUUID()})).rejects.toThrow('already exists');
  for(const sql of ['UPDATE audit_delivery_recovery_requests SET reason_code=reason_code','DELETE FROM audit_delivery_recovery_requests','TRUNCATE audit_delivery_recovery_requests CASCADE'])await expect(db.query(sql)).rejects.toThrow('immutable');
  const down=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/051_audit_delivery_recovery.down.sql'),'utf8');await expect(db.query(down)).rejects.toThrow('evidence exists');
 });
 it('rejects expired proposals and revoked proposer or approver authority using current database state',async()=>{
  const event=await seed();const expired=randomUUID();await db.query("INSERT INTO audit_delivery_recovery_requests(id,outbox_id,proposed_by,reason_code,expires_at) VALUES($1,$2,$3,'DEPENDENCY_RECOVERED',CURRENT_TIMESTAMP-INTERVAL '1 second')",[expired,event.id,proposer.id]);
  await expect(service.approve(approver,expired)).rejects.toThrow('expired');const id=await proposal(event);
  await db.query("UPDATE user_roles SET role='CENTRAL_ADMIN' WHERE user_id=$1",[proposer.id]);await expect(service.approve(approver,id)).rejects.toThrow('no longer has authority');await db.query("UPDATE user_roles SET role='SUPER_ADMIN' WHERE user_id=$1",[proposer.id]);
  await db.query('UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1',[third.sessionId]);await expect(service.approve(third,id)).rejects.toThrow('fresh authentication');
 });
 it('accepts only exhausted events and fixed reasons before allocating recovery evidence',async()=>{
  const event=await outbox.recordAuditIntent({action:'UPDATE',entityType:'fictional',entityId:randomUUID()});
  await expect(service.propose(proposer,event.id,{requestId:randomUUID(),reasonCode:'DEPENDENCY_RECOVERED'})).rejects.toThrow('Only exhausted');
  await expect(service.propose(proposer,event.id,{requestId:randomUUID(),reasonCode:'Private personal note'})).rejects.toThrow('Invalid recovery reason');
  await expect(service.propose(proposer,event.id,{requestId:randomUUID(),reasonCode:'DEPENDENCY_RECOVERED',actorId:approver.id})).rejects.toThrow('Invalid recovery proposal');
 });
 it('exercises authenticated HTTP proposal and approval with no-store responses',async()=>{
  const event=await seed(),id=randomUUID();
  await request(app.getHttpServer()).post(`/audit/delivery/${event.id}/recovery`).set(bearer(proposer)).send({requestId:id,reasonCode:'DEPENDENCY_RECOVERED'}).expect(201);
  await request(app.getHttpServer()).post(`/audit/delivery/recovery/${id}/approve`).set(bearer(proposer)).send({}).expect(403);
  const response=await request(app.getHttpServer()).post(`/audit/delivery/recovery/${id}/approve`).set(bearer(approver)).send({}).expect(201);
  expect(response.headers['cache-control']).toBe('no-store');expect(response.body.outcome).toBe('PROCESSED');
  expect(response.body.alreadyDecided).toBe(false);
 });
});
