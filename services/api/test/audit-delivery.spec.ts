import { AuditDeliveryService } from '../src/modules/audit/audit-delivery.service';

describe('Supervised audit delivery worker',()=>{
 const original=process.env.NODE_ENV;
 let migrations:any,outbox:any,worker:AuditDeliveryService;
 beforeEach(()=>{
  jest.useFakeTimers();process.env.NODE_ENV='test';
  migrations={runMigrations:jest.fn().mockResolvedValue(undefined)};
  outbox={drainOutbox:jest.fn().mockResolvedValue({processed:1,failed:0})};
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
});
