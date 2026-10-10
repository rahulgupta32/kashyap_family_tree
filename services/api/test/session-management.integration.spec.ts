import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { SessionManagementService } from '../src/modules/auth/session-management.service';
import { SessionManagementController } from '../src/modules/auth/session-management.controller';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard';
import { createDisposableDatabase,DisposableDatabase } from './helpers/disposable-db';

describe('Account-scoped device management and atomic revocation (PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,db:DatabaseService,sessions:SessionRepository,outbox:AuditOutboxRepository,service:SessionManagementService,app:INestApplication;
 let actor:string,other:string,current:string,target:string,foreign:string;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('session_management');db=new DatabaseService();await db.onModuleInit();sessions=new SessionRepository(db);outbox=new AuditOutboxRepository(db);service=new SessionManagementService(db,outbox,new AuditRepository(db));
  const module=await Test.createTestingModule({controllers:[SessionManagementController],providers:[{provide:SessionManagementService,useValue:service}]}).overrideGuard(JwtAuthGuard).useValue({canActivate:(context:any)=>{context.switchToHttp().getRequest().user={id:actor,sessionId:current};return true;}}).compile();app=module.createNestApplication();await app.init();
 });
 const seed=async(userId:string,expiresAt=new Date(Date.now()+3600000))=>(await sessions.createSession({userId,refreshTokenHash:randomUUID(),devicePlatform:'android',deviceName:'Fictional private device',deviceId:'PRIVATE_DEVICE_ID',ipAddress:'127.0.0.1',userAgent:'PRIVATE_USER_AGENT',expiresAt})).id;
 beforeEach(async()=>{const users=new UserRepository(db);actor=(await users.findOrCreateByPhone(`+977984${Math.floor(1000000+Math.random()*9000000)}`)).id;other=(await users.findOrCreateByPhone(`+977985${Math.floor(1000000+Math.random()*9000000)}`)).id;current=await seed(actor);target=await seed(actor);foreign=await seed(other);});
 afterEach(()=>jest.restoreAllMocks());afterAll(async()=>{await app?.close();await db?.onModuleDestroy();await iso?.drop();});
 const intents=async()=>(await db.query("SELECT * FROM audit_outbox WHERE actor_id=$1 AND new_value->>'scope'='OTHER_DEVICE'",[actor])).rows;
 const revoke=()=>service.revoke(actor,current,target,'127.0.0.1','Fictional test client');
 it('lists only owned unexpired/unrevoked sessions with no token hashes, device IDs, IPs or user agents',async()=>{
  await seed(actor,new Date(Date.now()-1000));const revoked=await seed(actor);await sessions.revokeSession(revoked);
  const response=await request(app.getHttpServer()).get('/auth/sessions').expect(200);expect(response.headers['cache-control']).toBe('no-store');expect(response.body.items.map((s:any)=>s.id).sort()).toEqual([current,target].sort());expect(response.body.items.find((s:any)=>s.id===current).isCurrent).toBe(true);
  const serialized=JSON.stringify(response.body);for(const key of ['refresh_token_hash','PRIVATE_DEVICE_ID','PRIVATE_USER_AGENT','127.0.0.1'])expect(serialized).not.toContain(key);
 });
 it('pages deterministically and rejects foreign cursors, malformed IDs and current-device revocation',async()=>{
  await db.query("INSERT INTO user_sessions(user_id,refresh_token_hash,device_platform,expires_at) SELECT $1::uuid,md5(i::text||($1::uuid)::text),'ios',CURRENT_TIMESTAMP+INTERVAL '1 hour' FROM generate_series(1,51) i",[actor]);
  const first=await service.list(actor,current);expect(first.items).toHaveLength(50);expect(first.nextCursor).toBeTruthy();const next=await service.list(actor,current,first.nextCursor!);expect(next.items).toHaveLength(3);expect(next.nextCursor).toBeNull();expect(new Set([...first.items,...next.items].map(s=>s.id)).size).toBe(53);
  await request(app.getHttpServer()).get(`/auth/sessions?cursor=${foreign}`).expect(404);await request(app.getHttpServer()).post('/auth/sessions/not-a-uuid/revoke').expect(400);await request(app.getHttpServer()).post(`/auth/sessions/${current}/revoke`).expect(400);
 });
 it('denies foreign and unknown targets without revocation/evidence and rechecks revoked callers',async()=>{
  await expect(service.revoke(actor,current,foreign,'127.0.0.1','test')).rejects.toMatchObject({status:404});await expect(service.revoke(actor,current,randomUUID(),'127.0.0.1','test')).rejects.toMatchObject({status:404});expect((await sessions.findById(foreign))!.revoked_at).toBeNull();expect(await intents()).toHaveLength(0);
  await sessions.revokeSession(current);await expect(revoke()).rejects.toMatchObject({status:401});expect((await sessions.findById(target))!.revoked_at).toBeNull();
 });
 it('rechecks expired, suspended and aged privileged callers inside the transaction',async()=>{
  await db.query("UPDATE user_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=$1",[current]);await expect(revoke()).rejects.toMatchObject({status:401});
  await db.query("UPDATE user_sessions SET expires_at=CURRENT_TIMESTAMP+INTERVAL '1 hour' WHERE id=$1",[current]);await db.query('UPDATE user_accounts SET is_suspended=true WHERE id=$1',[actor]);await expect(revoke()).rejects.toMatchObject({status:401});
  await db.query('UPDATE user_accounts SET is_suspended=false WHERE id=$1',[actor]);await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'SUPER_ADMIN')",[actor]);await db.query("UPDATE user_sessions SET authenticated_at=CURRENT_TIMESTAMP-INTERVAL '2 hours' WHERE id=$1",[current]);await expect(revoke()).rejects.toMatchObject({status:401});expect((await sessions.findById(target))!.revoked_at).toBeNull();expect(await intents()).toHaveLength(0);
 });
 it('atomically revokes one device with redacted evidence and idempotent concurrent retries',async()=>{
  await Promise.all([revoke(),revoke()]);expect((await sessions.findById(target))!.revoked_at).not.toBeNull();expect((await sessions.findById(current))!.revoked_at).toBeNull();const events=await intents();expect(events).toHaveLength(1);expect(events[0].new_value).toEqual({scope:'OTHER_DEVICE',outcome:'SESSION_REVOKED'});expect(events[0].entity_id).toBe(target);
 });
 it('revokes a refreshed successor selected through its preceding session and prevents future rotation',async()=>{
  const old=(await sessions.findById(target))!;
  const rotated=await sessions.rotateSessionTransactional(old.refresh_token_hash,{newRefreshTokenHash:randomUUID(),expiresAt:new Date(Date.now()+3600000),devicePlatform:'android'});
  expect(rotated.newSession!.session_family_id).toBe(old.session_family_id);
  await revoke();expect((await sessions.findById(rotated.newSession!.id))!.revoked_at).not.toBeNull();expect((await sessions.findById(current))!.revoked_at).toBeNull();expect(await intents()).toHaveLength(1);
  const late=await sessions.rotateSessionTransactional(old.refresh_token_hash,{newRefreshTokenHash:randomUUID(),expiresAt:new Date(Date.now()+3600000),devicePlatform:'android'});expect(late.status).toBe('EXPIRED');expect((await sessions.findById(current))!.revoked_at).toBeNull();
 });
 it('serializes a simultaneous family refresh and revocation without leaving an active successor',async()=>{
  const old=(await sessions.findById(target))!;
  await Promise.all([sessions.rotateSessionTransactional(old.refresh_token_hash,{newRefreshTokenHash:randomUUID(),expiresAt:new Date(Date.now()+3600000),devicePlatform:'android'}),revoke()]);
  expect((await db.query('SELECT count(*)::int AS count FROM user_sessions WHERE user_id=$1 AND session_family_id=$2 AND revoked_at IS NULL',[actor,old.session_family_id])).rows[0].count).toBe(0);
 });
 it('rolls back revocation on audit write failure and returns a fixed unavailable result',async()=>{
  jest.spyOn(outbox,'recordAuditIntent').mockRejectedValue(new Error('PRIVATE_DATABASE_DIAGNOSTIC'));await expect(revoke()).rejects.toMatchObject({status:503});expect((await sessions.findById(target))!.revoked_at).toBeNull();expect(await intents()).toHaveLength(0);
 });
 it('preserves committed evidence after lost acknowledgement and safely retries without duplicating intent',async()=>{
  const transaction=db.transaction.bind(db);jest.spyOn(db,'transaction').mockImplementationOnce(async(callback:any)=>{await transaction(callback);throw new Error('Lost acknowledgement');});await expect(revoke()).rejects.toMatchObject({status:503});expect((await sessions.findById(target))!.revoked_at).not.toBeNull();expect(await revoke()).toEqual({success:true});expect(await intents()).toHaveLength(1);
 });
 it('retains scheduled retry evidence after immediate delivery failure',async()=>{
  jest.spyOn(outbox,'processOutboxEntry').mockRejectedValue(new Error('PRIVATE_DELIVERY_DIAGNOSTIC'));expect(await revoke()).toEqual({success:true});expect((await intents())[0]).toMatchObject({status:'FAILED',retry_count:1,last_error:'SESSION_REVOCATION_AUDIT_DELIVERY_FAILED'});
 });
});
