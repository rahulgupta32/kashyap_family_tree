import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { PushTokensService } from '../src/modules/notifications/push-tokens.service';
import { PushDeliveryService } from '../src/modules/notifications/push-delivery.service';
import { PUSH_NOTIFICATION_PROVIDER } from '../src/modules/notifications/push-provider.interface';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Push provider journal (real PostgreSQL, fictional provider)',()=>{
  let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,tokens:PushTokensService,delivery:PushDeliveryService;
  let audit:AuditOutboxRepository,users:UserRepository,sessions:SessionRepository,counter=0;
  const provider={send:jest.fn()};
  const hash=createHash('sha256').update('fictional-receipt').digest('hex');
  const saved={active:process.env.PUSH_TOKEN_ACTIVE_KEY_ID,keys:process.env.PUSH_TOKEN_KEYS_JSON};
  async function fixture(){
    const user=await users.findOrCreateByPhone('+977984750'+String(++counter).padStart(4,'0'));
    const session=await sessions.createSession({userId:user.id,refreshTokenHash:randomBytes(32).toString('hex'),devicePlatform:'ANDROID',expiresAt:new Date(Date.now()+3600000)});
    const actor={id:user.id,sessionId:session.id,roles:[]} as any,secret=randomBytes(48).toString('hex');
    const registration=await tokens.register(actor,{token:secret,platform:'ANDROID'});
    const dispatch=(await db.query(`INSERT INTO notification_dispatches(recipient_user_id,channel,event_type,payload,delivery_status)
      VALUES($1,'PUSH','FICTIONAL_PROVIDER_TEST',$2,'RECONCILIATION_REQUIRED') RETURNING id`,[user.id,JSON.stringify({privateFixture:'private-family-detail'})])).rows[0];
    return {user,session,actor,secret,registration,id:dispatch.id};
  }
  beforeAll(async()=>{
    process.env.PUSH_TOKEN_ACTIVE_KEY_ID='integration';process.env.PUSH_TOKEN_KEYS_JSON=JSON.stringify({integration:randomBytes(32).toString('base64')});
    iso=await createDisposableDatabase('push_provider');await assertDatabaseIsolation(iso.client,iso.dbName);
    const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PUSH_NOTIFICATION_PROVIDER).useValue(provider).compile();
    app=module.createNestApplication();await app.init();db=module.get(DatabaseService);tokens=module.get(PushTokensService);
    delivery=module.get(PushDeliveryService);audit=module.get(AuditOutboxRepository);users=module.get(UserRepository);sessions=module.get(SessionRepository);
    await assertDatabaseIsolation(db,iso.dbName);
  },60000);
  beforeEach(()=>{provider.send.mockReset();provider.send.mockImplementation(async(_token,_id,authorize)=>await authorize()?{status:'ACCEPTED',receiptHash:hash}:{status:'SKIPPED'});});
  afterAll(async()=>{
    if(app)await app.close();if(iso)await iso.drop();
    if(saved.active===undefined)delete process.env.PUSH_TOKEN_ACTIVE_KEY_ID;else process.env.PUSH_TOKEN_ACTIVE_KEY_ID=saved.active;
    if(saved.keys===undefined)delete process.env.PUSH_TOKEN_KEYS_JSON;else process.env.PUSH_TOKEN_KEYS_JSON=saved.keys;
  });
  it('claims concurrent workers once and preserves redacted evidence across repeated sends and token rotation',async()=>{
    const f=await fixture();
    await Promise.all([delivery.send(f.user.id,f.id,async()=>true),delivery.send(f.user.id,f.id,async()=>true)]);
    expect(provider.send).toHaveBeenCalledTimes(1);
    await tokens.register(f.actor,{token:randomBytes(48).toString('hex'),platform:'ANDROID'});
    expect(await delivery.send(f.user.id,f.id,async()=>true)).toMatchObject({status:'ACCEPTED',acceptedDevices:1});
    expect(provider.send).toHaveBeenCalledTimes(1);
    const attempts=(await db.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1',[f.id])).rows;
    const observations=(await db.query('SELECT * FROM push_provider_observations WHERE attempt_id=$1',[attempts[0].id])).rows;
    expect(attempts).toHaveLength(1);expect(attempts[0].token_generation).toBe(f.registration.generation);expect(observations).toHaveLength(1);
    const events=(await db.query("SELECT new_value FROM audit_outbox WHERE entity_id=$1 AND action='PUSH_PROVIDER_OUTCOME'",[attempts[0].id])).rows;
    expect(events).toEqual([{new_value:{outcome:'ACCEPTED'}}]);
    expect(JSON.stringify({attempts,observations,events})).not.toContain(f.secret);
    expect(JSON.stringify({attempts,observations,events})).not.toContain('private-family-detail');
    await delivery.reconcileConfirmed();
    expect((await db.query('SELECT delivery_status,provider_response FROM notification_dispatches WHERE id=$1',[f.id])).rows[0]).toMatchObject({delivery_status:'SENT',provider_response:{acceptanceOnly:true,reconciled:true}});
  });
  it('holds lost responses and does not turn an accepted plus unobserved device into a confirmed parent',async()=>{
    const f=await fixture();provider.send.mockRejectedValueOnce(new Error('untrusted private provider diagnostic'));
    expect(await delivery.send(f.user.id,f.id,async()=>true)).toMatchObject({status:'RECONCILIATION_REQUIRED',unresolvedDevices:1});
    await delivery.send(f.user.id,f.id,async()=>true);expect(provider.send).toHaveBeenCalledTimes(1);
    const attempt=(await db.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1',[f.id])).rows[0];
    // Separate accepted sibling proves SQL aggregate cannot ignore an unknown device with no observation.
    const sibling=(await db.query(`INSERT INTO push_delivery_attempts(dispatch_id,registration_id,token_generation)
      VALUES($1,$2,$3) RETURNING id`,[f.id,randomUUID(),randomUUID()])).rows[0];
    await db.query("UPDATE push_delivery_attempts SET status='SENDING',claim_id=$2,lease_expires_at=clock_timestamp()+INTERVAL '2 minutes' WHERE id=$1",[sibling.id,randomUUID()]);
    await db.query("UPDATE push_delivery_attempts SET status='ACCEPTED',receipt_hash=$2,completed_at=clock_timestamp() WHERE id=$1",[sibling.id,hash]);
    // A lost claim acknowledgement has no provider observation.
    const unobserved=(await db.query(`INSERT INTO push_delivery_attempts(dispatch_id,registration_id,token_generation)
      VALUES($1,$2,$3) RETURNING id`,[f.id,randomUUID(),randomUUID()])).rows[0];
    await db.query("UPDATE push_delivery_attempts SET status='SENDING',claim_id=$2,lease_expires_at=clock_timestamp()-INTERVAL '1 minute' WHERE id=$1",[unobserved.id,randomUUID()]);
    await delivery.send(f.user.id,f.id,async()=>true);await delivery.reconcileConfirmed();
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT status FROM push_delivery_attempts WHERE id=$1',[unobserved.id])).rows[0].status).toBe('UNKNOWN');
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[f.id])).rows[0].delivery_status).toBe('RECONCILIATION_REQUIRED');
    expect(attempt.status).toBe('UNKNOWN');
  });
  it('rechecks live session and current generation immediately before provider transmission',async()=>{
    const f=await fixture();provider.send.mockImplementationOnce(async(_token,_id,authorize)=>{
      await db.query('UPDATE user_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.session.id]);
      expect(await authorize()).toBe(false);return {status:'SKIPPED'};
    });
    expect(await delivery.send(f.user.id,f.id,async()=>true)).toMatchObject({status:'SKIPPED'});
    const rotated=await fixture();provider.send.mockImplementationOnce(async(_token,_id,authorize)=>{
      await tokens.register(rotated.actor,{token:randomBytes(48).toString('hex'),platform:'ANDROID'});
      expect(await authorize()).toBe(false);return {status:'SKIPPED'};
    });
    expect(await delivery.send(rotated.user.id,rotated.id,async()=>true)).toMatchObject({status:'SKIPPED'});
  });
  it('skips revoked audience and disabled preferences without provider calls',async()=>{
    const f=await fixture();expect(await delivery.send(f.user.id,f.id,async()=>false)).toMatchObject({status:'SKIPPED'});
    const disabled=await fixture();await db.query('INSERT INTO notification_preferences(user_id,push_enabled) VALUES($1,false) ON CONFLICT(user_id) DO UPDATE SET push_enabled=false',[disabled.user.id]);
    expect(await delivery.send(disabled.user.id,disabled.id,async()=>true)).toMatchObject({status:'SKIPPED'});expect(provider.send).not.toHaveBeenCalled();
  });
  it('invalidates the exact captured generation atomically and preserves a rotation after transmission',async()=>{
    const f=await fixture();provider.send.mockResolvedValueOnce({status:'INVALID_TOKEN'});
    await delivery.send(f.user.id,f.id,async()=>true);
    expect((await db.query('SELECT id FROM push_token_registrations WHERE id=$1',[f.registration.id])).rows).toHaveLength(0);
    const rotated=await fixture();let latest:any;provider.send.mockImplementationOnce(async()=>{
      latest=await tokens.register(rotated.actor,{token:randomBytes(48).toString('hex'),platform:'ANDROID'});return {status:'INVALID_TOKEN'};
    });
    await delivery.send(rotated.user.id,rotated.id,async()=>true);
    expect((await db.query('SELECT generation FROM push_token_registrations WHERE id=$1',[latest.id])).rows[0].generation).toBe(latest.generation);
  });
  it('rolls back invalidation and observation together on audit failure without resending an uncertain claim',async()=>{
    const f=await fixture();provider.send.mockResolvedValueOnce({status:'INVALID_TOKEN'});
    const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('private database diagnostic'));
    try {await expect(delivery.send(f.user.id,f.id,async()=>true)).rejects.toThrow('NOTIFICATION_DELIVERY_UNAVAILABLE');}finally{spy.mockRestore();}
    expect((await db.query('SELECT id FROM push_token_registrations WHERE id=$1',[f.registration.id])).rows).toHaveLength(1);
    const row=(await db.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1',[f.id])).rows[0];expect(row.status).toBe('SENDING');
    expect((await db.query('SELECT id FROM push_provider_observations WHERE attempt_id=$1',[row.id])).rows).toHaveLength(0);
    await delivery.send(f.user.id,f.id,async()=>true);expect(provider.send).toHaveBeenCalledTimes(1);
  });
  it('reconciles a committed acknowledgement even when its caller lost the database response',async()=>{
    const f=await fixture();const original=db.transaction.bind(db);let calls=0;
    const spy=jest.spyOn(db,'transaction').mockImplementation(async work=>{
      const result=await original(work);if(++calls===2)throw new Error('fictional lost commit acknowledgement');return result;
    });
    try {await expect(delivery.send(f.user.id,f.id,async()=>true)).rejects.toThrow('NOTIFICATION_DELIVERY_UNAVAILABLE');}finally{spy.mockRestore();}
    await delivery.reconcileConfirmed();await delivery.send(f.user.id,f.id,async()=>true);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[f.id])).rows[0].delivery_status).toBe('SENT');
  });
  it('retains late provider proof separately from an expired claim and reconciles it without retransmission',async()=>{
    const f=await fixture();
    const row=(await db.query('INSERT INTO push_delivery_attempts(dispatch_id,registration_id,token_generation) VALUES($1,$2,$3) RETURNING *',[f.id,f.registration.id,f.registration.generation])).rows[0],claim=randomUUID();
    await db.query("UPDATE push_delivery_attempts SET status='SENDING',claim_id=$2,lease_expires_at=clock_timestamp()-INTERVAL '1 minute' WHERE id=$1",[row.id,claim]);
    await delivery.send(f.user.id,f.id,async()=>true);expect(provider.send).not.toHaveBeenCalled();
    await (delivery as any).finish(f.user.id,row,claim,{status:'ACCEPTED',receiptHash:hash});
    expect((await db.query('SELECT status FROM push_delivery_attempts WHERE id=$1',[row.id])).rows[0].status).toBe('UNKNOWN');
    await delivery.reconcileConfirmed();
    expect((await db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[f.id])).rows[0].delivery_status).toBe('SENT');
  });
  it('rejects evidence mutation and rollback when retained provider evidence exists',async()=>{
    const f=await fixture();await delivery.send(f.user.id,f.id,async()=>true);
    const row=(await db.query('SELECT id FROM push_delivery_attempts WHERE dispatch_id=$1',[f.id])).rows[0];
    await expect(db.query("UPDATE push_delivery_attempts SET status='PLANNED' WHERE id=$1",[row.id])).rejects.toThrow('PUSH_PROVIDER_EVIDENCE_IMMUTABLE');
    await expect(db.query('DELETE FROM push_delivery_attempts WHERE id=$1',[row.id])).rejects.toThrow('PUSH_PROVIDER_EVIDENCE_IMMUTABLE');
    await expect(db.query('UPDATE push_provider_observations SET receipt_hash=$2 WHERE attempt_id=$1',[row.id,'a'.repeat(64)])).rejects.toThrow('PUSH_PROVIDER_EVIDENCE_IMMUTABLE');
    const down=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/057_push_provider_journal.down.sql'),'utf8');
    await expect(db.query(down)).rejects.toThrow('PUSH_PROVIDER_EVIDENCE_RETAINED');
  });
  it('fails closed without an encryption key and quarantines malformed provider acknowledgements',async()=>{
    const f=await fixture(),keys=process.env.PUSH_TOKEN_KEYS_JSON;delete process.env.PUSH_TOKEN_KEYS_JSON;
    try {expect(await delivery.send(f.user.id,f.id,async()=>true)).toMatchObject({status:'RECONCILIATION_REQUIRED'});}finally{process.env.PUSH_TOKEN_KEYS_JSON=keys;}
    expect(provider.send).not.toHaveBeenCalled();
    const malformed=await fixture();provider.send.mockResolvedValueOnce({status:'ACCEPTED',receiptHash:'raw-private-receipt'});
    expect(await delivery.send(malformed.user.id,malformed.id,async()=>true)).toMatchObject({status:'RECONCILIATION_REQUIRED'});
    const rows=(await db.query('SELECT a.*,o.outcome FROM push_delivery_attempts a JOIN push_provider_observations o ON o.attempt_id=a.id WHERE a.dispatch_id=$1',[malformed.id])).rows;
    expect(rows[0].status).toBe('UNKNOWN');expect(JSON.stringify(rows)).not.toContain('raw-private-receipt');
  });
  it('rejects oversized device rosters before persisting a partial plan or transmitting any device',async()=>{
    const f=await fixture();
    for(let i=0;i<50;i++){
      const session=await sessions.createSession({userId:f.user.id,refreshTokenHash:randomBytes(32).toString('hex'),devicePlatform:'ANDROID',expiresAt:new Date(Date.now()+3600000)});
      await tokens.register({...f.actor,sessionId:session.id},{token:randomBytes(48).toString('hex'),platform:'ANDROID'});
    }
    await expect(delivery.send(f.user.id,f.id,async()=>true)).rejects.toThrow('NOTIFICATION_DELIVERY_UNAVAILABLE');
    expect(provider.send).not.toHaveBeenCalled();
    expect((await db.query('SELECT id FROM push_delivery_attempts WHERE dispatch_id=$1',[f.id])).rows).toHaveLength(0);
  });
});
