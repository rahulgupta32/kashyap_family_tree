import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { SparrowSmsProviderAdapter } from '../src/modules/auth/sms/sparrow-sms-provider.adapter';
import { DatabaseService } from '../src/database/database.service';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Delivery preferences and revoked chat access (real PostgreSQL)', () => {
  let iso: DisposableDatabase, db: DatabaseService, dispatcher: NotificationDispatcherService;
  let sender: string, recipient: string, conversation: string, message: string;
  const sms = { sendOtp: jest.fn(), sendNotification: jest.fn(async (_phone: string, _message: string) => ({ success: true, provider: 'TestSmsProviderAdapter', simulated: true })) };

  beforeAll(async () => {
    iso = await createDisposableDatabase('delivery_policy');
    await assertDatabaseIsolation(iso.client, iso.dbName);
    db = new DatabaseService(); await db.onModuleInit();
    await assertDatabaseIsolation(db, iso.dbName);
    dispatcher = new NotificationDispatcherService(db, sms as any);
    sender = (await db.query("INSERT INTO user_accounts(phone_number) VALUES('+9779847312221') RETURNING id")).rows[0].id;
    recipient = (await db.query("INSERT INTO user_accounts(phone_number) VALUES('+9779847312222') RETURNING id")).rows[0].id;
    await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'VERIFIED_MEMBER'),($2,'VERIFIED_MEMBER')", [sender, recipient]);
    await db.query('INSERT INTO notification_preferences(user_id,push_enabled,sms_enabled,email_enabled) VALUES($1,false,true,false)', [recipient]);
    conversation = (await db.query("INSERT INTO chat_conversations(conversation_type,is_group,created_by) VALUES('DIRECT',false,$1) RETURNING id", [sender])).rows[0].id;
    await db.query('INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2),($1,$3)', [conversation, sender, recipient]);
    message = (await db.query("INSERT INTO chat_messages(conversation_id,sender_id,message_text) VALUES($1,$2,'Private fixture') RETURNING id", [conversation, sender])).rows[0].id;
  }, 60000);
  afterAll(async () => { if (db) await db.onModuleDestroy(); if (iso) await iso.drop(); });
  beforeEach(async () => {
    sms.sendNotification.mockClear(); sms.sendOtp.mockClear();
    await db.query('UPDATE notification_preferences SET push_enabled=false,sms_enabled=true,workflow_enabled=true,chat_enabled=true,family_events_enabled=true WHERE user_id=$1', [recipient]);
    await db.query('UPDATE user_accounts SET is_suspended=false WHERE id=$1', [recipient]);
    await db.query('UPDATE chat_participants SET left_at=NULL WHERE conversation_id=$1 AND user_id=$2', [conversation, recipient]);
    await db.query('UPDATE chat_messages SET deleted_at=NULL WHERE id=$1', [message]);
    await db.query('DELETE FROM chat_blocks');
    await db.query('DELETE FROM notification_dispatches');
    await db.query("INSERT INTO user_roles(user_id,role) SELECT $1,'VERIFIED_MEMBER' WHERE NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='VERIFIED_MEMBER')", [recipient]);
  });
  async function record(action = 'CHAT_MESSAGE_CREATED') {
    return (await db.query(`INSERT INTO audit_outbox(action,entity_type,entity_id,actor_id)
      VALUES($1,'chat_message',$2,$3) RETURNING *`, [action, message, action === 'CHAT_MESSAGE_CREATED' ? sender : recipient])).rows[0];
  }
  async function failedJob() {
    const entry = await record();
    return (await db.query(`INSERT INTO notification_dispatches(outbox_id,recipient_user_id,channel,event_type,payload,delivery_status)
      VALUES($1,$2,'SMS',$3,$4,'FAILED') RETURNING id`, [entry.id,recipient,entry.action,JSON.stringify({action:entry.action,entityId:message,message:'Generic alert'})])).rows[0].id;
  }
  it('delivers one permitted alert and deduplicates a replay', async () => {
    const entry = await record();
    expect(await dispatcher.processRecord(entry)).toMatchObject([{status:'SIMULATED',channel:'SMS'}]);
    await dispatcher.processRecord(entry);
    expect(sms.sendNotification).toHaveBeenCalledTimes(1);
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendNotification.mock.calls[0][1]).not.toContain('Private fixture');
  });
  it.each([
    ['CHAT_MESSAGE_CREATED','chat_enabled'],
    ['CLAIM_APPROVED_AND_LINKED','workflow_enabled'],
    ['CALENDAR_EVENT_CREATED','family_events_enabled'],
  ])('creates no external job for disabled %s', async (action, column) => {
    // Column names come only from these fixed test cases.
    await db.query(`UPDATE notification_preferences SET ${column}=false WHERE user_id=$1`, [recipient]);
    expect(await dispatcher.processRecord(await record(action))).toEqual([]);
    expect(sms.sendNotification).not.toHaveBeenCalled();
  });
  it.each(['block','leave','delete','role','suspend','category','channel'])('skips retry after %s', async reason => {
    const job = await failedJob();
    if(reason==='block')await db.query('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES($1,$2)',[recipient,sender]);
    if(reason==='leave')await db.query('UPDATE chat_participants SET left_at=NOW() WHERE conversation_id=$1 AND user_id=$2',[conversation,recipient]);
    if(reason==='delete')await db.query('UPDATE chat_messages SET deleted_at=NOW() WHERE id=$1',[message]);
    if(reason==='role')await db.query('DELETE FROM user_roles WHERE user_id=$1',[recipient]);
    if(reason==='suspend')await db.query('UPDATE user_accounts SET is_suspended=true WHERE id=$1',[recipient]);
    if(reason==='category')await db.query('UPDATE notification_preferences SET chat_enabled=false WHERE user_id=$1',[recipient]);
    if(reason==='channel')await db.query('UPDATE notification_preferences SET sms_enabled=false WHERE user_id=$1',[recipient]);
    await dispatcher.retryFailedDispatches();
    expect(sms.sendNotification).not.toHaveBeenCalled();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[job])).rows[0].delivery_status).toBe('SKIPPED');
  });
  it('applies the same permission check when recovering an expired lease',async()=>{
    const job=await failedJob();
    await db.query("UPDATE notification_dispatches SET delivery_status='PROCESSING',lease_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[job]);
    await db.query('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES($1,$2)',[sender,recipient]);
    await dispatcher.recoverStrandedJobs();
    expect(sms.sendNotification).not.toHaveBeenCalled();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[job])).rows[0].delivery_status).toBe('SKIPPED');
  });
  it.each(['initial','retry','stranded'])('stores only redacted metadata after %s provider failure', async path => {
    const secret = 'fictional-private-phone-otp-provider-token\nforged-log';
    sms.sendNotification.mockRejectedValueOnce(new Error(secret));
    let job: string;
    if (path === 'initial') {
      const result = await dispatcher.processRecord(await record());
      expect(result).toMatchObject([{status:'FAILED',error:'NOTIFICATION_DELIVERY_UNAVAILABLE'}]);
      job = (await db.query('SELECT id FROM notification_dispatches WHERE recipient_user_id=$1',[recipient])).rows[0].id;
    } else {
      job = await failedJob();
      if (path === 'stranded') {
        await db.query("UPDATE notification_dispatches SET delivery_status='PROCESSING',lease_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[job]);
        await dispatcher.recoverStrandedJobs();
      } else await dispatcher.retryFailedDispatches();
    }
    const stored = (await db.query('SELECT delivery_status,retry_count,error_message,provider_response,worker_id,lease_expires_at,next_retry_at FROM notification_dispatches WHERE id=$1',[job])).rows[0];
    expect(stored).toMatchObject({delivery_status:'FAILED',retry_count:1,error_message:'NOTIFICATION_DELIVERY_UNAVAILABLE'});
    expect(JSON.stringify(stored)).not.toContain(secret);
    if (path !== 'initial') {
      expect(stored.worker_id).toBeNull(); expect(stored.lease_expires_at).toBeNull(); expect(stored.next_retry_at).toBeTruthy();
    }
    if (path === 'retry') expect(stored.provider_response.error).toBe('NOTIFICATION_DELIVERY_UNAVAILABLE');
    expect(sms.sendNotification).toHaveBeenCalledTimes(1);
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it.each(['initial','retry','stranded'])('preserves a concurrently reconciled push outcome after stale %s completion',async path=>{
    const previous=process.env.PUSH_PROVIDER;process.env.PUSH_PROVIDER='fcm';
    await db.query('UPDATE notification_preferences SET push_enabled=true,sms_enabled=false WHERE user_id=$1',[recipient]);
    const confirmed={provider:'FCM',reconciled:true,acceptanceOnly:true};
    const push={send:jest.fn(async(_userId:string,id:string)=>{
      // Reconciliation may commit while a prior worker is still waiting to finish.
      await db.query(`UPDATE notification_dispatches SET delivery_status='SENT',provider_response=$2,
        worker_id=NULL,lease_expires_at=NULL WHERE id=$1`,[id,JSON.stringify(confirmed)]);
      return {status:'RECONCILIATION_REQUIRED',unresolvedDevices:1};
    })};
    const worker=new NotificationDispatcherService(db,sms as any,undefined,undefined,undefined,push as any);
    try {
      const entry=await record();
      let id:string;
      if(path==='initial'){
        expect(await worker.processRecord(entry)).toMatchObject([{channel:'PUSH',status:'SENT'}]);
        id=(await db.query('SELECT id FROM notification_dispatches WHERE outbox_id=$1',[entry.id])).rows[0].id;
      } else {
        id=(await db.query(`INSERT INTO notification_dispatches(outbox_id,recipient_user_id,channel,event_type,payload,delivery_status,lease_expires_at)
          VALUES($1,$2,'PUSH',$3,$4,$5,$6) RETURNING id`,[entry.id,recipient,entry.action,
          JSON.stringify({action:entry.action,entityId:message,message:'Generic alert'}),
          path==='retry'?'FAILED':'PROCESSING',path==='retry'?null:new Date(Date.now()-60000)])).rows[0].id;
        expect(path==='retry'?await worker.retryFailedDispatches():await worker.recoverStrandedJobs()).toBe(0);
      }
      expect(push.send).toHaveBeenCalledTimes(1);
      expect((await db.query('SELECT delivery_status,provider_response,worker_id,lease_expires_at FROM notification_dispatches WHERE id=$1',[id])).rows[0])
        .toMatchObject({delivery_status:'SENT',provider_response:confirmed,worker_id:null,lease_expires_at:null});
    } finally {if(previous===undefined)delete process.env.PUSH_PROVIDER;else process.env.PUSH_PROVIDER=previous;}
  });

  it.each(['retry','stranded'])('does not let a %s worker overwrite a replacement lease',async path=>{
    const previous=process.env.PUSH_PROVIDER;process.env.PUSH_PROVIDER='fcm';
    await db.query('UPDATE notification_preferences SET push_enabled=true,sms_enabled=false WHERE user_id=$1',[recipient]);
    const entry=await record();
    const job=(await db.query(`INSERT INTO notification_dispatches(outbox_id,recipient_user_id,channel,event_type,payload,delivery_status,lease_expires_at)
      VALUES($1,$2,'PUSH',$3,$4,$5,$6) RETURNING id`,[entry.id,recipient,entry.action,
      JSON.stringify({action:entry.action,entityId:message,message:'Generic alert'}),
      path==='retry'?'FAILED':'PROCESSING',path==='retry'?null:new Date(Date.now()-60000)])).rows[0].id;
    const push={send:jest.fn(async()=>{
      await db.query("UPDATE notification_dispatches SET worker_id='replacement-worker',lease_expires_at=NOW()+INTERVAL '1 minute' WHERE id=$1",[job]);
      return {status:'ACCEPTED',acceptedDevices:1};
    })};
    try {
      const worker=new NotificationDispatcherService(db,sms as any,undefined,undefined,undefined,push as any);
      expect(path==='retry'?await worker.retryFailedDispatches():await worker.recoverStrandedJobs()).toBe(0);
      expect(push.send).toHaveBeenCalledTimes(1);
      expect((await db.query('SELECT delivery_status,worker_id FROM notification_dispatches WHERE id=$1',[job])).rows[0])
        .toMatchObject({delivery_status:'PROCESSING',worker_id:'replacement-worker'});
    } finally {if(previous===undefined)delete process.env.PUSH_PROVIDER;else process.env.PUSH_PROVIDER=previous;}
  });

  it.each(['accepted','rejected_then_retry'])('keeps actual SMS adapter formatting and durable %s outcomes separate from OTP', async path => {
    const priorToken=process.env.SPARROW_SMS_TOKEN;
    process.env.SPARROW_SMS_TOKEN='fictional-sms-provider-token';
    const provider=new SparrowSmsProviderAdapter();
    const otp=jest.spyOn(provider,'sendOtp');
    const fetch=jest.spyOn(global,'fetch');
    const accepted={ok:true,json:async()=>({response_code:200,message_id:'fictional-private-provider-receipt'})} as Response;
    if(path==='accepted')fetch.mockResolvedValue(accepted);
    else fetch.mockResolvedValueOnce({ok:false,json:async()=>({response:'fictional-private-provider-error'})} as Response).mockResolvedValue(accepted);
    try {
      const actual=new NotificationDispatcherService(db,provider);
      const entry=await record();
      expect(await actual.processRecord(entry)).toMatchObject([{status:path==='accepted'?'SENT':'FAILED',channel:'SMS'}]);
      const job=(await db.query('SELECT * FROM notification_dispatches WHERE outbox_id=$1',[entry.id])).rows[0];
      if(path==='rejected_then_retry') {
        expect(job.error_message).toBe('NOTIFICATION_DELIVERY_UNAVAILABLE');
        await db.query("UPDATE notification_dispatches SET next_retry_at=NOW()-INTERVAL '1 second' WHERE id=$1",[job.id]);
        expect(await actual.retryFailedDispatches()).toBe(1);
      }
      for(const call of fetch.mock.calls) {
        const form=new URLSearchParams(call[1]!.body as string);
        expect(form.get('text')).toBe('नयाँ निजी सन्देश आएको छ। (You have a new private message)');
        expect(form.get('text')).not.toContain('Private fixture');
        expect(form.get('text')).not.toContain('verification code');
      }
      expect(otp).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(path==='accepted'?1:2);
      const stored=(await db.query('SELECT * FROM notification_dispatches WHERE id=$1',[job.id])).rows[0];
      expect(stored.delivery_status).toBe('SENT');
      expect(stored.provider_response).toMatchObject({status:'DELIVERED',provider:'SMS_PROVIDER'});
      expect(JSON.stringify(stored.provider_response)).not.toContain('fictional-private-provider');
    } finally {
      otp.mockRestore(); fetch.mockRestore();
      if(priorToken===undefined)delete process.env.SPARROW_SMS_TOKEN;else process.env.SPARROW_SMS_TOKEN=priorToken;
    }
  });

});
