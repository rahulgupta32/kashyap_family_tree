import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { ChatService } from '../src/modules/chat/chat.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { NotificationInboxService } from '../src/modules/notifications/notification-inbox.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Governed private/branch group roles and membership boundaries (PostgreSQL/HTTP/WebSocket)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService,audit:AuditOutboxRepository,
   dispatcher:NotificationDispatcherService,inbox:NotificationInboxService;
 let branch:string,owner:any,b:any,c:any,outsider:any;
 const auth=(u:any)=>({Authorization:`Bearer ${u.token}`});
 const group=()=>chat.create(owner,{type:'GROUP',title:'Fictional private group',description:'Fictional purpose',memberPersonIds:[b.personId,c.personId]});
 const info=(id:string,u=owner)=>chat.info(id,u);
 beforeAll(async()=>{
  iso=await createDisposableDatabase('chat_groups');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.listen(0,'127.0.0.1');
  db=module.get(DatabaseService);chat=module.get(ChatService);audit=module.get(AuditOutboxRepository);
  dispatcher=module.get(NotificationDispatcherService);inbox=module.get(NotificationInboxService);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('GROUP_A','परीक्षण','Fictional Group') RETURNING id")).rows[0].id;
  async function user(phone:string,role:Role){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,role,branch);
   const person=(await db.query("INSERT INTO persons(gender,living_status,generation,branch_id,birth_year_bs,is_claimed,claimed_user_id) VALUES('MALE','LIVING',3,$1,2040,true,$2) RETURNING id",[branch,u.id])).rows[0];
   await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Fictional','Group Member','Fictional Group Member',true)",[person.id]);
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person.id]);
   await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,false,false)',[u.id]);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'group-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,personId:person.id,token,roles:[role],branchIds:[branch],roleAssignments:[{role,branchId:branch}]};
  }
  owner=await user('+9779847334441',Role.VERIFIED_MEMBER);b=await user('+9779847334442',Role.VERIFIED_MEMBER);
  c=await user('+9779847334443',Role.VERIFIED_MEMBER);outsider=await user('+9779847334444',Role.SUPER_ADMIN);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});

 it('creates selected members and exactly one owner atomically, without caller-supplied roles',async()=>{
  await request(app.getHttpServer()).post('/chat/conversations').send({type:'GROUP'}).expect(401);
  await request(app.getHttpServer()).post('/chat/conversations').set(auth(owner)).send({type:'GROUP',title:'Invalid',memberPersonIds:[b.personId],roles:['OWNER']}).expect(400);
  const g=(await request(app.getHttpServer()).post('/chat/conversations').set(auth(owner)).send({type:'GROUP',title:'Fictional HTTP group',memberPersonIds:[b.personId,c.personId]}).expect(201)).body;
  const detail=await info(g.id);expect(detail).toMatchObject({type:'GROUP',version:1,myRole:'OWNER',canManage:true,memberCount:3});
  expect(detail.members.filter(m=>m.role==='OWNER').map(m=>m.userId)).toEqual([owner.id]);
  expect(JSON.stringify(detail)).not.toContain('+977');
  expect((await db.query("SELECT * FROM audit_outbox WHERE entity_id=$1 AND action='CHAT_GROUP_CREATED'",[g.id])).rows).toHaveLength(1);
 });
 it('rejects private-group self-join and nonmember access even for platform administrators',async()=>{
  const g=await group();
  await request(app.getHttpServer()).post(`/chat/conversations/${g.id}/join`).set(auth(outsider)).expect(404);
  await request(app.getHttpServer()).get(`/chat/conversations/${g.id}`).set(auth(outsider)).expect(404);
  await request(app.getHttpServer()).get(`/chat/conversations/${g.id}/messages`).set(auth(outsider)).expect(404);
  expect((await chat.list(outsider)).some(x=>x.id===g.id)).toBe(false);
 });
 it('refuses empty, duplicate, oversized, self, private and protected profile selections',async()=>{
  for(const ids of [[],[b.personId,b.personId],Array.from({length:50},()=>randomUUID()),[owner.personId]])
   await expect(chat.create(owner,{type:'GROUP',title:'Invalid',memberPersonIds:ids})).rejects.toThrow();
  await db.query("UPDATE persons SET profile_visibility='PRIVATE' WHERE id=$1",[b.personId]);
  try{await expect(group()).rejects.toThrow();}finally{await db.query("UPDATE persons SET profile_visibility='VERIFIED_COMMUNITY' WHERE id=$1",[b.personId]);}
  await db.query('UPDATE persons SET birth_year_bs=2080 WHERE id=$1',[b.personId]);
  try{await expect(group()).rejects.toThrow('unavailable for group');}finally{await db.query('UPDATE persons SET birth_year_bs=2040 WHERE id=$1',[b.personId]);}
 });
 it('honors blocks while selecting group members',async()=>{
  await db.query('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES($1,$2)',[b.id,owner.id]);
  try{await expect(group()).rejects.toThrow('invitation is blocked');}finally{await db.query('DELETE FROM chat_blocks WHERE blocker_id=$1 AND blocked_id=$2',[b.id,owner.id]);}
 });
 it('rejects alias/canonical selections resolving to one account before writing any group',async()=>{
  const alias=(await db.query(`INSERT INTO persons(gender,living_status,generation,branch_id,birth_year_bs,is_archived,archive_reason)
   VALUES('MALE','LIVING',3,$1,2040,TRUE,$2) RETURNING id`,[branch,`MERGED_INTO:${b.personId}`])).rows[0].id;
  const before=(await db.query('SELECT count(*) FROM chat_conversations')).rows[0].count;
  const response=await request(app.getHttpServer()).post('/chat/conversations').set(auth(owner)).send({type:'GROUP',title:'Fictional alias collision',memberPersonIds:[b.personId,alias]}).expect(400);
  expect(response.body.message).toContain('distinct eligible members');
  expect((await db.query('SELECT count(*) FROM chat_conversations')).rows[0].count).toBe(before);
 });
 it('denies member management and promotion of self or arbitrary owner roles',async()=>{
  const g=await group();
  await request(app.getHttpServer()).patch(`/chat/conversations/${g.id}`).set(auth(b)).send({version:1,title:'Unauthorized'}).expect(403);
  await request(app.getHttpServer()).patch(`/chat/conversations/${g.id}/members/${b.id}`).set(auth(b)).send({version:1,role:'ADMIN'}).expect(403);
  await request(app.getHttpServer()).patch(`/chat/conversations/${g.id}/members/${b.id}`).set(auth(owner)).send({version:1,role:'OWNER'}).expect(400);
  await request(app.getHttpServer()).post(`/chat/conversations/${g.id}/owner`).set(auth(b)).send({version:1,userId:b.id}).expect(403);
 });
 it('allows owner/admin settings but only owner role changes and protects peer admins',async()=>{
  const g=await group();await chat.setMemberRole(g.id,b.id,owner,{version:1,role:'ADMIN'});
  await chat.updateGroup(g.id,b,{version:2,title:'Fictional renamed group',description:'Updated purpose'});
  expect((await info(g.id)).title).toBe('Fictional renamed group');
  await chat.setMemberRole(g.id,c.id,owner,{version:3,role:'ADMIN'});
  await expect(chat.removeMember(g.id,c.id,b,{version:4})).rejects.toThrow('Cannot remove');
  await expect(chat.setMemberRole(g.id,c.id,b,{version:4,role:'MEMBER'})).rejects.toThrow('owner authority');
  await expect(chat.removeMember(g.id,owner.id,b,{version:4})).rejects.toThrow('Cannot remove');
  await chat.setMemberRole(g.id,c.id,owner,{version:4,role:'MEMBER'});
  await chat.removeMember(g.id,c.id,b,{version:5});
  await request(app.getHttpServer()).get(`/chat/conversations/${g.id}`).set(auth(c)).expect(404);
 });
 it('serializes concurrent metadata changes and rejects stale versions',async()=>{
  const g=await group();
  const responses=await Promise.all(['First','Second'].map(title=>request(app.getHttpServer()).patch(`/chat/conversations/${g.id}`).set(auth(owner)).send({version:1,title})));
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect((await info(g.id)).version).toBe(2);
 });
 it('requires transfer before owner leave and keeps a single owner under concurrent transfer',async()=>{
  const g=await group();await expect(chat.leave(g.id,owner)).rejects.toThrow('Transfer ownership');
  const responses=await Promise.all([b,c].map(u=>request(app.getHttpServer()).post(`/chat/conversations/${g.id}/owner`).set(auth(owner)).send({version:1,userId:u.id})));
  expect(responses.map(r=>r.status).sort()).toEqual([201,403]);
  const detail=await info(g.id);expect(detail.members.filter(m=>m.role==='OWNER')).toHaveLength(1);expect(detail.myRole).toBe('ADMIN');
  await chat.leave(g.id,owner);await expect(info(g.id)).rejects.toThrow('Conversation not found');
 });
 it('applies private-group membership boundaries to history, unread counts and delayed notices',async()=>{
  const g=await chat.create(owner,{type:'GROUP',title:'Fictional history boundary',memberPersonIds:[b.personId]});
  const old=await chat.send(g.id,owner,{content:'Before membership',clientMessageId:randomUUID()});
  await chat.addMember(g.id,owner,{version:1,personId:c.personId});
  expect(await chat.messages(g.id,c)).toEqual([]);
  expect((await chat.list(c)).find(x=>x.id===g.id).unreadCount).toBe(0);
  const oldIntent=(await db.query('SELECT * FROM audit_outbox WHERE entity_id=$1',[old.id])).rows[0];await dispatcher.processRecord(oldIntent);
  expect((await db.query('SELECT * FROM notification_inbox WHERE outbox_id=$1 AND recipient_user_id=$2',[oldIntent.id,c.id])).rows).toHaveLength(0);
  const next=await chat.send(g.id,owner,{content:'After membership',clientMessageId:randomUUID()});
  expect((await chat.messages(g.id,c)).map(x=>x.id)).toEqual([next.id]);
 });
 it('removal revokes queued notices and restoration never reveals former private history',async()=>{
  const g=await group();const sent=await chat.send(g.id,owner,{content:'Fictional membership notice',clientMessageId:randomUUID()});
  const intent=(await db.query('SELECT * FROM audit_outbox WHERE entity_id=$1',[sent.id])).rows[0];await dispatcher.processRecord(intent);
  const ids=(await db.query('SELECT id FROM notification_inbox WHERE outbox_id=$1 AND recipient_user_id=$2',[intent.id,b.id])).rows.map(x=>x.id);expect(ids).toHaveLength(1);
  await chat.removeMember(g.id,b.id,owner,{version:1});await expect(chat.messages(g.id,b)).rejects.toThrow('Conversation not found');
  expect((await inbox.list(b.id)).items.some(x=>ids.includes(x.id))).toBe(false);
  await chat.addMember(g.id,owner,{version:2,personId:b.personId});
  expect(await chat.messages(g.id,b)).toEqual([]);expect((await inbox.list(b.id)).items.some(x=>ids.includes(x.id))).toBe(false);
  expect((await info(g.id,b)).myRole).toBe('MEMBER');
 });
 it('branch member removal prevents self-join and branch-room creation bypasses',async()=>{
  const branchAdmin={...outsider};
  const g=await chat.create(branchAdmin,{type:'FAMILY_BRANCH',branchId:branch,title:'Fictional managed branch'});
  await chat.join(g.id,b);await chat.removeMember(g.id,b.id,branchAdmin,{version:2});
  await expect(chat.join(g.id,b)).rejects.toThrow('restore removed');
  expect((await chat.list(b)).some(x=>x.id===g.id)).toBe(false);
  await chat.addMember(g.id,branchAdmin,{version:3,personId:b.personId});await chat.join(g.id,b);
  expect((await info(g.id,b)).myRole).toBe('MEMBER');
 });
 it('masks private profile names in member rosters',async()=>{
  const g=await group();await db.query("UPDATE persons SET profile_visibility='PRIVATE' WHERE id=$1",[b.personId]);
  try{expect((await info(g.id)).members.find(x=>x.userId===b.id).name).toBe('Member');}
  finally{await db.query("UPDATE persons SET profile_visibility='VERIFIED_COMMUNITY' WHERE id=$1",[b.personId]);}
 });
 it('does not trust stale actor roles after revocation or suspension',async()=>{
  const g=await group();await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[b.id]);
  try{await expect(chat.access(g.id,b)).rejects.toThrow('Conversation not found');}
  finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[b.id]);}
 });
 it('rolls back membership and settings if the durable audit write fails',async()=>{
  const g=await group();const failure=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected group audit failure'));
  try{await expect(chat.removeMember(g.id,b.id,owner,{version:1})).rejects.toThrow('Injected');}finally{failure.mockRestore();}
  expect((await info(g.id)).version).toBe(1);await chat.access(g.id,b);
  const fail=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected settings audit failure'));
  try{await expect(chat.updateGroup(g.id,owner,{version:1,title:'Never committed'})).rejects.toThrow('Injected');}finally{fail.mockRestore();}
  expect((await info(g.id)).title).toBe('Fictional private group');
 });
 it('closes an already subscribed live socket when its member is removed',async()=>{
  const g=await group();const url=`ws://127.0.0.1:${(app.getHttpServer().address() as any).port}/chat/socket`;
  const ws=new WebSocket(url,{origin:'http://127.0.0.1:3002'});
  try{
   await new Promise<void>((resolve,reject)=>{ws.once('open',()=>{ws.send(JSON.stringify({type:'auth',token:b.token}));});ws.on('message',data=>{
    const frame=JSON.parse(data.toString());if(frame.type==='authenticated')ws.send(JSON.stringify({type:'subscribe',conversationId:g.id}));if(frame.type==='snapshot')resolve();
   });ws.once('error',reject);});
   const closed=new Promise<number>(resolve=>ws.once('close',resolve));await chat.removeMember(g.id,b.id,owner,{version:1});expect(await closed).toBe(4403);
  }finally{ws.terminate();}
 },15000);
});
