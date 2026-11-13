import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseService } from '../src/database/database.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { assertDatabaseIsolation,createDisposableDatabase,DisposableDatabase } from './helpers/disposable-db';
describe('Notification outbox claims (real PostgreSQL)',()=>{
  let iso:DisposableDatabase,db:DatabaseService,other:DatabaseService;
  beforeAll(async()=>{
    iso=await createDisposableDatabase('notification_claims');
    db=new DatabaseService();other=new DatabaseService();await db.onModuleInit();await other.onModuleInit();
    await assertDatabaseIsolation(db,iso.dbName);await assertDatabaseIsolation(other,iso.dbName);
  },60000);
  afterAll(async()=>{if(db)await db.onModuleDestroy();if(other)await other.onModuleDestroy();if(iso)await iso.drop();});
  beforeEach(async()=>{await db.query('DELETE FROM audit_outbox');});
  async function event(){return (await db.query("INSERT INTO audit_outbox(action,entity_type,entity_id) VALUES('LOGIN','user','fictional') RETURNING id")).rows[0].id;}
  async function row(id:string){return (await db.query('SELECT * FROM audit_outbox WHERE id=$1',[id])).rows[0];}
  function worker(database:any=db){
    const service=new NotificationDispatcherService(database);
    const process=jest.spyOn(service,'processRecord').mockResolvedValue([]);
    jest.spyOn((service as any).logger,'warn').mockImplementation(()=>undefined);
    jest.spyOn((service as any).logger,'error').mockImplementation(()=>undefined);
    return {service,process};
  }
  function block(process:jest.SpyInstance){
    let enter!:()=>void,release!:()=>void;
    const entered=new Promise<void>(resolve=>{enter=resolve;});
    process.mockImplementationOnce(()=>{enter();return new Promise(resolve=>{release=()=>resolve([]);});});
    return {entered,release:()=>release()};
  }
  it('admits only one worker while the event lease is active',async()=>{
    const id=await event(),a=worker(),b=worker(other),gate=block(a.process);
    const pending=a.service.processOutboxBatch(1);await gate.entered;
    try {
      expect(await b.service.processOutboxBatch(1)).toEqual([]);expect(b.process).not.toHaveBeenCalled();
      expect(await row(id)).toMatchObject({notification_status:'PROCESSING',status:'PENDING'});
    } finally {gate.release();await pending;}
    expect(await row(id)).toMatchObject({notification_status:'PROCESSED',notification_claim_id:null,notification_lease_expires_at:null,status:'PENDING'});
  });
  it('leaves later events available to another worker instead of leasing a waiting batch',async()=>{
    const first=await event(),second=await event(),a=worker(),b=worker(other),gate=block(a.process);
    const pending=a.service.processOutboxBatch(1);await gate.entered;
    try {await b.service.processOutboxBatch(1);expect(b.process.mock.calls[0][0].id).toBe(second);expect((await row(first)).notification_status).toBe('PROCESSING');}
    finally {gate.release();await pending;}
  });
  it('recovers an expired lease and rejects the stale worker acknowledgement',async()=>{
    const id=await event(),a=worker(),b=worker(other),gate=block(a.process);
    const pending=a.service.processOutboxBatch(1);await gate.entered;
    let completed:any;
    try {
      await db.query("UPDATE audit_outbox SET notification_lease_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[id]);
      await b.service.processOutboxBatch(1);completed=await row(id);
    } finally {gate.release();await pending;}
    expect((await row(id)).notification_processed_at).toEqual(completed.notification_processed_at);
    expect((await row(id)).notification_status).toBe('PROCESSED');expect(b.process).toHaveBeenCalledTimes(1);
  });
  it('retains failure and cooldown before permitting a new attempt',async()=>{
    const id=await event(),a=worker();a.process.mockRejectedValueOnce(new Error('fictional private provider error'));
    await a.service.processOutboxBatch(2);expect(a.process).toHaveBeenCalledTimes(1);
    expect(await row(id)).toMatchObject({notification_status:'FAILED',notification_claim_id:null,status:'PENDING'});
    await a.service.processOutboxBatch(1);expect(a.process).toHaveBeenCalledTimes(1);
    await db.query("UPDATE audit_outbox SET notification_processed_at=CURRENT_TIMESTAMP-INTERVAL '31 seconds' WHERE id=$1",[id]);
    await a.service.processOutboxBatch(1);expect(a.process).toHaveBeenCalledTimes(2);expect((await row(id)).notification_status).toBe('PROCESSED');
  });
  it('preserves an unconfirmed committed claim for lease recovery without processing it',async()=>{
    const id=await event();let lose=true;
    const a=worker({query:async(sql:string,params:any[])=>{const result=await db.query(sql,params);if(lose&&sql.startsWith('WITH candidate')){lose=false;throw new Error('lost acknowledgement');}return result;}});
    await expect(a.service.processOutboxBatch(1)).rejects.toThrow('lost acknowledgement');expect(a.process).not.toHaveBeenCalled();
    const b=worker(other);await b.service.processOutboxBatch(1);expect(b.process).not.toHaveBeenCalled();
    await db.query("UPDATE audit_outbox SET notification_lease_expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[id]);
    await b.service.processOutboxBatch(1);expect((await row(id)).notification_status).toBe('PROCESSED');
  });
  it('does not reverse a committed completion after losing its acknowledgement',async()=>{
    const id=await event();let lose=true;
    const a=worker({query:async(sql:string,params:any[])=>{const result=await db.query(sql,params);if(lose&&params?.[2]==='PROCESSED'){lose=false;throw new Error('lost acknowledgement');}return result;}});
    await a.service.processOutboxBatch(1);expect((await row(id)).notification_status).toBe('PROCESSED');
    await a.service.processOutboxBatch(1);expect(a.process).toHaveBeenCalledTimes(1);
  });
  it('refuses rollback with retained claims and rejects incomplete ownership metadata',async()=>{
    const id=await event(),a=worker(),gate=block(a.process),pending=a.service.processOutboxBatch(1);await gate.entered;
    try {
      await expect(db.query(readFileSync(join(__dirname,'../../../database/migrations/055_notification_outbox_claims.down.sql'),'utf8'))).rejects.toThrow('Drain notification claims');
      await expect(db.query('UPDATE audit_outbox SET notification_claim_id=NULL WHERE id=$1',[id])).rejects.toMatchObject({code:'23514'});
      expect((await row(id)).notification_claim_id).toBeTruthy();
    } finally {gate.release();await pending;}
  });
});
