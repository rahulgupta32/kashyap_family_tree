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
import {ApplicationSettingsService} from '../src/modules/application-settings/application-settings.service';
import {Role} from '@kashyap/contracts';
import {getJwtSecret,JWT_ALGORITHM,JWT_AUDIENCE,JWT_ISSUER} from '../src/modules/auth/auth.constants';
import {createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation} from './helpers/disposable-db';

describe('Typed bounded settings with durable authority and calendar enforcement (PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,users:UserRepository,audit:AuditOutboxRepository,admin:any,member:any,branch:string;
 const key='calendar.max_invitees',reason='Fictional settings test change';
 const auth=(u=admin)=>({Authorization:`Bearer ${u.token}`});
 const read=async()=>(await request(app.getHttpServer()).get('/admin/settings').set(auth()).expect(200)).body;
 const change=async(k:string,value:number)=>{const current=(await read()).find((s:any)=>s.key===k);return (await request(app.getHttpServer()).patch(`/admin/settings/${k}`).set(auth()).send({value,version:current.version,reason}).expect(200)).body;};
 beforeAll(async()=>{
  iso=await createDisposableDatabase('typed_settings');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);users=module.get(UserRepository);audit=module.get(AuditOutboxRepository);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('SET1','परीक्षण','Fictional settings') RETURNING id")).rows[0].id;
  async function fixture(phone:string,role:Role){const u=await users.findOrCreateByPhone(phone);await users.setPhoneVerified(u.id,true);await users.assignRole(u.id,role,role===Role.SUPER_ADMIN?undefined:branch);
   const person=(await db.query('INSERT INTO persons(branch_id,generation,birth_year_bs,is_claimed,claimed_user_id) VALUES($1,1,2040,true,$2) RETURNING id',[branch,u.id])).rows[0];await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person.id]);
   await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,'en','Fictional','Settings','Fictional Settings')",[person.id]);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'settings-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});return {id:u.id,token,personId:person.id};}
  admin=await fixture('+9779847555501',Role.SUPER_ADMIN);member=await fixture('+9779847555502',Role.VERIFIED_MEMBER);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires current verified Super Admin authority and returns a safe non-cacheable catalogue',async()=>{
  await request(app.getHttpServer()).get('/admin/settings').expect(401);
  await request(app.getHttpServer()).get('/admin/settings').set(auth(member)).expect(403);
  for(const role of [Role.CENTRAL_ADMIN,Role.BRANCH_ADMIN]){await users.assignRole(member.id,role,branch);await request(app.getHttpServer()).get('/admin/settings').set(auth(member)).expect(403);}
  const response=await request(app.getHttpServer()).get('/admin/settings').set(auth()).expect(200);expect(response.headers['cache-control']).toBe('private, no-store');expect(response.body).toHaveLength(4);expect(JSON.stringify(response.body)).not.toContain('+977');
  await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='SUPER_ADMIN'",[admin.id]);try{await request(app.getHttpServer()).get('/admin/settings').set(auth()).expect(403);}finally{await users.assignRole(admin.id,Role.SUPER_ADMIN);}
  await users.setPhoneVerified(admin.id,false);try{await request(app.getHttpServer()).get('/admin/settings').set(auth()).expect(403);}finally{await users.setPhoneVerified(admin.id,true);}
 });
 it('rejects arbitrary keys, coercion, unsafe values and unversioned/no-op changes',async()=>{
  for(const value of ['5',true,0,101,1.5,[],null])await request(app.getHttpServer()).patch(`/admin/settings/${key}`).set(auth()).send({value,version:1,reason}).expect(400);
  for(const body of [{value:5,reason},{value:5,version:1,reason:'short'},{value:5,version:1,reason,actorId:member.id},{value:100,version:1,reason}])await request(app.getHttpServer()).patch(`/admin/settings/${key}`).set(auth()).send(body).expect(400);
  await request(app.getHttpServer()).patch('/admin/settings/DATABASE_URL').set(auth()).send({value:1,version:1,reason}).expect(404);
  await request(app.getHttpServer()).get('/admin/settings?extra=true').set(auth()).expect(400);
  for(const before of ['0','-1','1.5','2147483648'])await request(app.getHttpServer()).get(`/admin/settings/${key}/history?before=${before}`).set(auth()).expect(400);
 });
 it('serializes competing edits and preserves immutable before/after evidence across service reconstruction',async()=>{
  const current=(await read()).find((s:any)=>s.key===key);const responses=await Promise.all([80,90].map(value=>request(app.getHttpServer()).patch(`/admin/settings/${key}`).set(auth()).send({value,version:current.version,reason})));
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);const saved=responses.find(r=>r.status===200)!.body;
  const h=(await request(app.getHttpServer()).get(`/admin/settings/${key}/history`).set(auth()).expect(200)).body;expect(h.items).toHaveLength(2);expect(h.items[0]).toMatchObject({oldValue:100,newValue:saved.value,actorId:admin.id,reason,version:2});expect(h.items[1].actorId).toBeNull();
  expect((await new ApplicationSettingsService(db,audit).calendarPolicy()).maxInvitees).toBe(saved.value);
  await expect(db.query('UPDATE application_setting_revisions SET reason=$2 WHERE setting_key=$1',[key,'Fictional rewritten reason'])).rejects.toThrow('append-only');await expect(db.query('DELETE FROM application_settings WHERE setting_key=$1',[key])).rejects.toThrow('cannot be deleted');
  await change(key,100);
 });
 it('rolls back both value and revision when audit fails and fails closed on history reads',async()=>{
  const current=(await read()).find((s:any)=>s.key===key),count=(await db.query('SELECT count(*) FROM application_setting_revisions WHERE setting_key=$1',[key])).rows[0].count;
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValue(new Error('Fictional audit outage'));
  try{await request(app.getHttpServer()).patch(`/admin/settings/${key}`).set(auth()).send({value:2,version:current.version,reason}).expect(500);await request(app.getHttpServer()).get(`/admin/settings/${key}/history`).set(auth()).expect(500);}finally{spy.mockRestore();}
  expect((await read()).find((s:any)=>s.key===key).version).toBe(current.version);expect((await db.query('SELECT count(*) FROM application_setting_revisions WHERE setting_key=$1',[key])).rows[0].count).toBe(count);
 });
 it('enforces real recipient/person caps, database-clock expiry and preview policy versions without altering existing rosters',async()=>{
  const criteria={type:'BRANCH',branchId:branch},body={audienceSelection:criteria,audienceScope:'INVITED_ONLY'};
  const preview=async()=>(await request(app.getHttpServer()).post('/calendar/events/preview').set(auth()).send(body).expect(201)).body;
  const old=await preview();const event={...body,title:'Fictional settings event',eventType:'GENERAL_EVENT',startsAt:new Date(Date.now()+86400000*4).toISOString(),audiencePreviewId:old.previewId};
  const created=(await request(app.getHttpServer()).post('/calendar/events').set(auth()).send(event).expect(201)).body;expect(created.invitedUserIds).toHaveLength(2);
  const stale=await preview();await change('calendar.preview_ttl_minutes',1);
  await request(app.getHttpServer()).post('/calendar/events').set(auth()).send({...event,audiencePreviewId:stale.previewId}).expect(409);
  const fresh=await preview(),timing=(await db.query('SELECT EXTRACT(EPOCH FROM (expires_at-created_at)) AS seconds FROM calendar_audience_previews WHERE id=$1',[fresh.previewId])).rows[0];expect(Number(timing.seconds)).toBeGreaterThan(59);expect(Number(timing.seconds)).toBeLessThan(62);
  await change(key,1);
  await request(app.getHttpServer()).post('/calendar/events/preview').set(auth()).send(body).expect(400);
  await request(app.getHttpServer()).post('/calendar/events/preview').set(auth()).send({invitedUserIds:[admin.id,member.id],audienceScope:'INVITED_ONLY'}).expect(400);
  const edited=(await request(app.getHttpServer()).patch(`/calendar/events/${created.id}`).set(auth()).send({version:1,title:'Fictional edited title'}).expect(200)).body;expect(edited.invitedUserIds.sort()).toEqual(created.invitedUserIds.sort());
  await change(key,100);await change('calendar.max_audience_persons',1);await request(app.getHttpServer()).post('/calendar/events/preview').set(auth()).send(body).expect(400);await change('calendar.max_audience_persons',1000);
  for(const [parent,child] of [[admin.personId,member.personId],[member.personId,admin.personId]])await db.query("INSERT INTO parent_links(parent_id,child_id,confidence) VALUES($1,$2,'VERIFIED')",[parent,child]);
  await change('calendar.max_audience_edges',1);await request(app.getHttpServer()).post('/calendar/events/preview').set(auth()).send({audienceSelection:{type:'DESCENDANTS',ancestorPersonId:admin.personId},audienceScope:'INVITED_ONLY'}).expect(400);await change('calendar.max_audience_edges',10000);
  await change('calendar.preview_ttl_minutes',10);
 });
 it('paginates revision history without gaps and refuses rollback after real edits',async()=>{
  for(let i=0;i<52;i++)await db.query('UPDATE application_settings SET value=$2,version=version+1,updated_by=$3,reason=$4,updated_at=clock_timestamp() WHERE setting_key=$1',['calendar.max_audience_edges',JSON.stringify(i%2?10000:9999),admin.id,reason]);
  const first=(await request(app.getHttpServer()).get('/admin/settings/calendar.max_audience_edges/history').set(auth()).expect(200)).body;expect(first.items).toHaveLength(50);expect(first.nextBefore).toBe(first.items[49].version);
  const second=(await request(app.getHttpServer()).get(`/admin/settings/calendar.max_audience_edges/history?before=${first.nextBefore}`).set(auth()).expect(200)).body;expect(second.items).toHaveLength(5);expect(second.nextBefore).toBeNull();expect(new Set([...first.items,...second.items].map(r=>r.version)).size).toBe(55);
  const fs=require('fs'),path=require('path');await expect(db.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/044_typed_application_settings.down.sql'),'utf8'))).rejects.toThrow();expect(await read()).toHaveLength(4);
 });
});
