import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { NotificationInboxService } from '../src/modules/notifications/notification-inbox.service';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Private durable notification inbox (real PostgreSQL and HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,dispatcher:NotificationDispatcherService,inbox:NotificationInboxService;
 let owner:{id:string;token:string},other:{id:string;token:string};
 const auth=(u:{token:string})=>`Bearer ${u.token}`;
 const event=async(action:string,recipient:string,entityType='PROFILE_CLAIM',entityId=randomUUID())=>{
  return (await db.query(`INSERT INTO audit_outbox(action,entity_type,entity_id,actor_id,status,notification_status)
    VALUES($1,$2,$3,$4,'PENDING','PENDING') RETURNING *`, [action,entityType,entityId,recipient])).rows[0];
 };
 beforeAll(async()=>{
  iso=await createDisposableDatabase('inbox');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();
  app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);dispatcher=module.get(NotificationDispatcherService);
  inbox=module.get(NotificationInboxService);await assertDatabaseIsolation(db,iso.dbName);
  async function member(phone:string){
   const user=await module.get(UserRepository).findOrCreateByPhone(phone);
   const session=await module.get(SessionRepository).createSession({userId:user.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',
     ipAddress:'127.0.0.1',userAgent:'inbox-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:user.id,sid:session.id,phoneNumber:phone,tokenType:'access'},
     {secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:user.id,token};
  }
  owner=await member('+9779847391111');other=await member('+9779847391112');
  await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,false,false)',[owner.id]);
  await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,false,false)',[other.id]);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});

 it('requires a session, scopes entries to their owner and marks read durably across requests',async()=>{
  await request(app.getHttpServer()).get('/notifications').expect(401);
  const record=await event('CLAIM_SUBMIT',owner.id);
  expect(await dispatcher.processRecord(record)).toHaveLength(0); // external channels disabled
  await dispatcher.processRecord(record);
  const ownerPage=(await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(owner)).expect(200)).body;
  expect(ownerPage.items).toHaveLength(1);expect(ownerPage.unreadCount).toBe(1);
  expect(JSON.stringify(ownerPage)).not.toContain(record.entity_id); // no private claim IDs or evidence
  const id=ownerPage.items[0].id;
  await request(app.getHttpServer()).post(`/notifications/${id}/read`).set('Authorization',auth(other)).expect(404);
  const read=(await request(app.getHttpServer()).post(`/notifications/${id}/read`).set('Authorization',auth(owner)).expect(201)).body;
  const again=(await request(app.getHttpServer()).post(`/notifications/${id}/read`).set('Authorization',auth(owner)).expect(201)).body;
  expect(again.readAt).toBe(read.readAt);
  expect((await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(owner)).expect(200)).body.unreadCount).toBe(0);
  expect((await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(other)).expect(200)).body.items).toHaveLength(0);
 });

 it('uses independent preferences, stable cursor pagination and read-all without clearing history',async()=>{
  await request(app.getHttpServer()).patch('/notifications/preferences').set('Authorization',auth(owner))
    .send({chatEnabled:false,workflowEnabled:false}).expect(200);
  await dispatcher.processRecord(await event('CLAIM_SUBMIT',owner.id));
  expect((await inbox.list(owner.id)).items).toHaveLength(1);
  await request(app.getHttpServer()).patch('/notifications/preferences').set('Authorization',auth(owner))
    .send({workflowEnabled:true}).expect(200);
  await request(app.getHttpServer()).patch('/notifications/preferences').set('Authorization',auth(owner))
    .send({workflowEnabled:'no'}).expect(400);
  for(let i=0;i<3;i++)await dispatcher.processRecord(await event('CHANGE_REQUEST_SUBMIT',owner.id,'GENEALOGY_CHANGE_REQUEST'));
  const page1=(await request(app.getHttpServer()).get('/notifications?limit=2').set('Authorization',auth(owner)).expect(200)).body;
  expect(page1.items).toHaveLength(2);expect(page1.nextCursor).toBeTruthy();
  const page2=(await request(app.getHttpServer()).get(`/notifications?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)
    .set('Authorization',auth(owner)).expect(200)).body;
  expect(page2.items).toHaveLength(2);
  expect(new Set([...page1.items,...page2.items].map(n=>n.id)).size).toBe(4);
  await request(app.getHttpServer()).get('/notifications?limit=999').set('Authorization',auth(owner)).expect(400);
  await request(app.getHttpServer()).post('/notifications/read-all').set('Authorization',auth(owner)).expect(201);
  const rest=(await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(owner)).expect(200)).body;
  expect(rest.items).toHaveLength(4);expect(rest.unreadCount).toBe(0);
 });

 it('rechecks chat membership and blocks before displaying an old private notification',async()=>{
  await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'VERIFIED_MEMBER'),($2,'VERIFIED_MEMBER')",[owner.id,other.id]);
  await inbox.updatePreferences(owner.id,{chatEnabled:true});
  const conversation=(await db.query(`INSERT INTO chat_conversations(conversation_type,is_group,created_by,title)
    VALUES('DIRECT',false,$1,'Fictional direct chat') RETURNING id`,[other.id])).rows[0].id;
  await db.query('INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)',[conversation,owner.id,other.id]);
  const message=(await db.query('INSERT INTO chat_messages(conversation_id,sender_id,message_text) VALUES($1,$2,$3) RETURNING id',
    [conversation,other.id,'PRIVATE EVIDENCE MUST NOT APPEAR IN INBOX'])).rows[0].id;
  await dispatcher.processRecord(await event('CHAT_MESSAGE_CREATED',other.id,'chat_message',message));
  const page=(await inbox.list(owner.id)).items;
  const notice=page.find(n=>n.category==='CHAT');expect(notice).toBeDefined();
  expect(JSON.stringify(page)).not.toContain('PRIVATE EVIDENCE');
  expect(JSON.stringify(page)).not.toContain(message);
  await db.query('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES($1,$2)',[owner.id,other.id]);
  expect((await inbox.list(owner.id)).items.some(n=>n.id===notice!.id)).toBe(false);
  await request(app.getHttpServer()).post(`/notifications/${notice!.id}/read`).set('Authorization',auth(owner)).expect(404);
  await db.query('DELETE FROM chat_blocks WHERE blocker_id=$1 AND blocked_id=$2',[owner.id,other.id]);
  await db.query('UPDATE chat_participants SET left_at=NOW() WHERE conversation_id=$1 AND user_id=$2',[conversation,owner.id]);
  expect((await inbox.list(owner.id)).items.some(n=>n.id===notice!.id)).toBe(false);
 });

 it('keeps inbox history when an external gateway fails and revokes access with the account session',async()=>{
  await db.query('UPDATE notification_preferences SET push_enabled=true WHERE user_id=$1',[other.id]);
  const previous=process.env.ALLOW_SIMULATED_NOTIFICATIONS;delete process.env.ALLOW_SIMULATED_NOTIFICATIONS;
  try{
   const record=await event('CLAIM_APPROVED_AND_LINKED',other.id);
   const results=await dispatcher.processRecord(record);
   expect(results).toMatchObject([{channel:'PUSH',status:'FAILED'}]);
   const page=(await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(other)).expect(200)).body;
   expect(page.items).toHaveLength(1);expect(page.unreadCount).toBe(1);
   expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE outbox_id=$1',[record.id])).rows[0].delivery_status).toBe('FAILED');
   await db.query('UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1',[other.id]);
   await request(app.getHttpServer()).get('/notifications').set('Authorization',auth(other)).expect(401);
  }finally{if(previous===undefined)delete process.env.ALLOW_SIMULATED_NOTIFICATIONS;else process.env.ALLOW_SIMULATED_NOTIFICATIONS=previous;}
 });
});
