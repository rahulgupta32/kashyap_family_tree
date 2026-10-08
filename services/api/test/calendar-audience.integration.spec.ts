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
import { CalendarAudienceService } from '../src/modules/calendar/calendar-audience.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Verified genealogy audience previews and atomic send snapshots (PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,users:UserRepository,audit:AuditOutboxRepository;
 let branch:string,otherBranch:string,host:any,child:any,grand:any,hidden:any,minor:any,suspended:any,unverified:any,cross:any,leaf:any;
 let index=0;
 const auth=(u:any)=>({Authorization:`Bearer ${u.token}`});
 const selection=()=>({type:'DESCENDANTS',ancestorPersonId:host.personId});
 const event=(preview:any,criteria=selection())=>({title:'Fictional genealogy invitation '+randomUUID(),eventType:'GENERAL_EVENT',audienceScope:'INVITED_ONLY',
  startsAt:new Date(Date.now()+86400000*4).toISOString(),audienceSelection:criteria,audiencePreviewId:preview.previewId});
 const preview=async(criteria:any=selection(),u:any=host)=>(await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(u)).send({audienceScope:'INVITED_ONLY',audienceSelection:criteria}).expect(201)).body;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('calendar_audience');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);users=module.get(UserRepository);audit=module.get(AuditOutboxRepository);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('AUD1','परीक्षण','Fictional audience') RETURNING id")).rows[0].id;
  otherBranch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('AUD2','अर्को','Fictional other') RETURNING id")).rows[0].id;
  async function user(generation:number,b=branch){
   const phone='+97798476666'+String(++index).padStart(2,'0'),u=await users.findOrCreateByPhone(phone);
   await users.setPhoneVerified(u.id,true);
   const personId=(await db.query("INSERT INTO persons(branch_id,generation,birth_year_bs,is_claimed,claimed_user_id) VALUES($1,$2,2040,true,$3) RETURNING id",[b,generation,u.id])).rows[0].id;
   await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,'en','Fictional','Member',$2)",[personId,'Fictional member '+index]);
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,personId]);await users.assignRole(u.id,Role.VERIFIED_MEMBER,b);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'audience-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,personId,token};
  }
  host=await user(1);child=await user(2);grand=await user(3);hidden=await user(2);minor=await user(2);suspended=await user(2);unverified=await user(2);cross=await user(3,otherBranch);leaf=await user(3);
  await db.query("UPDATE persons SET profile_visibility='PRIVATE' WHERE id=$1",[hidden.personId]);await db.query('UPDATE persons SET is_minor_protected=true WHERE id=$1',[minor.personId]);await db.query('UPDATE user_accounts SET is_suspended=true WHERE id=$1',[suspended.id]);
  for(const [parent,target,confidence] of [[host,child,'VERIFIED'],[child,grand,'VERIFIED'],[grand,host,'VERIFIED'],[host,hidden,'VERIFIED'],[hidden,leaf,'VERIFIED'],[host,minor,'VERIFIED'],[host,suspended,'VERIFIED'],[host,unverified,'UNVERIFIED'],[child,cross,'VERIFIED']])
   await db.query('INSERT INTO parent_links(parent_id,child_id,confidence) VALUES($1,$2,$3)',[(parent as any).personId,(target as any).personId,confidence]);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires authority, rejects injected selector fields and excludes hidden/unverified paths while terminating cycles',async()=>{
  await request(app.getHttpServer()).post('/calendar/events/preview').send({audienceSelection:selection()}).expect(401);
  const p=await preview();expect(p.recipientCount).toBe(3);expect(p.recipients.map((r:any)=>r.userId).sort()).toEqual([child.id,grand.id,cross.id].sort());
  expect(JSON.stringify(p)).not.toContain('+977');expect(JSON.stringify(p)).not.toContain(hidden.personId);
  for(const criteria of [{...selection(),extra:true},{type:'RELATIONSHIP_GROUP',group:'Saino'},{type:'GENERATION',branchId:branch,generation:101}])
   await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:criteria}).expect(400);
  await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:{type:'BRANCH',branchId:otherBranch}}).expect(403);
  await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:{type:'BRANCH',branchId:randomUUID()}}).expect(403);
 });
 it('resolves branch/generation against current Person branch and verified account membership',async()=>{
  const b=await preview({type:'BRANCH',branchId:branch});expect(b.recipients.map((r:any)=>r.userId).sort()).toEqual([host.id,child.id,grand.id,unverified.id,leaf.id].sort());
  const g=await preview({type:'GENERATION',branchId:branch,generation:2});expect(g.recipients.map((r:any)=>r.userId).sort()).toEqual([child.id,unverified.id].sort());
  await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:selection(),invitedUserIds:[child.id]}).expect(400);
 });
 it('requires an actor-bound, unchanged, unexpired preview and rejects graph/role changes before sending',async()=>{
  const p=await preview();const body=event(p);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({...body,audiencePreviewId:undefined}).expect(400);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(child)).send(body).expect(409);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({...body,audienceSelection:{type:'BRANCH',branchId:branch}}).expect(409);
  await db.query('UPDATE persons SET version=version+1 WHERE id=$1',[child.personId]);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(body).expect(409);
  const p2=await preview();await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='VERIFIED_MEMBER'",[grand.id]);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(event(p2)).expect(409);await users.assignRole(grand.id,Role.VERIFIED_MEMBER,branch);
  const expired=(await db.query(`INSERT INTO calendar_audience_previews(actor_id,selection,audience_scope,branch_id,basis,fingerprint,preview_context,expires_at)
   SELECT actor_id,selection,audience_scope,branch_id,basis,fingerprint,preview_context,NOW()-INTERVAL '1 minute' FROM calendar_audience_previews WHERE id=$1 RETURNING id`,[p2.previewId])).rows[0].id;
  const clock=jest.spyOn(Date,'now').mockReturnValue(Date.now()-3600000);
  try{await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(event({previewId:expired})).expect(409);}
  finally{clock.mockRestore();}
 });
 it('consumes a preview exactly once under concurrent sends and retains reconstructible immutable evidence after restart',async()=>{
  const p=await preview(),body=event(p);const sent=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(body)));
  expect(sent.map(r=>r.status).sort()).toEqual([201,409]);const e=sent.find(r=>r.status===201)!.body;
  const rows=(await db.query('SELECT * FROM calendar_audience_previews WHERE id=$1',[p.previewId])).rows;expect(rows[0].event_id).toBe(e.id);expect(rows[0].event_version).toBe(1);expect(rows[0].send_context.snapshot).toBeTruthy();
  const h=(await request(app.getHttpServer()).get(`/calendar/events/${e.id}/history`).set(auth(host)).expect(200)).body;
  expect(h[0].audienceEvidence.basis.recipients.map((r:any)=>r.userId).sort()).toEqual([child.id,grand.id,cross.id].sort());
  expect(h[0].audienceEvidence.basis.edges.every((edge:any)=>edge.confidence==='VERIFIED')).toBe(true);expect(h[0].audienceEvidence.basis.nodes.length).toBeGreaterThan(3);
  expect(JSON.stringify(h[0].audienceEvidence)).not.toContain('Fictional member');expect(JSON.stringify(h[0].audienceEvidence)).not.toContain('+977');
  await request(app.getHttpServer()).get(`/calendar/events/${e.id}/history`).set(auth(child)).expect(404);
  expect((await request(app.getHttpServer()).get(`/calendar/events/${e.id}`).set(auth(child)).expect(200)).body.audienceSelection).toBeUndefined();
  await expect(db.query("UPDATE calendar_audience_previews SET basis='{}' WHERE id=$1",[p.previewId])).rejects.toThrow('immutable');
  await expect(db.query('DELETE FROM calendar_audience_previews WHERE id=$1',[p.previewId])).rejects.toThrow('cannot be deleted');
  const restarted=new CalendarAudienceService(db,audit);await expect(db.transaction(tx=>restarted.confirm(host.id,body,tx))).rejects.toThrow('unavailable');
  const fresh=await preview({type:'GENERATION',branchId:branch,generation:2});
  await request(app.getHttpServer()).patch(`/calendar/events/${e.id}`).set(auth(host)).send({version:1,audienceScope:'COMMUNITY'}).expect(400);
  const replaced=(await request(app.getHttpServer()).patch(`/calendar/events/${e.id}`).set(auth(host)).send({version:1,audienceSelection:fresh.selection,audiencePreviewId:fresh.previewId}).expect(200)).body;
  expect(replaced.invitedUserIds.sort()).toEqual([child.id,unverified.id].sort());
  const history=(await request(app.getHttpServer()).get(`/calendar/events/${e.id}/history`).set(auth(host)).expect(200)).body;
  expect(history[0].audienceEvidence.previewId).toBe(fresh.previewId);expect(history[1].audienceEvidence.previewId).toBe(p.previewId);
 });
 it('rolls back invitations, evidence consumption and event revisions if audit intent fails, allowing a safe retry',async()=>{
  const p=await preview(),body=event(p);const original=audit.recordAuditIntent.bind(audit);
  const spy=jest.spyOn(audit,'recordAuditIntent').mockImplementation(async(data:any,tx:any)=>{if(data.action==='CALENDAR_AUDIENCE_CONFIRMED')throw new Error('Fictional audit outage');return original(data,tx);});
  try{await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(body).expect(500);}finally{spy.mockRestore();}
  expect((await db.query('SELECT consumed_at FROM calendar_audience_previews WHERE id=$1',[p.previewId])).rows[0].consumed_at).toBeNull();
  expect((await db.query('SELECT id FROM calendar_events WHERE title=$1',[body.title])).rows).toHaveLength(0);
  await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(body).expect(201);
 });
 it('rechecks actor authority and claimed-account eligibility instead of trusting a previously resolved roster',async()=>{
  const p=await preview();await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='VERIFIED_MEMBER'",[host.id]);
  try{
   await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(event(p)).expect(403);
   const used=(await db.query('SELECT event_id FROM calendar_audience_previews WHERE actor_id=$1 AND event_id IS NOT NULL LIMIT 1',[host.id])).rows[0];
   await request(app.getHttpServer()).get(`/calendar/events/${used.event_id}/history`).set(auth(host)).expect(403);
  }
  finally{await users.assignRole(host.id,Role.VERIFIED_MEMBER,branch);}
  const current=await preview();await db.query('UPDATE persons SET is_claimed=false WHERE id=$1',[cross.personId]);
  try{
   await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(event(current)).expect(409);
   expect((await preview()).recipients.map((r:any)=>r.userId)).not.toContain(cross.id);
  }finally{await db.query('UPDATE persons SET is_claimed=true WHERE id=$1',[cross.personId]);}
 });
 it('rejects audiences over 100 eligible accounts rather than silently dropping later recipients',async()=>{
  const added=(await db.query(`WITH accounts AS (
   INSERT INTO user_accounts(phone_number,is_phone_verified) SELECT '+9779847555'||LPAD(i::text,3,'0'),true FROM generate_series(1,101)i RETURNING id
  ), people AS (
   INSERT INTO persons(branch_id,generation,birth_year_bs,is_claimed,claimed_user_id) SELECT $1,99,2040,true,id FROM accounts RETURNING id,claimed_user_id
  ) SELECT id,claimed_user_id FROM people`,[branch])).rows;
  const personIds=added.map(r=>r.id),userIds=added.map(r=>r.claimed_user_id);
  try{
   await db.query('UPDATE user_accounts u SET person_id=p.id FROM persons p WHERE p.claimed_user_id=u.id AND u.id=ANY($1::uuid[])',[userIds]);
   await db.query("INSERT INTO user_roles(user_id,role,branch_id) SELECT UNNEST($1::uuid[]),'VERIFIED_MEMBER',$2",[userIds,branch]);
   await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:{type:'GENERATION',branchId:branch,generation:99}}).expect(400);
  }finally{
   await db.query('UPDATE user_accounts SET person_id=NULL WHERE id=ANY($1::uuid[])',[userIds]);await db.query('DELETE FROM user_roles WHERE user_id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM persons WHERE id=ANY($1::uuid[])',[personIds]);await db.query('DELETE FROM user_accounts WHERE id=ANY($1::uuid[])',[userIds]);
  }
 });
 it('rejects oversized graph selections instead of returning a truncated recipient preview',async()=>{
  const extra=(await db.query("INSERT INTO persons(branch_id,generation,birth_year_bs) SELECT $1,2,2040 FROM generate_series(1,1001) RETURNING id",[branch])).rows.map(r=>r.id);
  try{
   await db.query("INSERT INTO parent_links(parent_id,child_id,confidence) SELECT $1,UNNEST($2::uuid[]),'VERIFIED'",[host.personId,extra]);
   await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({audienceSelection:selection()}).expect(400);
  }finally{await db.query('DELETE FROM parent_links WHERE child_id=ANY($1::uuid[])',[extra]);await db.query('DELETE FROM persons WHERE id=ANY($1::uuid[])',[extra]);}
 });
});
