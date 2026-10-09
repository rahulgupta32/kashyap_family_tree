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
import { CalendarRecurrenceService } from '../src/modules/calendar/calendar-recurrence.service';
import { CalendarDeliveryService } from '../src/modules/calendar/calendar-delivery.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';
import { calendarNoticeEligibility } from '../src/modules/calendar/calendar-eligibility';
import * as fs from 'fs';
import * as path from 'path';

describe('Approved private Gregorian annual reminders (real PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,users:UserRepository,audit:AuditOutboxRepository,service:CalendarRecurrenceService,delivery:CalendarDeliveryService,owner:any,reviewer:any,outsider:any;
 const base='/calendar/recurrences',reason='Fictional independently checked date evidence';
 const auth=(u=owner)=>({Authorization:`Bearer ${u.token}`});
 async function event(u=owner,type='GENERAL_EVENT',date='2020-02-29T03:15:00Z'){
  return (await request(app.getHttpServer()).post('/calendar/events').set(auth(u)).send({title:'Fictional annual source',eventType:type,audienceScope:'PRIVATE',startsAt:date}).expect(201)).body;
 }
 const propose=(e:any,extra:any={})=>request(app.getHttpServer()).post(base).set(auth()).send({sourceEventId:e.id,sourceVersion:e.version,localTime:'09:00',leapDayPolicy:'FEBRUARY_28',sourceRef:reason,consent:true,...extra});
 const decide=(r:any,decision='APPROVED',u=reviewer)=>request(app.getHttpServer()).post(`${base}/${r.id}/decisions`).set(auth(u)).send({version:r.version,decision,reason});
 async function approved(){const e=await event();const r=(await propose(e).expect(201)).body;return {e,r:(await decide(r).expect(201)).body};}
 beforeAll(async()=>{
  iso=await createDisposableDatabase('calendar_recurrence');const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);users=module.get(UserRepository);audit=module.get(AuditOutboxRepository);service=module.get(CalendarRecurrenceService);delivery=module.get(CalendarDeliveryService);
  async function fixture(phone:string,role:Role){const u=await users.findOrCreateByPhone(phone);await users.setPhoneVerified(u.id,true);await users.assignRole(u.id,role);const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'recurrence-fixture',expiresAt:new Date(Date.now()+3600000)});return {id:u.id,token:module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM})};}
  owner=await fixture('+9779847555801',Role.SUPER_ADMIN);reviewer=await fixture('+9779847555802',Role.SUPER_ADMIN);outsider=await fixture('+9779847555803',Role.VERIFIED_MEMBER);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires authentication, current verified authority and private consent',async()=>{
  await request(app.getHttpServer()).get(base).expect(401);const e=await event();await propose(e,{consent:false}).expect(400);await propose(e,{leapDayPolicy:'INFER'}).expect(400);await propose(e,{unknown:true}).expect(400);
  await users.setPhoneVerified(owner.id,false);try{await propose(e).expect(403);}finally{await users.setPhoneVerified(owner.id,true);}
  await request(app.getHttpServer()).get(`${base}?queue=true`).set(auth(outsider)).expect(403);
 });
 it('rejects cultural, undated, foreign and stale event sources',async()=>{
  await propose(await event(owner,'SHRADDHA')).expect(400);await propose(await event(outsider)).expect(404);
  const e=await event();await propose(e,{sourceVersion:99}).expect(409);
  const undated=(await request(app.getHttpServer()).post('/calendar/events').set(auth()).send({title:'Fictional BS source',eventType:'GENERAL_EVENT',audienceScope:'PRIVATE',solarDate:'2083-01-01'}).expect(201)).body;await propose(undated).expect(400);
 });
 it('serializes duplicate proposal submissions and prevents self approval',async()=>{
  const e=await event();const rs=await Promise.all([propose(e),propose(e)]);expect(rs.map(r=>r.status).sort()).toEqual([201,409]);const r=rs.find(r=>r.status===201)!.body;
  await decide(r,'APPROVED',owner).expect(403);const p=await request(app.getHttpServer()).get(`${base}/${r.id}/preview?year=2027`).set(auth()).expect(200);expect(p.body).toMatchObject({startsAt:'2027-02-28T03:15:00.000Z',deliveryEnabled:false,timezone:'Asia/Kathmandu'});
  await decide(r).expect(201);await decide(r).expect(409);
 });
 it('rejects stale approval and requires fresh source evidence',async()=>{
  const e=await event(),r=(await propose(e).expect(201)).body;await db.query('UPDATE calendar_events SET version=version+1 WHERE id=$1',[e.id]);await decide(r).expect(409);await decide(r,'REJECTED').expect(201);
 });
 it('materializes approved future occurrences exactly once across concurrent workers',async()=>{
  const {r}=await approved();await Promise.all([service.materializeDue(),service.materializeDue()]);await db.query('UPDATE calendar_recurrence_rules SET next_check_at=NOW() WHERE id=$1',[r.id]);await service.materializeDue();
  const events=(await db.query('SELECT * FROM calendar_events WHERE recurrence_rule_id=$1',[r.id])).rows;expect(events.length).toBeGreaterThan(0);expect(new Set(events.map(e=>e.recurrence_year)).size).toBe(events.length);
  for(const e of events){expect(e.audience_scope).toBe('PRIVATE');expect(e.title).toBe('Private annual reminder');await request(app.getHttpServer()).get(`/calendar/events/${e.id}`).set(auth()).expect(200);await request(app.getHttpServer()).get(`/calendar/events/${e.id}`).set(auth(reviewer)).expect(403);await request(app.getHttpServer()).patch(`/calendar/events/${e.id}`).set(auth()).send({version:1,title:'Share source'}).expect(409);await propose({id:e.id,version:1}).expect(400);}
 });
 it('withdrawal hides occurrences from calendar and invalidates pending notices and retries',async()=>{
  const {r}=await approved();await service.materializeDue();const e=(await db.query('SELECT * FROM calendar_events WHERE recurrence_rule_id=$1 ORDER BY recurrence_year DESC',[r.id])).rows[0];expect(e).toBeTruthy();
  const eligible=async()=>Number((await db.query(`SELECT count(*) FROM calendar_notification_recipients nr JOIN audit_outbox o ON o.id=nr.outbox_id JOIN calendar_events e ON e.id=nr.event_id JOIN user_accounts u ON u.id=nr.user_id WHERE e.id=$1 AND ${calendarNoticeEligibility()}`,[e.id])).rows[0].count);
  expect(await eligible()).toBeGreaterThan(0);await decide(r,'WITHDRAWN',owner).expect(201);expect(await eligible()).toBe(0);
  await request(app.getHttpServer()).get(`/calendar/events/${e.id}`).set(auth()).expect(403);const listing=await request(app.getHttpServer()).get('/calendar/events').set(auth()).expect(200);expect(listing.body.map((x:any)=>x.id)).not.toContain(e.id);
  await db.query("UPDATE calendar_event_reminders SET due_at=NOW()-INTERVAL '1 minute' WHERE event_id=$1 AND status='PENDING'",[e.id]);await delivery.emitDueReminders();expect((await db.query("SELECT id FROM calendar_event_reminders WHERE event_id=$1 AND status='EMITTED'",[e.id])).rows).toHaveLength(0);
  await request(app.getHttpServer()).get(`${base}/${r.id}/preview?year=2028`).set(auth()).expect(200).expect(res=>expect(res.body.deliveryEnabled).toBe(false));
 });
 it('blocks source edits, cancellation, lost reviewer authority and owner suspension',async()=>{
  const {e,r}=await approved();await service.materializeDue();const current=async()=> (await db.query('SELECT calendar_recurrence_current($1) AS valid',[r.id])).rows[0].valid;expect(await current()).toBe(true);
  await users.setPhoneVerified(reviewer.id,false);expect(await current()).toBe(false);await users.setPhoneVerified(reviewer.id,true);
  await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[owner.id]);expect(await current()).toBe(false);await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[owner.id]);
  await db.query('DELETE FROM user_roles WHERE user_id=$1 AND role=$2',[reviewer.id,Role.SUPER_ADMIN]);expect(await current()).toBe(false);await users.assignRole(reviewer.id,Role.SUPER_ADMIN);
  await db.query("UPDATE calendar_events SET lifecycle_state='CANCELLED',version=version+1 WHERE id=$1",[e.id]);expect(await current()).toBe(false);
 });
 it('fails closed and rolls back proposal, review and materialization on audit failure',async()=>{
  const e=await event(),r=(await propose(e).expect(201)).body;const approvedRule=await approved(),another=await event();
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValue(new Error('Fictional audit outage'));try{
   await propose(another).expect(500);await decide(r).expect(500);await request(app.getHttpServer()).get(base).set(auth()).expect(500);await expect(service.materializeDue()).rejects.toThrow('Fictional audit outage');
  }finally{spy.mockRestore();}
  expect((await db.query('SELECT state FROM calendar_recurrence_rules WHERE id=$1',[r.id])).rows[0].state).toBe('PENDING');expect((await db.query('SELECT id FROM calendar_events WHERE recurrence_rule_id=$1',[approvedRule.r.id])).rows).toHaveLength(0);
 });
 it('requires immediate-family recusal at approval and again after relationships change',async()=>{
  const branch=(await db.query("INSERT INTO branches(code,name_nepali) VALUES('RECUR_FAMILY','काल्पनिक शाखा') RETURNING id")).rows[0].id;
  const parent=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,1) RETURNING id',[branch])).rows[0].id;
  const child=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,2) RETURNING id',[branch])).rows[0].id;
  await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[owner.id,parent]);await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[reviewer.id,child]);
  try{const {r}=await approved();await db.query("INSERT INTO parent_links(parent_id,child_id,confidence) VALUES($1,$2,'VERIFIED')",[parent,child]);
   expect((await db.query('SELECT calendar_recurrence_current($1) AS valid',[r.id])).rows[0].valid).toBe(false);
   const pending=(await propose(await event()).expect(201)).body;await decide(pending).expect(403);
  }finally{await db.query('UPDATE user_accounts SET person_id=NULL WHERE id=ANY($1::uuid[])',[[owner.id,reviewer.id]]);}
 });
 it('retains immutable source and decision evidence and refuses destructive rollback',async()=>{
  const {r}=await approved();await expect(db.query("UPDATE calendar_recurrence_rules SET source_date='2020-01-01' WHERE id=$1",[r.id])).rejects.toThrow('immutable');await expect(db.query('DELETE FROM calendar_recurrence_decisions WHERE rule_id=$1',[r.id])).rejects.toThrow('append-only');await expect(db.query('DELETE FROM calendar_recurrence_rules WHERE id=$1',[r.id])).rejects.toThrow('append-only');
  await expect(db.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/048_calendar_annual_recurrence.down.sql'),'utf8'))).rejects.toThrow('Cannot discard');
  const res=await request(app.getHttpServer()).get(base).set(auth()).expect(200);expect(res.headers['cache-control']).toBe('private, no-store');await request(app.getHttpServer()).get(`${base}?after=bad`).set(auth()).expect(400);await request(app.getHttpServer()).get(`${base}?extra=true`).set(auth()).expect(400);
 });
});
