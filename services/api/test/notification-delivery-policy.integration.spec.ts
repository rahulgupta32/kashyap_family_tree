import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { DatabaseService } from '../src/database/database.service';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Delivery preferences and revoked chat access (real PostgreSQL)', () => {
  let iso: DisposableDatabase, db: DatabaseService, dispatcher: NotificationDispatcherService;
  let sender: string, recipient: string, conversation: string, message: string;
  const sms = { sendOtp: jest.fn(async (_phone: string, _message: string) => ({ success: true, provider: 'TestSmsProviderAdapter', simulated: true })) };

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
    sms.sendOtp.mockClear();
    await db.query('UPDATE notification_preferences SET sms_enabled=true,workflow_enabled=true,chat_enabled=true,family_events_enabled=true WHERE user_id=$1', [recipient]);
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
    expect(sms.sendOtp).toHaveBeenCalledTimes(1);
    expect(sms.sendOtp.mock.calls[0][1]).not.toContain('Private fixture');
  });
  it.each([
    ['CHAT_MESSAGE_CREATED','chat_enabled'],
    ['CLAIM_APPROVED_AND_LINKED','workflow_enabled'],
    ['CALENDAR_EVENT_CREATED','family_events_enabled'],
  ])('creates no external job for disabled %s', async (action, column) => {
    // Column names come only from these fixed test cases.
    await db.query(`UPDATE notification_preferences SET ${column}=false WHERE user_id=$1`, [recipient]);
    expect(await dispatcher.processRecord(await record(action))).toEqual([]);
    expect(sms.sendOtp).not.toHaveBeenCalled();
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
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[job])).rows[0].delivery_status).toBe('SKIPPED');
  });
  it('applies the same permission check when recovering an expired lease',async()=>{
    const job=await failedJob();
    await db.query("UPDATE notification_dispatches SET delivery_status='PROCESSING',lease_expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[job]);
    await db.query('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES($1,$2)',[sender,recipient]);
    await dispatcher.recoverStrandedJobs();
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[job])).rows[0].delivery_status).toBe('SKIPPED');
  });
});
