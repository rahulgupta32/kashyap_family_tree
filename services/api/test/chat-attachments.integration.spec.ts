import { ChatAttachmentsService } from '../src/modules/chat/chat-attachments.service';
import { promises as files, mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
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

describe('Chat private attachments and durable retry integrity (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const oldStorage=process.env.STORAGE_PATH;let storage:string;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  storage=mkdtempSync(path.join(os.tmpdir(),'kashyap-chat-files-'));process.env.STORAGE_PATH=storage;
  iso=await createDisposableDatabase('chat_attachments');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();if(storage)await files.rm(storage,{recursive:true,force:true});if(oldStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=oldStorage;});
 it('commits one immutable message/file across concurrent requests and replay after scanner outage',async()=>{
  const body=payload(),endpoint=`/chat/conversations/${group}/attachments`;
  await request(app.getHttpServer()).post(endpoint).send(body).expect(401);
  await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(outsider)).send(body).expect(404);
  const results=await Promise.all(Array.from({length:5},()=>request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(body).expect(201)));
  message=results[0].body;expect(new Set(results.map(r=>r.body.id)).size).toBe(1);
  expect((await db.query('SELECT * FROM chat_message_attachments')).rows).toHaveLength(1);expect(await files.readdir(path.join(storage,'chat'))).toHaveLength(1);
  process.env.SIMULATE_SCANNER_FAILURE='true';
  try{await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(body).expect(201);
   await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(payload()).expect(503);
  }finally{delete process.env.SIMULATE_SCANNER_FAILURE;}
  for(const changed of [{...body,content:'Changed caption'},{...body,mimeType:'application/pdf',dataBase64:Buffer.from('%PDF-1.7 fictional').toString('base64')}])await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(changed).expect(409);
 });
 it('streams private bytes only to current authorized history and closes the generic profile-media bypass',async()=>{
  const endpoint=`/chat/conversations/${group}/messages/${message.id}/attachment`;
  const result=await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(reader)).expect(200);
  expect(result.body).toEqual(Buffer.from(png,'base64'));expect(result.headers['cache-control']).toBe('no-store');expect(result.headers['x-content-type-options']).toBe('nosniff');
  const asset=(await db.query('SELECT asset_id FROM chat_message_attachments WHERE message_id=$1',[message.id])).rows[0];
  await request(app.getHttpServer()).get(`/profile/media/${asset.asset_id}`).set('Authorization',auth(author)).expect(404);
  await request(app.getHttpServer()).get(`/claims/evidence/${asset.asset_id}`).set('Authorization',auth(author)).expect(404);
  await app.get(UserRepository).assignRole(outsider.id,Role.CENTRAL_ADMIN);
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(outsider)).expect(404);
  await request(app.getHttpServer()).get(`/profile/media/${asset.asset_id}`).set('Authorization',auth(outsider)).expect(404);
  await request(app.getHttpServer()).get(`/claims/evidence/${asset.asset_id}`).set('Authorization',auth(outsider)).expect(404);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages/${message.id}/report`).set('Authorization',auth(reader)).send({reason:'Fictional attachment report'}).expect(201);
  const report=(await db.query('SELECT id FROM chat_message_reports')).rows[0];
  await request(app.getHttpServer()).get(`/chat/reports/${report.id}/attachment`).set('Authorization',auth(reader)).expect(403);
  await request(app.getHttpServer()).get(`/chat/reports/${report.id}/attachment`).set('Authorization',auth(outsider)).expect(200);
 });
 it('revokes downloads on removal and never exposes old attachments to restored members',async()=>{
  let info=await chat.info(group,author);await chat.removeMember(group,reader.id,author,{version:info.version});
  const endpoint=`/chat/conversations/${group}/messages/${message.id}/attachment`;
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(reader)).expect(404);
  info=await chat.info(group,author);await chat.addMember(group,author,{version:info.version,personId:reader.personId});
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(reader)).expect(404);
 });
 it('hides tombstoned attachments from members and reported-file review',async()=>{
  await chat.removeMessage(group,message.id,author);
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages/${message.id}/attachment`).set('Authorization',auth(author)).expect(404);
  expect((await chat.messages(group,author)).find(m=>m.id===message.id).attachment).toBeNull();
  const report=(await db.query('SELECT id FROM chat_message_reports')).rows[0];
  await request(app.getHttpServer()).get(`/chat/reports/${report.id}/attachment`).set('Authorization',auth(outsider)).expect(404);
 });
 it('rolls back media and messages and removes the physical file when audit persistence fails',async()=>{
  const before=await files.readdir(path.join(storage,'chat'));
  const audit=app.get(require('../src/database/repositories/audit-outbox.repository').AuditOutboxRepository);
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('audit unavailable'));
  const body=payload();
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/attachments`).set('Authorization',auth(author)).send(body).expect(500);spy.mockRestore();
  expect((await db.query('SELECT id FROM chat_messages WHERE client_message_id=$1',[body.clientMessageId])).rows).toHaveLength(0);
  expect(await files.readdir(path.join(storage,'chat'))).toEqual(before);
 });
 it('keeps committed bytes after a lost COMMIT acknowledgement and reconciles with one message',async()=>{
  const transact=db.transaction.bind(db);let calls=0;
  const spy=jest.spyOn(db,'transaction').mockImplementation(async(work:any)=>{const result=await transact(work);calls++;if(calls===2)throw new Error('Fictional lost COMMIT acknowledgement');return result;});
  const body=payload();
  try{await request(app.getHttpServer()).post(`/chat/conversations/${group}/attachments`).set('Authorization',auth(author)).send(body).expect(500);}finally{spy.mockRestore();}
  const records=(await db.query('SELECT id FROM chat_messages WHERE client_message_id=$1',[body.clientMessageId])).rows;expect(records).toHaveLength(1);
  const asset=(await db.query('SELECT a.* FROM media_assets a JOIN chat_message_attachments link ON link.asset_id=a.id WHERE link.message_id=$1',[records[0].id])).rows[0];expect(await files.readFile(asset.storage_path)).toEqual(Buffer.from(png,'base64'));
  const replay=await request(app.getHttpServer()).post(`/chat/conversations/${group}/attachments`).set('Authorization',auth(author)).send(body).expect(201);expect(replay.body.id).toBe(records[0].id);
 });
 it('rejects file tampering and unsafe metadata paths without streaming bytes',async()=>{
  const sent=await app.get(ChatAttachmentsService).send(group,author,payload());
  const asset=(await db.query('SELECT a.* FROM media_assets a JOIN chat_message_attachments link ON link.asset_id=a.id WHERE link.message_id=$1',[sent.id])).rows[0];
  const endpoint=`/chat/conversations/${group}/messages/${sent.id}/attachment`;
  await files.writeFile(asset.storage_path,'altered');await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(author)).expect(503);
  await db.query("UPDATE media_assets SET storage_path='/etc/passwd' WHERE id=$1",[asset.id]);await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(author)).expect(404);
 });
});
