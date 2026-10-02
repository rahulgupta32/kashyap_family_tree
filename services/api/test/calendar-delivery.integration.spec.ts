import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { CalendarDeliveryService } from '../src/modules/calendar/calendar-delivery.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { NotificationInboxService } from '../src/modules/notifications/notification-inbox.service';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { EventAudienceScope, Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Versioned events, private invitations and durable reminder scheduling (PostgreSQL/HTTP)',()=>{
  let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,calendar:CalendarService,delivery:CalendarDeliveryService,
    dispatcher:NotificationDispatcherService,inbox:NotificationInboxService,audit:AuditOutboxRepository;
  let host:any,guest:any,other:any,branch:string,event:any;
  const auth=(user:any)=>({Authorization:`Bearer ${user.token}`});
  const scheduled=()=>({title:'Fictional private gathering',eventType:'GENERAL_EVENT',audienceScope:EventAudienceScope.INVITED_ONLY,
    startsAt:new Date(Date.now()+86400000*2).toISOString(),reminderOffsets:[60],invitedUserIds:[guest.id]});
  beforeAll(async()=>{
    iso=await createDisposableDatabase('calendar_delivery');await assertDatabaseIsolation(iso.client,iso.dbName);
    const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
    db=module.get(DatabaseService);calendar=module.get(CalendarService);delivery=module.get(CalendarDeliveryService);
    dispatcher=module.get(NotificationDispatcherService);inbox=module.get(NotificationInboxService);audit=module.get(AuditOutboxRepository);
    await assertDatabaseIsolation(db,iso.dbName);
    branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('CAL_DEL','परीक्षण','Fictional') RETURNING id")).rows[0].id;
    async function user(phone:string){
      const u=await module.get(UserRepository).findOrCreateByPhone(phone);
      const person=(await db.query("INSERT INTO persons(gender,living_status,generation,branch_id,birth_year_bs,is_claimed,claimed_user_id) VALUES('MALE','LIVING',3,$1,2040,true,$2) RETURNING id",[branch,u.id])).rows[0].id;
      await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Fictional','Invitee','Fictional Invitee',true)",[person]);
      await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person]);
      await module.get(UserRepository).assignRole(u.id,Role.VERIFIED_MEMBER,branch);
      await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,false,false)',[u.id]);
      const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'calendar-fixture',expiresAt:new Date(Date.now()+3600000)});
      const token=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
      return {id:u.id,token,personId:person,roles:[Role.VERIFIED_MEMBER],roleAssignments:[{role:Role.VERIFIED_MEMBER,branchId:branch}]};
    }
    host=await user('+9779847333331');guest=await user('+9779847333332');other=await user('+9779847333333');
  },60000);
  afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
  async function outbox(id:string,action='CALENDAR_EVENT_CREATED'){
    return (await db.query('SELECT * FROM audit_outbox WHERE entity_id=$1 AND action=$2 ORDER BY created_at DESC LIMIT 1',[id,action])).rows[0];
  }
  it('requires JWT and validates preview as all-or-nothing without exposing phones',async()=>{
    await request(app.getHttpServer()).post('/calendar/events/preview').send({invitedUserIds:[]}).expect(401);
    const preview=await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({invitedUserIds:[guest.id],audienceScope:'INVITED_ONLY'}).expect(201);
    expect(preview.body.recipientCount).toBe(1);expect(JSON.stringify(preview.body)).not.toContain('+977');
    await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({invitedUserIds:[guest.id,randomUUID()]}).expect(403);
    await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({invitedUserIds:[guest.id,guest.id]}).expect(400);
    await db.query("UPDATE persons SET profile_visibility='PRIVATE' WHERE id=$1",[guest.personId]);
    await request(app.getHttpServer()).post('/calendar/events/preview').set(auth(host)).send({invitedUserIds:[guest.id]}).expect(403);
    await db.query("UPDATE persons SET profile_visibility='VERIFIED_COMMUNITY' WHERE id=$1",[guest.personId]);
    const picker=await request(app.getHttpServer()).get('/calendar/invitees?q=Fictional').set(auth(host)).expect(200);
    expect(picker.body.some((r:any)=>r.userId===guest.id)).toBe(true);expect(JSON.stringify(picker.body)).not.toContain('+977');
  });
  it('creates the event, revision, recipient snapshot and future reminders atomically',async()=>{
    event=(await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(scheduled()).expect(201)).body;
    expect(event).toMatchObject({version:1,lifecycleState:'ACTIVE',canManage:true,reminderOffsets:[60]});
    expect((await db.query('SELECT * FROM calendar_event_revisions WHERE event_id=$1',[event.id])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM calendar_event_reminders WHERE event_id=$1',[event.id])).rows).toHaveLength(2);
    await dispatcher.processRecord(await outbox(event.id));
    expect((await inbox.list(guest.id)).items.some(n=>n.category==='EVENT')).toBe(true);
    expect((await inbox.list(other.id)).items).toHaveLength(0);
    await request(app.getHttpServer()).get(`/calendar/events/${event.id}`).set(auth(other)).expect(403);
  });
  it('restricts editing, rejects stale concurrent revisions and preserves full event history',async()=>{
    await request(app.getHttpServer()).patch(`/calendar/events/${event.id}`).set(auth(guest)).send({version:1,title:'Unauthorized'}).expect(403);
    const edits=await Promise.all(['First edit','Second edit'].map(title=>request(app.getHttpServer()).patch(`/calendar/events/${event.id}`).set(auth(host)).send({version:1,title})));
    expect(edits.map(r=>r.status).sort()).toEqual([200,409]);
    event=edits.find(r=>r.status===200)!.body;
    const history=(await request(app.getHttpServer()).get(`/calendar/events/${event.id}/history`).set(auth(host)).expect(200)).body;
    expect(history.map((r:any)=>r.version)).toEqual([2,1]);
    await request(app.getHttpServer()).get(`/calendar/events/${event.id}/history`).set(auth(guest)).expect(404);
    expect((await db.query("SELECT status FROM calendar_event_reminders WHERE event_id=$1 AND event_version=1",[event.id])).rows.every(r=>r.status==='CANCELLED')).toBe(true);
  });
  it('records RSVP counts for organizers without disclosing the recipient roster to invitees',async()=>{
    await request(app.getHttpServer()).post(`/calendar/events/${event.id}/rsvp`).set(auth(guest)).send({response:'GOING'}).expect(201);
    const hostDetail=(await request(app.getHttpServer()).get(`/calendar/events/${event.id}`).set(auth(host)).expect(200)).body;
    expect(hostDetail.rsvpCounts.going).toBe(1);
    const guestDetail=(await request(app.getHttpServer()).get(`/calendar/events/${event.id}`).set(auth(guest)).expect(200)).body;
    expect(guestDetail.rsvpCounts).toBeUndefined();expect(guestDetail.invitedUserIds).toBeUndefined();
    await request(app.getHttpServer()).post(`/calendar/events/${event.id}/rsvp`).set(auth(guest)).send({response:'INVALID'}).expect(400);
  });
  it('emits due reminders once under concurrent workers and survives worker reconstruction',async()=>{
    await db.query("UPDATE calendar_event_reminders SET due_at=NOW()-INTERVAL '1 minute' WHERE event_id=$1 AND status='PENDING'",[event.id]);
    const results=await Promise.all([delivery.emitDueReminders(),new CalendarDeliveryService(db,audit).emitDueReminders()]);
    expect(results.reduce((a,b)=>a+b,0)).toBe(2);
    expect(await delivery.emitDueReminders()).toBe(0);
    const notices=(await db.query("SELECT * FROM audit_outbox WHERE entity_id=$1 AND action='CALENDAR_EVENT_REMINDER_DUE'",[event.id])).rows;
    expect(notices).toHaveLength(2);
    for(const notice of notices)await dispatcher.processRecord(notice);
    expect((await inbox.list(guest.id)).items.filter(n=>n.action==='CALENDAR_EVENT_REMINDER_DUE')).toHaveLength(1);
  });
  it('rolls back a due job when writing audit intent fails, then retries successfully',async()=>{
    const fixture=await calendar.createEvent(host.id,scheduled());
    await db.query("UPDATE calendar_event_reminders SET due_at=NOW()-INTERVAL '1 minute' WHERE event_id=$1",[fixture.id]);
    const failure=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected audit write failure'));
    try{await expect(delivery.emitDueReminders()).rejects.toThrow('Injected');}finally{failure.mockRestore();}
    expect((await db.query("SELECT status FROM calendar_event_reminders WHERE event_id=$1",[fixture.id])).rows.every(r=>r.status==='PENDING')).toBe(true);
    expect(await delivery.emitDueReminders()).toBe(2);
  });
  it('declining cancels only that recipient’s reminders and suppresses queued reminder visibility',async()=>{
    await request(app.getHttpServer()).post(`/calendar/events/${event.id}/rsvp`).set(auth(guest)).send({response:'DECLINED'}).expect(201);
    expect((await inbox.list(guest.id)).items.some(n=>n.action==='CALENDAR_EVENT_REMINDER_DUE')).toBe(false);
    const fixture=await calendar.createEvent(host.id,scheduled());
    await calendar.rsvpEvent(fixture.id,guest.id,{response:'DECLINED'});
    expect((await db.query("SELECT status FROM calendar_event_reminders WHERE event_id=$1 AND recipient_user_id=$2",[fixture.id,guest.id])).rows.every(r=>r.status==='CANCELLED')).toBe(true);
    await calendar.rsvpEvent(fixture.id,guest.id,{response:'GOING'});
    expect((await db.query("SELECT status FROM calendar_event_reminders WHERE event_id=$1 AND recipient_user_id=$2",[fixture.id,guest.id])).rows.every(r=>r.status==='PENDING')).toBe(true);
  });
  it('revokes removed invitees across detail, old inbox history, reminders and failed deliveries',async()=>{
    const fixture=await calendar.createEvent(host.id,scheduled());const notice=await outbox(fixture.id);
    await dispatcher.processRecord(notice);
    const old=(await inbox.list(guest.id)).items.map(n=>n.id);
    await db.query('UPDATE notification_preferences SET sms_enabled=true WHERE user_id=$1',[guest.id]);
    const job=(await db.query(`INSERT INTO notification_dispatches(outbox_id,recipient_user_id,channel,event_type,payload,delivery_status)
      VALUES($1,$2,'SMS','CALENDAR_EVENT_CREATED',$3,'FAILED') RETURNING id`,[notice.id,guest.id,JSON.stringify({action:notice.action,entityId:fixture.id,outboxId:notice.id,message:'Generic'})])).rows[0].id;
    await calendar.updateEvent(fixture.id,host,{version:1,invitedUserIds:[]});
    await request(app.getHttpServer()).get(`/calendar/events/${fixture.id}`).set(auth(guest)).expect(403);
    const current=(await inbox.list(guest.id)).items;
    expect(current.filter(n=>old.includes(n.id)).length).toBeLessThan(old.length);
    await dispatcher.retryFailedDispatches();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[job])).rows[0].delivery_status).toBe('SKIPPED');
    await db.query('UPDATE notification_preferences SET sms_enabled=false WHERE user_id=$1',[guest.id]);
  });
  it('cancels events with version history and notifications; cancelled events reject RSVP',async()=>{
    const fixture=await calendar.createEvent(host.id,scheduled());
    await request(app.getHttpServer()).post(`/calendar/events/${fixture.id}/cancel`).set(auth(host)).send({version:1,reason:'Fixture is cancelled'}).expect(201);
    const cancellation=await outbox(fixture.id,'CALENDAR_EVENT_CANCELLED');await dispatcher.processRecord(cancellation);
    expect((await inbox.list(guest.id)).items.some(n=>n.action==='CALENDAR_EVENT_CANCELLED')).toBe(true);
    expect((await db.query("SELECT status FROM calendar_event_reminders WHERE event_id=$1",[fixture.id])).rows.every(r=>r.status==='CANCELLED')).toBe(true);
    await request(app.getHttpServer()).post(`/calendar/events/${fixture.id}/rsvp`).set(auth(guest)).send({response:'GOING'}).expect(409);
  });
  it('filters BS month and audience before limiting, rejects invalid filters and does not schedule invented Tithi',async()=>{
    const bs=await calendar.createEvent(host.id,{title:'Fictional BS event',eventType:'GENERAL_EVENT',audienceScope:EventAudienceScope.PRIVATE,solarDate:'2083-05-15'});
    expect((await calendar.listEvents(host,{yearBs:2083,monthBs:5,audienceScope:EventAudienceScope.PRIVATE})).some(e=>e.id===bs.id)).toBe(true);
    expect((await calendar.listEvents(host,{yearBs:2083,monthBs:6})).some(e=>e.id===bs.id)).toBe(false);
    await request(app.getHttpServer()).get('/calendar/events?monthBs=13').set(auth(host)).expect(400);
    await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({...scheduled(),solarDate:'2083-05-15'}).expect(400);
    await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({title:'No invented Tithi',eventType:'SHRADDHA',audienceScope:'COMMUNITY',tithiYearBs:2083,tithiMonthBs:1,tithiPaksha:'SHUKLA',tithiNumber:4,reminderOffsets:[60]}).expect(400);
  });
  it('keeps event creation atomic when durable audit intent fails',async()=>{
    const before=(await db.query('SELECT count(*) FROM calendar_events')).rows[0].count;
    const failure=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected event audit failure'));
    try{await expect(calendar.createEvent(host.id,scheduled())).rejects.toThrow('Injected');}finally{failure.mockRestore();}
    expect((await db.query('SELECT count(*) FROM calendar_events')).rows[0].count).toBe(before);
  });
});
