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
import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Chat persistent membership, messages and receipts (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('chat');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires JWT and rejects spoofed participant creation',async()=>{
  await request(app.getHttpServer()).get('/chat/conversations').expect(401);
  await request(app.getHttpServer()).post('/chat/conversations').set('Authorization',auth(author)).send({type:'DIRECT',participantUserIds:[outsider.id]}).expect(400);
 });
 it('creates one group per branch and requires explicit current branch membership',async()=>{
  group=(await request(app.getHttpServer()).post('/chat/conversations').set('Authorization',auth(author)).send({type:'FAMILY_BRANCH',branchId:branch,title:'Fictional family group'}).expect(201)).body.id;
  const duplicate=await chat.create(author,{type:'FAMILY_BRANCH',branchId:branch,title:'Duplicate title'});expect(duplicate.id).toBe(group);
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).expect(404);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/join`).set('Authorization',auth(outsider)).expect(403);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/join`).set('Authorization',auth(reader)).expect(201);
 });
 it('deduplicates simultaneous sends and never trusts sender fields',async()=>{
  const body={content:'Fictional persisted message',clientMessageId:randomUUID()};
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).send({...body,senderUserId:author.id}).expect(400);
  const responses=await Promise.all(Array.from({length:6},()=>request(app.getHttpServer()).post(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).send(body).expect(201)));
  expect(new Set(responses.map(r=>r.body.id)).size).toBe(1);
  expect((await db.query('SELECT * FROM chat_messages WHERE conversation_id=$1',[group])).rows).toHaveLength(1);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).send({...body,content:'Changed replay'}).expect(409);
  message=(await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(author)).expect(200)).body[0];expect(message.senderUserId).toBe(reader.id);
 });
 it('keeps read receipts monotonic and denies forged/future acknowledgements',async()=>{
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/read`).set('Authorization',auth(outsider)).send({sequence:message.sequence}).expect(404);
  await request(app.getHttpServer()).post(`/chat/conversations/${group}/read`).set('Authorization',auth(author)).send({sequence:message.sequence+100}).expect(400);
  await chat.read(group,author,message.sequence);await chat.read(group,author,0);
  expect((await chat.messages(group,reader))[0].readByUserIds).toContain(author.id);
 });
 it('soft deletes only the sender message and preserves audit history',async()=>{
  await request(app.getHttpServer()).delete(`/chat/conversations/${group}/messages/${message.id}`).set('Authorization',auth(author)).expect(404);
  await request(app.getHttpServer()).delete(`/chat/conversations/${group}/messages/${message.id}`).set('Authorization',auth(reader)).expect(200);
  expect((await chat.messages(group,author))[0]).toMatchObject({id:message.id,content:'',isDeleted:true});
  expect((await db.query('SELECT message_text,deleted_at FROM chat_messages WHERE id=$1',[message.id])).rows[0].message_text).toBe('Fictional persisted message');
 });
 it('creates one direct conversation for the same verified profile pair and enforces blocks',async()=>{
  const ids=await Promise.all(Array.from({length:5},()=>chat.create(author,{type:'DIRECT',personId:reader.personId})));expect(new Set(ids.map(c=>c.id)).size).toBe(1);direct=ids[0].id;
  await chat.send(direct,author,{content:'Private fictional hello',clientMessageId:randomUUID()});
  await request(app.getHttpServer()).get(`/chat/conversations/${direct}/messages`).set('Authorization',auth(outsider)).expect(404);
  await chat.block(direct,reader);
  await expect(chat.send(direct,author,{content:'Blocked message',clientMessageId:randomUUID()})).rejects.toThrow('Direct messaging is blocked');
  await expect(chat.create(author,{type:'DIRECT',personId:reader.personId})).rejects.toThrow('Direct messaging is blocked');
 });
 it('streams durable messages and receipts over an authenticated WebSocket and denies nonmembers',async()=>{
  const url=`ws://127.0.0.1:${(app.getHttpServer().address() as any).port}/chat/socket`;
  function socket(token?:string){
   const ws=new WebSocket(url,{origin:'http://127.0.0.1:3002'}),queue:any[]=[];
   ws.on('message',data=>queue.push(JSON.parse(data.toString())));
   const opened=new Promise<void>((resolve,reject)=>{ws.once('open',()=>{if(token)ws.send(JSON.stringify({type:'auth',token}));resolve();});ws.once('error',reject);});
   async function frame(type:string,predicate=(f:any)=>true){
    const deadline=Date.now()+8000;
    while(Date.now()<deadline){const index=queue.findIndex(f=>f.type===type&&predicate(f));if(index>=0)return queue.splice(index,1)[0];await new Promise(r=>setTimeout(r,30));}
    throw new Error(`Expected socket ${type}`);
   }
   return {ws,opened,frame};
  }
  const anonymous=socket(),denied=socket(outsider.token),a=socket(author.token),b=socket(reader.token);
  try{
   await Promise.all([anonymous.opened,denied.opened,a.opened,b.opened]);
   const anonymousClosed=new Promise<number>(r=>anonymous.ws.once('close',r));anonymous.ws.send(JSON.stringify({type:'subscribe',conversationId:group}));expect(await anonymousClosed).toBe(4403);
   await denied.frame('authenticated');const deniedClosed=new Promise<number>(r=>denied.ws.once('close',r));denied.ws.send(JSON.stringify({type:'subscribe',conversationId:group}));expect(await deniedClosed).toBe(4403);
   await a.frame('authenticated');await b.frame('authenticated');
   a.ws.send(JSON.stringify({type:'subscribe',conversationId:group}));b.ws.send(JSON.stringify({type:'subscribe',conversationId:group}));
   await a.frame('snapshot');await b.frame('snapshot');
   const sent=await chat.send(group,reader,{content:'Live fictional WebSocket message',clientMessageId:randomUUID()});
   const update=await a.frame('snapshot',f=>f.messages.some((m:any)=>m.id===sent.id));expect(update.messages.find((m:any)=>m.id===sent.id).senderUserId).toBe(reader.id);
   a.ws.send(JSON.stringify({type:'read',sequence:sent.sequence}));
   await b.frame('snapshot',f=>f.messages.some((m:any)=>m.id===sent.id&&m.readByUserIds.includes(author.id)));
   a.ws.send(JSON.stringify({type:'typing'}));await b.frame('snapshot',f=>f.typingUserIds.includes(author.id));
   const revoked=new Promise<number>(r=>b.ws.once('close',r));await chat.leave(group,reader);expect(await revoked).toBe(4403);await chat.join(group,reader);
  }finally{for(const c of [anonymous,denied,a,b])c.ws.terminate();}
 },30000);
 it('does not make a protected child reachable through an administrator chat request',async()=>{
  await db.query('UPDATE persons SET birth_year_bs=2080 WHERE id=$1',[reader.personId]);
  try{await expect(chat.create(author,{type:'DIRECT',personId:reader.personId})).rejects.toThrow('unavailable for direct chat');}
  finally{await db.query('UPDATE persons SET birth_year_bs=2040 WHERE id=$1',[reader.personId]);}
 });
 it('revokes access after leaving, removing branch authority or revoking the session',async()=>{
  await chat.leave(group,reader);await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).expect(404);
  await chat.join(group,reader);
  await db.query('DELETE FROM user_roles WHERE user_id=$1',[reader.id]);
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages`).set('Authorization',auth(reader)).expect(403);
  await db.query('UPDATE user_sessions SET revoked_at=now() WHERE id=$1',[author.sessionId]);
  await request(app.getHttpServer()).get('/chat/conversations').set('Authorization',auth(author)).expect(401);
 });
});
