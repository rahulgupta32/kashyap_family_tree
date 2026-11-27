import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { AuditDeliveryService } from '../src/modules/audit/audit-delivery.service';

describe('Supervised audit delivery worker',()=>{
 const original=process.env.NODE_ENV;
 let migrations:any,outbox:any,worker:AuditDeliveryService;
 beforeEach(()=>{
  jest.useFakeTimers();process.env.NODE_ENV='test';
  migrations={runMigrations:jest.fn().mockResolvedValue(undefined)};
  outbox={drainOutbox:jest.fn().mockResolvedValue({processed:1,failed:0}),getDeliverySummary:jest.fn().mockResolvedValue({pending:3,due:1,delayed:1,exhausted:1,failed:2,unresolvedOtpAttempts:0,oldestPendingAgeSeconds:900,oldestDueAgeSeconds:30})};
  worker=new AuditDeliveryService(migrations,outbox,{} as any);
 });
 afterEach(async()=>{await worker.onModuleDestroy();jest.useRealTimers();if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;});
 it('keeps background timers disabled in isolated tests',async()=>{
  await worker.onModuleInit();jest.advanceTimersByTime(10000);
  expect(migrations.runMigrations).not.toHaveBeenCalled();expect(outbox.drainOutbox).not.toHaveBeenCalled();
 });
 it('waits for migrations before starting a bounded production cycle',async()=>{
  process.env.NODE_ENV='production';let release!:()=>void;
  migrations.runMigrations.mockReturnValue(new Promise<void>(resolve=>{release=resolve;}));
  const initializing=worker.onModuleInit();jest.advanceTimersByTime(10000);expect(outbox.drainOutbox).not.toHaveBeenCalled();
  release();await initializing;jest.advanceTimersByTime(5000);await Promise.resolve();
  expect(outbox.drainOutbox).toHaveBeenCalledWith(expect.anything(),20);
 });
 it('coalesces overlapping ticks instead of starting a second batch',async()=>{
  let release!:()=>void;outbox.drainOutbox.mockReturnValue(new Promise(resolve=>{release=()=>resolve({processed:2,failed:0});}));
  const first=worker.tick(),second=worker.tick();expect(first).toBe(second);expect(outbox.drainOutbox).toHaveBeenCalledTimes(1);
  release();expect(await first).toEqual({processed:2,failed:0});
 });
 it('allows a later cycle after a failed drain',async()=>{
  outbox.drainOutbox.mockRejectedValueOnce(new Error('Fictional outage'));
  await expect(worker.tick()).rejects.toThrow('Fictional outage');
  expect(await worker.tick()).toEqual({processed:1,failed:0});
 });
 it('waits for in-flight work during shutdown and starts no further batch',async()=>{
  let release!:()=>void;outbox.drainOutbox.mockReturnValue(new Promise(resolve=>{release=()=>resolve({processed:1,failed:0});}));
  void worker.tick();let finished=false;const stopping=worker.onModuleDestroy().then(()=>{finished=true;});
  await Promise.resolve();expect(finished).toBe(false);expect(await worker.tick()).toEqual({processed:0,failed:0});
  release();await stopping;expect(finished).toBe(true);expect(outbox.drainOutbox).toHaveBeenCalledTimes(1);
 });
 it('reports local activity and fleet backlog without exposing downstream errors',async()=>{
  await worker.onModuleInit();
  outbox.drainOutbox.mockRejectedValueOnce(new Error('Private provider detail'));
  await expect(worker.tick()).rejects.toThrow();
  const failed=await worker.deliveryStatus();expect(failed.worker.lifecycle).toBe('TEST_DISABLED');expect(failed.worker.lastFailureAt).not.toBeNull();expect(failed.worker.lastCompletedAt).toBeNull();
  expect(JSON.stringify(failed)).not.toContain('Private provider');
  await worker.tick();const recovered=await worker.deliveryStatus();expect(recovered.worker.scope).toBe('THIS_API_PROCESS');expect(recovered.worker.lastCompletedAt).not.toBeNull();expect(recovered.worker.lastResult).toEqual({processed:1,failed:0});expect(recovered.backlog.exhausted).toBe(1);
 });
 it('reports active work before completion and stopped lifecycle after cleanup',async()=>{
  let release!:()=>void;outbox.drainOutbox.mockReturnValue(new Promise(resolve=>{release=()=>resolve({processed:0,failed:2});}));
  const cycle=worker.tick();expect((await worker.deliveryStatus()).worker.inFlight).toBe(true);
  release();await cycle;await worker.onModuleDestroy();const stopped=await worker.deliveryStatus();expect(stopped.worker.inFlight).toBe(false);expect(stopped.worker.lifecycle).toBe('STOPPED');expect(stopped.worker.lastResult?.failed).toBe(2);
 });
 it('propagates selection outage instead of falsely reporting an empty successful batch',async()=>{
  const repository=new AuditOutboxRepository({query:jest.fn().mockRejectedValue(new Error('Private SQL detail'))} as any);
  await expect(repository.drainOutbox({} as any)).rejects.toThrow('AUDIT_SELECTION_UNAVAILABLE');
 });

});
