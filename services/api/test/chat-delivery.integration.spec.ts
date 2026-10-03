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

describe('Chat explicit delivery acknowledgements and device consistency (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('chat_delivery');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 it('does not infer delivery from a committed send or a history GET',async()=>{
  message=await chat.send(group,author,{content:'Received is separate from read',clientMessageId:randomUUID()});
  const rows=(await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).expect(200)).body;
  expect(rows[0].deliveredToUserIds).not.toContain(reader.id);
  expect(rows[0].readByUserIds).not.toContain(reader.id);
 });
 it('acknowledges exact messages without marking earlier messages delivered or read',async()=>{
  const later=await chat.send(group,author,{content:'Later exact acknowledgement',clientMessageId:randomUUID()});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/delivered`).set('Authorization',auth(reader)).send({messageIds:[later.id]}).expect(201);
  const rows=await chat.messages(group,author);
  expect(rows.find(m=>m.id===message.id).deliveredToUserIds).not.toContain(reader.id);
  expect(rows.find(m=>m.id===later.id).deliveredToUserIds).toContain(reader.id);
  expect(rows.find(m=>m.id===later.id).readByUserIds).not.toContain(reader.id);
  expect((await chat.list(reader)).find(c=>c.id===group).unreadCount).toBe(2);
 });
 it('is idempotent across concurrent devices and keeps the original delivery time',async()=>{
  const body={messageIds:[message.id]};
  await Promise.all(Array.from({length:6},()=>request(app.getHttpServer()).post(`/chat/conversations/${group}/delivered`).set('Authorization',auth(reader)).send(body).expect(201)));
  const before=(await db.query('SELECT * FROM chat_message_deliveries WHERE message_id=$1 AND user_id=$2',[message.id,reader.id])).rows;
  expect(before).toHaveLength(1);
  await chat.delivered(group,reader,body);
  const after=(await db.query('SELECT * FROM chat_message_deliveries WHERE message_id=$1 AND user_id=$2',[message.id,reader.id])).rows;
  expect(after[0].delivered_at).toEqual(before[0].delivered_at);
 });
 it('rejects spoofed identity, invalid batches and nonmembers',async()=>{
  const endpoint=`/chat/conversations/${group}/delivered`;
  await request(app.getHttpServer()).post(endpoint).send({messageIds:[message.id]}).expect(401);
  for(const body of [{messageIds:[]},{messageIds:[message.id,message.id]},{messageIds:['invalid']},{messageIds:Array.from({length:101},()=>randomUUID())},{messageIds:[message.id],userId:author.id}]){
   await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(reader)).send(body).expect(400);
  }
  await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(outsider)).send({messageIds:[message.id]}).expect(404);
 });
 it('rejects missing and other-conversation IDs atomically',async()=>{
  const foreign=await chat.send(direct,author,{content:'Other conversation',clientMessageId:randomUUID()});
  const valid=await chat.send(group,author,{content:'Unacknowledged valid record',clientMessageId:randomUUID()});
  for(const invalid of [foreign.id,randomUUID()]){
   await request(app.getHttpServer()).post(`/chat/conversations/${group}/delivered`).set('Authorization',auth(reader)).send({messageIds:[valid.id,invalid]}).expect(400);
  }
  expect((await db.query('SELECT * FROM chat_message_deliveries WHERE message_id=$1 AND user_id=$2',[valid.id,reader.id])).rows).toHaveLength(0);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/read`).set('Authorization',auth(reader)).send({sequence:foreign.sequence}).expect(400);
 });
 it('makes reads imply delivery, and lower/zero reads never regress state',async()=>{
  const rows=await chat.messages(group,reader);const latest=rows[rows.length-1];
  await chat.read(group,reader,latest.sequence);await chat.read(group,reader,message.sequence);await chat.read(group,reader,0);
  const acknowledged=await chat.messages(group,author);
  for(const row of acknowledged){expect(row.readByUserIds).toContain(reader.id);expect(row.deliveredToUserIds).toContain(reader.id);}
  expect((await chat.list(reader)).find(c=>c.id===group).unreadCount).toBe(0);
 });
 it('restores the same durable receipts to another authenticated session',async()=>{
  const session=await app.get(SessionRepository).createSession({userId:reader.id,refreshTokenHash:randomUUID(),devicePlatform:'ANDROID',ipAddress:'127.0.0.1',userAgent:'fictional-second-device',expiresAt:new Date(Date.now()+3600000)});
  const token=app.get(JwtService).sign({sub:reader.id,sid:session.id,phoneNumber:'+9779847300002',tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
  const rows=(await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',`Bearer ${token}`).expect(200)).body;
  expect(rows.find((m:any)=>m.id===message.id).deliveredToUserIds).toContain(reader.id);
  expect(rows.find((m:any)=>m.id===message.id).readByUserIds).toContain(reader.id);
 });
 it('hides old receipts after removal and denies acknowledgements before restored history',async()=>{
  let info=await chat.info(group,author);
  await chat.removeMember(group,reader.id,author,{version:info.version});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/delivered`).set('Authorization',auth(reader)).send({messageIds:[message.id]}).expect(404);
  expect((await chat.messages(group,author))[0].deliveredToUserIds).not.toContain(reader.id);
  info=await chat.info(group,author);await chat.addMember(group,author,{version:info.version,personId:reader.personId});
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/delivered`).set('Authorization',auth(reader)).send({messageIds:[message.id]}).expect(400);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/read`).set('Authorization',auth(reader)).send({sequence:message.sequence}).expect(400);
  expect((await chat.messages(group,author))[0].deliveredToUserIds).not.toContain(reader.id);
  const fresh=await chat.send(group,author,{content:'After restored membership',clientMessageId:randomUUID()});
  await chat.delivered(group,reader,{messageIds:[fresh.id]});expect((await chat.messages(group,reader))).toHaveLength(1);
 });
 it('denies acknowledgements after account suspension or scoped role revocation',async()=>{
  const fresh=(await chat.messages(group,reader))[0];
  await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[reader.id]);
  await expect(chat.delivered(group,reader,{messageIds:[fresh.id]})).rejects.toThrow('Conversation not found');
  await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[reader.id]);
  await db.query('DELETE FROM user_roles WHERE user_id=$1',[reader.id]);
  await expect(chat.delivered(group,reader,{messageIds:[fresh.id]})).rejects.toThrow('Conversation not found');
  await app.get(UserRepository).assignRole(reader.id,Role.VERIFIED_MEMBER,branch);
 });
 it('acknowledges tombstones without restoring deleted content',async()=>{
  const fresh=(await chat.messages(group,reader))[0];await chat.removeMessage(group,fresh.id,author);
  await chat.delivered(group,reader,{messageIds:[fresh.id]});
  expect((await chat.messages(group,reader))[0]).toMatchObject({content:'',isDeleted:true,deliveredToUserIds:expect.arrayContaining([reader.id])});
 });
 it('refuses migration rollback that would erase unread delivery evidence',async()=>{
  const sql=readFileSync(resolve(__dirname,'../../../database/migrations/021_chat_delivery_receipts.down.sql'),'utf8');
  await expect(db.query(sql)).rejects.toThrow('Unread delivery evidence exists');
  expect((await db.query("SELECT to_regclass('chat_message_deliveries') AS name")).rows[0].name).toBe('chat_message_deliveries');
 });
});
