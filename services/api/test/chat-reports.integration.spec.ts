import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Chat reports and independent moderation (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('chat_reports');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.listen(0, '127.0.0.1');
  db=module.get(DatabaseService);chat=module.get(ChatService);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('CHAT_A','परीक्षण अ','Fictional A') RETURNING id")).rows[0].id;
  otherBranch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('CHAT_B','परीक्षण ब','Fictional B') RETURNING id")).rows[0].id;
  async function user(phone:string,role:Role,b:string){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,role,b);
   const person=(await db.query("INSERT INTO persons(gender,living_status,generation,branch_id,birth_year_bs,is_claimed,claimed_user_id) VALUES('MALE','LIVING',3,$1,2040,true,$2) RETURNING id",[b,u.id])).rows[0];
   await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Fictional','Participant','Fictional Participant',true)",[person.id]);
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person.id]);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'chat-test',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,personId:person.id,sessionId:session.id,token,roles:[role],branchIds:[b],roleAssignments:[{role,branchId:b}]};
  }
  author=await user('+9779847300001',Role.BRANCH_ADMIN,branch);reader=await user('+9779847300002',Role.VERIFIED_MEMBER,branch);outsider=await user('+9779847300003',Role.BRANCH_ADMIN,otherBranch);
  group=(await chat.create(author,{type:'GROUP',title:'Fictional receipt group',memberPersonIds:[reader.personId]})).id;
  direct=(await chat.create(author,{type:'DIRECT',personId:reader.personId})).id;
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('accepts one durable report across concurrent retries and exposes only that message',async()=>{
  message=await chat.send(group,author,{content:'Reported record',clientMessageId:randomUUID()});
  await chat.send(group,author,{content:'Unreported private history',clientMessageId:randomUUID()});
  const endpoint=`/chat/conversations/${group}/messages/${message.id}/report`;
  await request(app.getHttpServer()).post(endpoint).send({reason:'Spam'}).expect(401);
  await Promise.all(Array.from({length:5},()=>request(app.getHttpServer()).post(endpoint).set('Authorization',auth(reader)).send({reason:'Spam'}).expect(201)));
  expect((await db.query('SELECT * FROM chat_message_reports')).rows).toHaveLength(1);
  await request(app.getHttpServer()).get('/chat/reports').set('Authorization',auth(author)).expect(403);
  await app.get(UserRepository).assignRole(outsider.id,Role.CENTRAL_ADMIN);
  const rows=(await request(app.getHttpServer()).get('/chat/reports').set('Authorization',auth(outsider)).expect(200)).body;
  expect(rows).toHaveLength(1);expect(rows[0].content).toBe('Reported record');
  expect(rows[0].senderUserId).toBeUndefined();expect(rows[0].reporterId).toBeUndefined();
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(outsider)).expect(404);
 });
 it('rejects foreign messages and messages outside restored history',async()=>{
  const foreign=await chat.send(direct,author,{content:'Foreign',clientMessageId:randomUUID()});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages/${foreign.id}/report`).set('Authorization',auth(reader)).send({reason:'Spam'}).expect(404);
  let info=await chat.info(group,author);await chat.removeMember(group,reader.id,author,{version:info.version});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages/${message.id}/report`).set('Authorization',auth(reader)).send({reason:'Spam'}).expect(404);
  info=await chat.info(group,author);await chat.addMember(group,author,{version:info.version,personId:reader.personId});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages/${message.id}/report`).set('Authorization',auth(reader)).send({reason:'Spam'}).expect(404);
 });
 it('prevents self review and rolls back removal when audit persistence fails',async()=>{
  const report=(await db.query('SELECT id FROM chat_message_reports')).rows[0];
  await app.get(UserRepository).assignRole(author.id,Role.CENTRAL_ADMIN);
  await request(app.getHttpServer()).post(`/chat/reports/${report.id}/resolve`).set('Authorization',auth(author)).send({decision:'REMOVED',note:'Review'}).expect(403);
  const audit=app.get(require('../src/database/repositories/audit-outbox.repository').AuditOutboxRepository);
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('audit unavailable'));
  await request(app.getHttpServer()).post(`/chat/reports/${report.id}/resolve`).set('Authorization',auth(outsider)).send({decision:'REMOVED',note:'Reviewed spam'}).expect(500);
  spy.mockRestore();
  expect((await db.query('SELECT status FROM chat_message_reports WHERE id=$1',[report.id])).rows[0].status).toBe('OPEN');
  expect((await db.query('SELECT deleted_at FROM chat_messages WHERE id=$1',[message.id])).rows[0].deleted_at).toBeNull();
  await request(app.getHttpServer()).post(`/chat/reports/${report.id}/resolve`).set('Authorization',auth(outsider)).send({decision:'REMOVED',note:'Reviewed spam'}).expect(201);
  expect((await chat.messages(group,author)).find(m=>m.id===message.id).content).toBe('');
  await request(app.getHttpServer()).post(`/chat/reports/${report.id}/resolve`).set('Authorization',auth(outsider)).send({decision:'DISMISSED',note:'Second decision'}).expect(409);
 });
});
