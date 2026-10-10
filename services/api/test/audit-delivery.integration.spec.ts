import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuditAction } from '@kashyap/contracts';
import { DatabaseService } from '../src/database/database.service';
import { AuditRepository } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { AuditDeliveryService } from '../src/modules/audit/audit-delivery.service';
import { createDisposableDatabase,assertDatabaseIsolation,DisposableDatabase } from './helpers/disposable-db';

describe('Durable scheduled audit delivery (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,db:DatabaseService,audit:AuditRepository,outbox:AuditOutboxRepository;
 const original={...process.env};
 const stage=()=>outbox.recordAuditIntent({action:AuditAction.LOGIN,entityType:'test',entityId:randomUUID(),newValue:{fixture:true}});
 beforeAll(async()=>{iso=await createDisposableDatabase('audit_retry');db=new DatabaseService();await db.onModuleInit();await assertDatabaseIsolation(db,iso.dbName);audit=new AuditRepository(db);outbox=new AuditOutboxRepository(db);},60000);
 afterAll(async()=>{if(db)await db.onModuleDestroy();if(iso)await iso.drop();process.env=original;});
 it('retains an outage, respects persisted backoff after restart and recovers exactly once',async()=>{
  const entry=await stage();const failing=jest.spyOn(audit,'appendAuditLog').mockRejectedValueOnce(new Error('Private fictional database error'));
  try{expect(await outbox.processScheduledEntry(entry.id,audit)).toBe('FAILED');}finally{failing.mockRestore();}
  const row=(await db.query('SELECT *,extract(epoch FROM(next_attempt_at-CURRENT_TIMESTAMP)) AS wait FROM audit_outbox WHERE id=$1',[entry.id])).rows[0];
  expect(row.status).toBe('FAILED');expect(row.retry_count).toBe(1);expect(row.last_error).toBe('AUDIT_DELIVERY_FAILED');expect(Number(row.wait)).toBeGreaterThan(20);expect(Number(row.wait)).toBeLessThanOrEqual(30);
  expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[entry.id])).rows).toHaveLength(0);
  const restarted=new AuditOutboxRepository(db);expect(await restarted.processScheduledEntry(entry.id,audit)).toBe('SKIPPED');
  expect((await restarted.getPendingEntries()).some(e=>e.id===entry.id)).toBe(false);
  await db.query('UPDATE audit_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1',[entry.id]);
  const worker=new AuditDeliveryService({} as any,restarted,audit);expect((await worker.tick()).processed).toBeGreaterThanOrEqual(1);await worker.onModuleDestroy();
  expect(await restarted.processScheduledEntry(entry.id,audit)).toBe('SKIPPED');
  expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[entry.id])).rows).toHaveLength(1);
 });
 it('rolls back a real SQL append error to its savepoint and persists retry state',async()=>{
  const entry=await stage();const failing=jest.spyOn(audit,'appendAuditLog').mockImplementationOnce(async(...args:any[])=>{await args[9].query('SELECT 1/0');throw new Error('unreachable');});
  try{expect(await outbox.processScheduledEntry(entry.id,audit)).toBe('FAILED');}finally{failing.mockRestore();}
  const row=(await db.query('SELECT status,retry_count,last_error FROM audit_outbox WHERE id=$1',[entry.id])).rows[0];expect(row).toEqual({status:'FAILED',retry_count:1,last_error:'AUDIT_DELIVERY_FAILED'});
 });
 it('skips a row owned by another worker and delivers only once after release',async()=>{
  const entry=await stage();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),locked=new Promise<void>(resolve=>{entered=resolve;});
  const first=db.transaction(async tx=>{await tx.query('SELECT id FROM audit_outbox WHERE id=$1 FOR UPDATE',[entry.id]);entered();await gate;await outbox.processOutboxEntry(entry.id,audit,tx);});
  try{await locked;expect(await outbox.processScheduledEntry(entry.id,audit)).toBe('SKIPPED');}finally{release();await first;}
  expect(await outbox.processScheduledEntry(entry.id,audit)).toBe('SKIPPED');expect((await db.query("SELECT id FROM audit_logs WHERE new_value->>'outboxId'=$1",[entry.id])).rows).toHaveLength(1);
 });
 it('caps backoff and preserves exhausted evidence without retrying it automatically',async()=>{
  const entry=await stage();await db.query('UPDATE audit_outbox SET retry_count=9 WHERE id=$1',[entry.id]);await outbox.markFailed(entry.id,'AUDIT_DELIVERY_FAILED');
  const row=(await db.query('SELECT retry_count,extract(epoch FROM(next_attempt_at-CURRENT_TIMESTAMP)) AS wait FROM audit_outbox WHERE id=$1',[entry.id])).rows[0];expect(row.retry_count).toBe(10);expect(Number(row.wait)).toBeGreaterThan(3500);expect(Number(row.wait)).toBeLessThanOrEqual(3600);
  await db.query('UPDATE audit_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1',[entry.id]);expect(await outbox.processScheduledEntry(entry.id,audit)).toBe('SKIPPED');expect((await outbox.findByEntityId(entry.entity_id))).toHaveLength(1);
 });
 it('does not revive a processed record after a late failure and refuses schedule-erasing rollback',async()=>{
  const delivered=await stage();expect(await outbox.processScheduledEntry(delivered.id,audit)).toBe('PROCESSED');
  await outbox.markFailed(delivered.id,'Fictional late failure');
  expect((await db.query('SELECT status,retry_count,last_error FROM audit_outbox WHERE id=$1',[delivered.id])).rows[0]).toEqual({status:'PROCESSED',retry_count:0,last_error:null});
  const retained=await stage();await outbox.markFailed(retained.id,'AUDIT_DELIVERY_FAILED');
  const down=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/049_audit_delivery_schedule.down.sql'),'utf8');
  await expect(db.query(down)).rejects.toThrow('Audit retry schedule exists');
  expect((await db.query('SELECT next_attempt_at FROM audit_outbox WHERE id=$1',[retained.id])).rows[0].next_attempt_at).not.toBeNull();
 });
 it('reports exact due, delayed, exhausted and processed boundaries without evidence payloads',async()=>{
  const baseline=await outbox.getDeliverySummary();
  const due=await stage(),delayed=await stage(),exhausted=await stage(),processed=await stage();
  await db.query("UPDATE audit_outbox SET created_at=CURRENT_TIMESTAMP-INTERVAL '20 minutes' WHERE id=$1",[due.id]);
  await outbox.markFailed(delayed.id,'AUDIT_DELIVERY_FAILED');
  await db.query("UPDATE audit_outbox SET status='FAILED',retry_count=10,next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1",[exhausted.id]);
  await outbox.processOutboxEntry(processed.id,audit);
  const summary=await outbox.getDeliverySummary();expect(summary.pending).toBe(baseline.pending+3);expect(summary.due).toBe(baseline.due+1);expect(summary.delayed).toBe(baseline.delayed+1);expect(summary.exhausted).toBe(baseline.exhausted+1);expect(summary.failed).toBe(baseline.failed+2);expect(summary.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(1200);expect(summary.oldestDueAgeSeconds).toBeGreaterThanOrEqual(1200);
  expect(JSON.stringify(summary)).not.toContain(due.id);expect(JSON.stringify(summary)).not.toContain('fixture');
 });
 it('detects old unmatched OTP attempts and resolves them using retained outcomes or committed login evidence',async()=>{
  const baseline=(await outbox.getDeliverySummary()).unresolvedOtpAttempts;
  const unresolved=await outbox.recordAuditIntent({action:'OTP_REQUEST_ATTEMPT',entityType:'authentication_attempts',entityId:randomUUID()});
  const completed=await outbox.recordAuditIntent({action:'OTP_REQUEST_ATTEMPT',entityType:'authentication_attempts',entityId:randomUUID()});
  const verified=await outbox.recordAuditIntent({action:'OTP_VERIFY_ATTEMPT',entityType:'authentication_attempts',entityId:randomUUID()});
  const young=await outbox.recordAuditIntent({action:'OTP_VERIFY_ATTEMPT',entityType:'authentication_attempts',entityId:randomUUID()});
  await db.query("UPDATE audit_outbox SET created_at=CURRENT_TIMESTAMP-INTERVAL '11 minutes' WHERE id=ANY($1::uuid[])",[[unresolved.id,completed.id,verified.id]]);
  await outbox.recordAuditIntent({action:'OTP_REQUEST_OUTCOME',entityType:'authentication_attempts',entityId:completed.entity_id,newValue:{operationId:completed.entity_id,outcome:'SMS_ACCEPTED'}});
  await outbox.recordAuditIntent({action:AuditAction.LOGIN,entityType:'user_accounts',entityId:randomUUID(),newValue:{operationId:verified.entity_id}});
  expect((await outbox.getDeliverySummary()).unresolvedOtpAttempts).toBe(baseline+1);
  await outbox.recordAuditIntent({action:'OTP_REQUEST_OUTCOME',entityType:'authentication_attempts',entityId:unresolved.entity_id,newValue:{operationId:unresolved.entity_id,outcome:'REJECTED'}});
  expect((await outbox.getDeliverySummary()).unresolvedOtpAttempts).toBe(baseline);expect((await outbox.findByEntityId(young.entity_id))).toHaveLength(1);
  // Index-only rollback must retain all evidence.
  const down=fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/050_otp_evidence_lookup.down.sql'),'utf8');await db.query(down);
  expect((await outbox.findByEntityId(unresolved.entity_id))).toHaveLength(2);
 });

});
