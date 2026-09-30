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
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Governed broadcast notices (disposable PostgreSQL and HTTP)', () => {
  let iso: DisposableDatabase, app: INestApplication, db: DatabaseService, dispatcher: NotificationDispatcherService;
  let admin: {id:string;token:string}, branchAdmin: {id:string;token:string};
  let memberA: {id:string;token:string}, memberB: {id:string;token:string}, otherGen: {id:string;token:string};
  let branchA: string, branchB: string;
  const header = (u:{token:string}) => `Bearer ${u.token}`;
  const send = (u:{token:string}, data:any) => request(app.getHttpServer()).post('/notifications/broadcasts')
    .set('Authorization',header(u)).send(data);

  beforeAll(async () => {
    iso = await createDisposableDatabase('broadcast');
    await assertDatabaseIsolation(iso.client, iso.dbName);
    const module = await Test.createTestingModule({imports:[AppModule]}).compile();
    app = module.createNestApplication();await app.init();
    db = module.get(DatabaseService);dispatcher = module.get(NotificationDispatcherService);
    await assertDatabaseIsolation(db, iso.dbName);
    branchA = (await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('NOT_A','काल्पनिक अ','Fictional A') RETURNING id")).rows[0].id;
    branchB = (await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('NOT_B','काल्पनिक ब','Fictional B') RETURNING id")).rows[0].id;
    async function account(phone:string,role:string,branch?:string,generation?:number){
      const u = await module.get(UserRepository).findOrCreateByPhone(phone);
      const session = await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),
        devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'broadcast-fixture',expiresAt:new Date(Date.now()+3600000)});
      const token = module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},
        {secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
      await db.query('INSERT INTO user_roles(user_id,role,branch_id) VALUES($1,$2,$3)',[u.id,role,branch??null]);
      await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,false,false)',[u.id]);
      if(branch&&generation){
        const person=(await db.query("INSERT INTO persons(branch_id,generation,gender,living_status) VALUES($1,$2,'UNKNOWN','LIVING') RETURNING id",
          [branch,generation])).rows[0].id;
        await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person]);
      }
      return {id:u.id,token};
    }
    admin=await account('+9779847395511','SUPER_ADMIN');
    branchAdmin=await account('+9779847395512','BRANCH_ADMIN',branchA);
    memberA=await account('+9779847395513','VERIFIED_MEMBER',branchA,3);
    memberB=await account('+9779847395514','VERIFIED_MEMBER',branchB,3);
    otherGen=await account('+9779847395515','VERIFIED_MEMBER',branchA,4);
  },60000);
  afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});

  it('authorizes scope before preview and send, snapshots exactly the intended branch audience, and audits a replay once',async()=>{
    await request(app.getHttpServer()).post('/notifications/broadcasts').send({scope:'ALL'}).expect(401);
    const payload={requestId:randomUUID(),title:'Fictional branch notice',body:'Fictional family meeting on Saturday',scope:'BRANCH',branchId:branchA};
    await send(memberA,payload).expect(403);
    await send(branchAdmin,{...payload,scope:'ALL',branchId:undefined}).expect(403);
    await send(branchAdmin,{...payload,branchId:branchB}).expect(403);
    await send(branchAdmin,{...payload,scope:'GENERATION',branchId:undefined,generation:3}).expect(403);
    const preview=(await request(app.getHttpServer()).post('/notifications/broadcasts/preview')
      .set('Authorization',header(branchAdmin)).send({scope:'BRANCH',branchId:branchA}).expect(201)).body;
    expect(preview.recipientCount).toBeGreaterThanOrEqual(3); // branch administrator and two claimed members
    const created=(await send(branchAdmin,payload).expect(201)).body;
    expect(created.recipientCount).toBe(preview.recipientCount);expect(created.alreadySent).toBe(false);
    expect((await send(branchAdmin,payload).expect(201)).body).toMatchObject({id:created.id,alreadySent:true,recipientCount:created.recipientCount});
    await send(branchAdmin,{...payload,body:'Different notice under the same request ID'}).expect(409);
    const audits=await db.query("SELECT * FROM audit_outbox WHERE entity_type='NOTIFICATION_BROADCAST' AND entity_id=$1",[created.id]);
    expect(audits.rows).toHaveLength(1);
    expect(JSON.stringify(audits.rows[0].new_value)).not.toContain(payload.body);
    const record=audits.rows[0];
    await dispatcher.processRecord(record);await dispatcher.processRecord(record);
    const rows=await db.query('SELECT recipient_user_id,message FROM notification_inbox WHERE outbox_id=$1',[record.id]);
    expect(rows.rows).toHaveLength(created.recipientCount);
    const ids=rows.rows.map(r=>r.recipient_user_id);
    for(const expected of [branchAdmin.id,memberA.id,otherGen.id])expect(ids).toContain(expected);
    expect(ids).not.toContain(memberB.id);
    expect(JSON.stringify(rows.rows)).not.toContain(payload.body);
    const inbox=(await request(app.getHttpServer()).get('/notifications').set('Authorization',header(memberA)).expect(200)).body;
    expect(inbox.items.find((n:any)=>n.action==='NOTIFICATION_BROADCAST_CREATED')).toMatchObject({destination:'/broadcasts',category:'BROADCAST'});
    const detail=(await request(app.getHttpServer()).get(`/notifications/broadcasts/${created.id}`)
      .set('Authorization',header(memberA)).expect(200)).body;
    expect(detail.body).toBe(payload.body);
    await request(app.getHttpServer()).get(`/notifications/broadcasts/${created.id}`).set('Authorization',header(memberB)).expect(404);
    await request(app.getHttpServer()).get('/notifications/broadcasts').set('Authorization',header(memberB)).expect(200)
      .then(res=>expect(res.body).toHaveLength(0));
  });

  it('limits generations to the current branch authority and withdraws old inbox/detail access on role revocation',async()=>{
    const generated={requestId:randomUUID(),title:'Fictional generation notice',body:'Fictional generation invitation',
      scope:'GENERATION',generation:3,branchId:branchA};
    const created=(await send(branchAdmin,generated).expect(201)).body;
    expect(created.recipientCount).toBeGreaterThanOrEqual(1); // memberA; branchAdmin has no linked person
    const record=(await db.query('SELECT * FROM audit_outbox WHERE entity_id=$1',[created.id])).rows[0];
    await dispatcher.processRecord(record);
    const page=(await request(app.getHttpServer()).get('/notifications').set('Authorization',header(memberA)).expect(200)).body;
    const notice=page.items.find((n:any)=>n.action==='NOTIFICATION_BROADCAST_CREATED');
    expect(notice).toBeTruthy();
    await db.query('DELETE FROM user_roles WHERE user_id=$1 AND role=$2',[memberA.id,'VERIFIED_MEMBER']);
    await request(app.getHttpServer()).get(`/notifications/broadcasts/${created.id}`).set('Authorization',header(memberA)).expect(403);
    expect((await request(app.getHttpServer()).get('/notifications').set('Authorization',header(memberA)).expect(200)).body.items).toEqual([]);
    await request(app.getHttpServer()).post(`/notifications/${notice.id}/read`).set('Authorization',header(memberA)).expect(404);
    expect((await request(app.getHttpServer()).get(`/notifications/broadcasts/${created.id}`)
      .set('Authorization',header(branchAdmin)).expect(200)).body.title).toBe(generated.title);
    await send(branchAdmin,{...generated,requestId:randomUUID(),branchId:branchB}).expect(403);
    await send(admin,{...generated,requestId:randomUUID(),branchId:undefined}).expect(201);
  });
});
