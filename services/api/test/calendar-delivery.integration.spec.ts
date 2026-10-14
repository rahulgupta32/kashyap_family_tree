import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { CalendarAudienceService } from '../src/modules/calendar/calendar-audience.service';
import { ApplicationSettingsService } from '../src/modules/application-settings/application-settings.service';
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
  it('recovers a lost create response across service reconstruction without duplicate effects',async()=>{
    const dto={...scheduled(),creationKey:randomUUID()};
    const first=await calendar.createEvent(host.id,dto);
    const restarted=new CalendarService(db,delivery,app.get(CalendarAudienceService),app.get(ApplicationSettingsService));
    const retry=await restarted.createEvent(host.id,dto);expect(retry.id).toBe(first.id);
    expect((await db.query('SELECT * FROM calendar_event_revisions WHERE event_id=$1',[first.id])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM event_invitations WHERE event_id=$1',[first.id])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM calendar_event_reminders WHERE event_id=$1',[first.id])).rows).toHaveLength(2);
    expect((await db.query("SELECT * FROM audit_outbox WHERE entity_id=$1 AND action='CALENDAR_EVENT_CREATED'",[first.id])).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM calendar_notification_recipients WHERE event_id=$1',[first.id])).rows).toHaveLength(2);
    await request(app.getHttpServer()).post('/calendar').set(auth(host)).send(dto).expect(201).expect(r=>expect(r.body.id).toBe(first.id));
  });
  it('isolates account identities and rejects a changed payload for an existing key',async()=>{
    const dto={...scheduled(),creationKey:randomUUID()};const first=await calendar.createEvent(host.id,dto);
    await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({...dto,title:'Changed'}).expect(409);
    const second=await calendar.createEvent(other.id,dto);expect(second.id).not.toBe(first.id);
    await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[host.id]);
    try{await expect(calendar.createEvent(host.id,dto)).rejects.toThrow('Active account');}
    finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[host.id]);}
  });
  it('serializes simultaneous matching retries and conflicting payloads in PostgreSQL',async()=>{
    const dto={...scheduled(),creationKey:randomUUID()};
    const matching=await Promise.all(Array.from({length:4},()=>calendar.createEvent(host.id,dto)));
    expect(new Set(matching.map(e=>e.id)).size).toBe(1);
    const key=randomUUID();const conflicting=await Promise.all(['One','Two'].map(title=>request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send({...dto,creationKey:key,title})));
    expect(conflicting.map(r=>r.status).sort()).toEqual([201,409]);
    expect((await db.query('SELECT * FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[host.id,key])).rows).toHaveLength(1);
  });
  it('rolls back the reservation, event, invitations, reminders and notice when intent writing fails',async()=>{
    const dto={...scheduled(),creationKey:randomUUID()};
    const before=(await db.query('SELECT count(*)::int AS n FROM calendar_events')).rows[0].n;
    const failure=jest.spyOn(delivery,'reschedule').mockRejectedValueOnce(new Error('Injected scheduling failure'));
    try{await expect(calendar.createEvent(host.id,dto)).rejects.toThrow('Injected');}finally{failure.mockRestore();}
    expect((await db.query('SELECT * FROM calendar_create_receipts WHERE creation_key=$1',[dto.creationKey])).rows).toHaveLength(0);
    expect((await db.query('SELECT count(*)::int AS n FROM calendar_events')).rows[0].n).toBe(before);
    const retry=await calendar.createEvent(host.id,dto);
    expect((await db.query('SELECT * FROM calendar_event_reminders WHERE event_id=$1',[retry.id])).rows).toHaveLength(2);
  });
  it('cannot commit an incomplete receipt or drop retained retry evidence',async()=>{
    const receipt=(await db.query('SELECT * FROM calendar_create_receipts LIMIT 1')).rows[0];
    await expect(db.query('DELETE FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[receipt.account_id,receipt.creation_key])).rejects.toThrow('immutable');
    await expect(db.query('UPDATE calendar_create_receipts SET event_id=NULL WHERE account_id=$1 AND creation_key=$2',[receipt.account_id,receipt.creation_key])).rejects.toThrow('immutable');
    await expect(db.transaction(async client=>{
      await client.query("INSERT INTO calendar_create_receipts(account_id,operation,creation_key,payload_hash) VALUES($1,'CREATE_EVENT',$2,$3)",[host.id,randomUUID(),'a'.repeat(64)]);
    })).rejects.toThrow('requires a committed event');
    const fs=require('fs'),path=require('path');
    await expect(db.transaction(async client=>{await client.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/059_calendar_create_receipts.down.sql'),'utf8'));})).rejects.toThrow('CALENDAR_CREATE_RECEIPTS_RETAINED');
  });
  it('closes a rejected unused key permanently without any event or delivery effects',async()=>{
    const dto={...scheduled(),creationKey:randomUUID(),title:''};
    await request(app.getHttpServer()).post('/calendar/events').set(auth(host)).send(dto).expect(400);
    const before=(await db.query('SELECT count(*)::int AS n FROM calendar_events')).rows[0].n;
    await request(app.getHttpServer()).post('/calendar/events/creation-resolution').send(dto).expect(401);
    const close=await request(app.getHttpServer()).post('/calendar/events/creation-resolution').set(auth(host)).send(dto).expect(201);
    expect(close.headers['cache-control']).toBe('private, no-store');expect(close.body).toEqual({outcome:'ABANDONED'});
    expect(await calendar.resolveCreation(host.id,dto)).toEqual({outcome:'ABANDONED'});
    await expect(calendar.createEvent(host.id,dto)).rejects.toThrow('permanently closed');
    expect((await db.query('SELECT count(*)::int AS n FROM calendar_events')).rows[0].n).toBe(before);
    const row=(await db.query('SELECT * FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[host.id,dto.creationKey])).rows[0];
    expect(row).toMatchObject({abandoned:true,event_id:null});
    expect((await db.query("SELECT * FROM audit_outbox WHERE entity_id=$1 AND actor_id=$2 AND action='CALENDAR_CREATE_ABANDONED'",[dto.creationKey,host.id])).rows).toHaveLength(1);
    await expect(db.query('UPDATE calendar_create_receipts SET abandoned=FALSE WHERE account_id=$1 AND creation_key=$2',[host.id,dto.creationKey])).rejects.toThrow('immutable');
    await expect(db.query('DELETE FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[host.id,dto.creationKey])).rejects.toThrow('immutable');
  });
  it('recovers an already committed event without modifying its content, invitations or notices',async()=>{
    const dto={...scheduled(),creationKey:randomUUID()};const created=await calendar.createEvent(host.id,dto);
    expect(await calendar.resolveCreation(host.id,{creationKey:dto.creationKey} as any)).toEqual({outcome:'CREATED',eventId:created.id});
    expect(await calendar.resolveCreation(host.id,dto)).toEqual({outcome:'CREATED',eventId:created.id});
    await expect(calendar.resolveCreation(host.id,{...dto,title:'different'})).rejects.toThrow('another payload');
    expect((await db.query('SELECT * FROM calendar_event_revisions WHERE event_id=$1',[created.id])).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM audit_outbox WHERE entity_id=$1 AND action='CALENDAR_EVENT_CREATED'",[created.id])).rows).toHaveLength(1);
    await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[host.id]);
    try{await expect(calendar.resolveCreation(host.id,dto)).rejects.toThrow('Active account');}
    finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[host.id]);}
    const isolated=await calendar.resolveCreation(other.id,{creationKey:dto.creationKey} as any);expect(isolated).toEqual({outcome:'ABANDONED'});
    expect((await calendar.createEvent(host.id,dto)).id).toBe(created.id);
  });
  it('serializes resolution against an in-flight create so no event can appear after ABANDONED',async()=>{
    for(let n=0;n<4;n++){
      const dto={...scheduled(),creationKey:randomUUID()};
      const [created,resolved]=await Promise.allSettled([calendar.createEvent(host.id,dto),calendar.resolveCreation(host.id,dto)]);
      expect(resolved.status).toBe('fulfilled');if(resolved.status!=='fulfilled')throw new Error('resolution failed');
      if(resolved.value.outcome==='CREATED'){
        expect(created.status).toBe('fulfilled');if(created.status==='fulfilled')expect(created.value.id).toBe(resolved.value.eventId);
      }else{
        expect(created.status).toBe('rejected');await expect(calendar.createEvent(host.id,dto)).rejects.toThrow('permanently closed');
      }
      const receipt=(await db.query('SELECT * FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[host.id,dto.creationKey])).rows[0];
      expect(Boolean(receipt.event_id)).toBe(!receipt.abandoned);
    }
  });
  it('rolls back an uncommitted close and preserves abandoned evidence on downgrade',async()=>{
    const key=randomUUID();
    const failure=jest.spyOn(delivery,'recordCreationClosure').mockRejectedValueOnce(new Error('Injected closure audit failure'));
    try{await expect(calendar.resolveCreation(host.id,{creationKey:key})).rejects.toThrow('Injected');}finally{failure.mockRestore();}
    expect((await db.query('SELECT * FROM calendar_create_receipts WHERE account_id=$1 AND creation_key=$2',[host.id,key])).rows).toHaveLength(0);
    await expect(db.transaction(async client=>{
      await client.query("INSERT INTO calendar_create_receipts(account_id,operation,creation_key,payload_hash,abandoned) VALUES($1,'CREATE_EVENT',$2,$3,TRUE)",[host.id,key,'a'.repeat(64)]);
      throw new Error('Injected close rollback');
    })).rejects.toThrow('Injected');
    const created=await calendar.createEvent(host.id,{...scheduled(),creationKey:key});expect(created.id).toBeTruthy();
    const fs=require('fs'),path=require('path');
    await expect(db.transaction(async client=>{await client.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/060_calendar_create_resolution.down.sql'),'utf8'));})).rejects.toThrow('CALENDAR_ABANDONED_KEYS_RETAINED');
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
  it('browses beyond 100 events with nonoverlapping exact cursors and current private invitation checks',async()=>{
    const seeded=(await db.query(`INSERT INTO calendar_events(title,event_type,date_bs,host_user_id,audience_scope)
      SELECT 'Paged fictional calendar '||n,'GENERAL_EVENT','2083-05-15',$1,'COMMUNITY' FROM generate_series(1,105) n RETURNING id`,[host.id])).rows.map((r:any)=>r.id);
    const hidden=(await db.query("INSERT INTO calendar_events(title,event_type,date_bs,host_user_id,audience_scope) VALUES('Hidden pagination fixture','GENERAL_EVENT','2083-05-15',$1,'INVITED_ONLY') RETURNING id",[host.id])).rows[0].id;
    const first=(await request(app.getHttpServer()).get('/calendar/browse?yearBs=2083&monthBs=5').set(auth(guest)).expect(200)).body;
    expect(first.items).toHaveLength(50);expect(typeof first.nextBefore).toBe('string');
    const seen=new Set(first.items.map((e:any)=>e.id));let cursor=first.nextBefore;
    await db.query("INSERT INTO calendar_events(title,event_type,date_bs,host_user_id,audience_scope) VALUES('Concurrent new calendar event','GENERAL_EVENT','2083-05-15',$1,'COMMUNITY')",[host.id]);
    while(cursor){const page=(await request(app.getHttpServer()).get(`/calendar/browse?yearBs=2083&monthBs=5&before=${cursor}`).set(auth(guest)).expect(200)).body;
      expect(page.items.length).toBeLessThanOrEqual(50);for(const item of page.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);}cursor=page.nextBefore;}
    expect(seeded.every((id:string)=>seen.has(id))).toBe(true);expect(seen.has(hidden)).toBe(false);
    await db.query('INSERT INTO event_invitations(event_id,invited_user_id) VALUES($1,$2)',[hidden,guest.id]);
    expect((await request(app.getHttpServer()).get('/calendar/browse').set(auth(guest)).expect(200)).body.items.some((e:any)=>e.id===hidden)).toBe(true);
    await db.query('UPDATE event_invitations SET revoked_at=now() WHERE event_id=$1',[hidden]);
    expect((await request(app.getHttpServer()).get('/calendar/browse').set(auth(guest)).expect(200)).body.items.some((e:any)=>e.id===hidden)).toBe(false);
    expect((await request(app.getHttpServer()).get('/calendar/browse').set(auth(host)).expect(200)).body.items.some((e:any)=>e.id===hidden)).toBe(true);
    await request(app.getHttpServer()).get('/calendar/browse').expect(401);
    for(const cursor of ['0','-1','1.5','9223372036854775808',''])await request(app.getHttpServer()).get(`/calendar/browse?before=${cursor}`).set(auth(guest)).expect(400);
  });
  it('filters source BS metadata without changing event dates or inventing AD/Tithi conversions',async()=>{
    const ad=await calendar.createEvent(host.id,{...scheduled(),audienceScope:EventAudienceScope.COMMUNITY,invitedUserIds:[]});
    const tithi=await calendar.createEvent(host.id,{title:'Unconverted Tithi browse fixture',eventType:'GENERAL_EVENT',audienceScope:EventAudienceScope.COMMUNITY,tithiYearBs:2083,tithiMonthBs:5,tithiPaksha:'SHUKLA',tithiNumber:4} as any);
    const before=(await db.query('SELECT version,provenance,starts_at FROM calendar_events WHERE id=$1',[ad.id])).rows[0];
    const filtered=(await request(app.getHttpServer()).get('/calendar/browse?yearBs=2083&monthBs=5').set(auth(guest)).expect(200)).body.items;
    expect(filtered.some((e:any)=>e.id===ad.id)).toBe(false);expect(filtered.find((e:any)=>e.id===tithi.id)).toMatchObject({startsAt:null,solarDate:null,tithiYearBs:2083,tithiMonthBs:5});
    expect((await db.query('SELECT version,provenance,starts_at FROM calendar_events WHERE id=$1',[ad.id])).rows[0]).toEqual(before);
    for(const query of ['yearBs=1999','yearBs=2091','monthBs=13','monthBs=1.5','audienceScope=FAKE','branchId=garbage'])await request(app.getHttpServer()).get(`/calendar/browse?${query}`).set(auth(guest)).expect(400);
  });

  it('selects Gregorian days at Nepal midnight and keeps inaccessible events out of day counts',async()=>{
    async function seed(title:string,instant:string,scope='COMMUNITY'){
      return (await db.query('INSERT INTO calendar_events(title,event_type,host_user_id,audience_scope,starts_at,provenance) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[title,'GENERAL_EVENT',host.id,scope,instant,JSON.stringify({source:'ORGANIZER_SUPPLIED_AD'})])).rows[0].id;
    }
    const start=await seed('Nepal midnight fixture','2026-10-05T18:15:00Z');
    const previous=await seed('Previous Nepal day','2026-10-05T18:14:59Z');
    const next=await seed('Next Nepal day','2026-10-06T18:15:00Z');
    const hidden=await seed('Private Nepal period','2026-10-06T04:00:00Z','INVITED_ONLY');
    const query='/calendar/period?source=AD&view=DAY&date=2026-10-06';
    const day=(await request(app.getHttpServer()).get(query).set(auth(guest)).expect(200)).body;
    expect(day.items.find((e:any)=>e.id===start)).toMatchObject({displayDate:'2026-10-06',startsAt:'2026-10-05T18:15:00.000Z'});
    expect(day.items.some((e:any)=>[previous,next,hidden].includes(e.id))).toBe(false);
    expect(day.days[0].count).toBe(day.items.length);
    await db.query('INSERT INTO event_invitations(event_id,invited_user_id) VALUES($1,$2)',[hidden,guest.id]);
    const invited=(await request(app.getHttpServer()).get(query).set(auth(guest)).expect(200)).body;
    expect(invited.days[0].count).toBe(day.days[0].count+1);
    await db.query('UPDATE event_invitations SET revoked_at=now() WHERE event_id=$1',[hidden]);
    expect((await request(app.getHttpServer()).get(query).set(auth(guest)).expect(200)).body.days[0].count).toBe(day.days[0].count);
    await request(app.getHttpServer()).get(query).expect(401);
  });
  it('counts the whole BS month and paginates ordered agenda including unconverted Tithi',async()=>{
    const query='/calendar/period?source=BS&view=AGENDA&date=2083-05-15';
    const first=(await request(app.getHttpServer()).get(query).set(auth(guest)).expect(200)).body;
    expect(first.items).toHaveLength(50);expect(first.days.find((d:any)=>d.date==='2083-05-15').count).toBeGreaterThanOrEqual(105);
    expect(first.undatedCount).toBeGreaterThan(0);
    const seen=new Set(first.items.map((e:any)=>e.id));let cursor=first.nextBefore,undated=false;
    while(cursor){const page=(await request(app.getHttpServer()).get(`${query}&before=${encodeURIComponent(cursor)}`).set(auth(guest)).expect(200)).body;
      for(const item of page.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);if(item.displayDate===null)undated=true;}cursor=page.nextBefore;}
    expect(undated).toBe(true);
    const day=(await request(app.getHttpServer()).get('/calendar/period?source=BS&view=DAY&date=2083-05-15').set(auth(guest)).expect(200)).body;
    expect(day.undatedCount).toBe(0);expect(day.items.every((e:any)=>e.displayDate==='2083-05-15')).toBe(true);
    for(const query of ['source=AD&view=DAY&date=2026-02-30','source=BS&view=DAY&date=2091-01-01','source=TITHI&view=DAY&date=2083-05-15','source=BS&view=MONTH&date=2083-05-15&before=2083-06-01%7C1'])await request(app.getHttpServer()).get(`/calendar/period?${query}`).set(auth(guest)).expect(400);
  });

});
