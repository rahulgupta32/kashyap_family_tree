import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
describe('Notification worker lifecycle',()=>{
  const originalEnv={...process.env};
  beforeEach(()=>{jest.useFakeTimers();process.env.NODE_ENV='development';});
  afterEach(()=>{jest.useRealTimers();jest.restoreAllMocks();process.env={...originalEnv};});
  function setup(){
    const service=new NotificationDispatcherService({} as any);
    const batch=jest.spyOn(service,'processOutboxBatch').mockResolvedValue([]);
    const recover=jest.spyOn(service,'recoverStrandedJobs').mockResolvedValue(0);
    const retry=jest.spyOn(service,'retryFailedDispatches').mockResolvedValue(0);
    const error=jest.spyOn((service as any).logger,'error').mockImplementation(()=>undefined);
    return {service,batch,recover,retry,error};
  }
  it('joins a slow cycle instead of starting overlapping delivery batches',async()=>{
    const {service,batch,recover,retry}=setup();
    let release!:()=>void;batch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
    await service.onModuleInit(); await service.onModuleInit();
    await jest.advanceTimersByTimeAsync(20000);
    expect(batch).toHaveBeenCalledTimes(1);expect(recover).not.toHaveBeenCalled();
    release();await jest.advanceTimersByTimeAsync(0);
    expect(recover).toHaveBeenCalledTimes(1);expect(retry).toHaveBeenCalledWith(5);
    await jest.advanceTimersByTimeAsync(5000);expect(batch).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();expect(jest.getTimerCount()).toBe(0);
  });
  it('releases the busy state after failure without logging private errors',async()=>{
    const {service,batch,error}=setup();batch.mockRejectedValueOnce(new Error('private provider credential'));
    await service.onModuleInit();await jest.advanceTimersByTimeAsync(10000);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('NOTIFICATION_WORKER_UNAVAILABLE');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private provider credential');
    await service.onModuleDestroy();
  });
  it('stops future ticks and waits for the active cycle during shutdown',async()=>{
    const {service,batch,recover}=setup();
    let release!:()=>void;batch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
    await service.onModuleInit();await jest.advanceTimersByTimeAsync(5000);
    let stopped=false;const shutdown=service.onModuleDestroy().then(()=>{stopped=true;});
    await jest.advanceTimersByTimeAsync(15000);
    expect(stopped).toBe(false);expect(batch).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
    release();await shutdown;expect(recover).toHaveBeenCalledTimes(1);expect(stopped).toBe(true);
    await service.onModuleInit();expect(service.workerStatus().lifecycle).toBe('STOPPED');expect(jest.getTimerCount()).toBe(0);
  });
  it('does not start delivery before migrations and coalesces startup calls',async()=>{
    let release!:()=>void;const migrations={runMigrations:jest.fn(()=>new Promise<void>(resolve=>{release=resolve;}))};
    const service=new NotificationDispatcherService({} as any,undefined,undefined,undefined,undefined,undefined,migrations as any);
    const batch=jest.spyOn(service,'processOutboxBatch').mockResolvedValue([]);
    jest.spyOn(service,'recoverStrandedJobs').mockResolvedValue(0);jest.spyOn(service,'retryFailedDispatches').mockResolvedValue(0);
    const first=service.onModuleInit(),second=service.onModuleInit();expect(first).toBe(second);
    await jest.advanceTimersByTimeAsync(10000);expect(batch).not.toHaveBeenCalled();expect(service.workerStatus().lifecycle).toBe('STARTING');
    release();await first;expect(migrations.runMigrations).toHaveBeenCalledTimes(1);expect(service.workerStatus().lifecycle).toBe('RUNNING');
    await jest.advanceTimersByTimeAsync(5000);expect(batch).toHaveBeenCalledTimes(1);await service.onModuleDestroy();
  });
  it('records phase failures without private diagnostics and reports recovery after a later successful cycle',async()=>{
    const tokens={retireStale:jest.fn().mockRejectedValueOnce(new Error('private token')).mockResolvedValue({retired:0})};
    const push={reconcileConfirmed:jest.fn().mockRejectedValueOnce(new Error('private provider')).mockResolvedValue({reconciled:0})};
    const service=new NotificationDispatcherService({} as any,undefined,undefined,undefined,tokens as any,push as any);
    jest.spyOn(service,'processOutboxBatch').mockResolvedValue([]);jest.spyOn(service,'recoverStrandedJobs').mockResolvedValue(0);jest.spyOn(service,'retryFailedDispatches').mockResolvedValue(0);
    jest.spyOn((service as any).logger,'error').mockImplementation(()=>undefined);
    await service.onModuleInit();await jest.advanceTimersByTimeAsync(5000);
    const failed=service.workerStatus();expect(failed.lastFailureCodes).toEqual(['PUSH_TOKEN_RETENTION_UNAVAILABLE','PUSH_PROVIDER_RECONCILIATION_UNAVAILABLE']);
    expect(failed.lastFailureAt).not.toBeNull();expect(failed.lastCompletedAt).toBeNull();expect(JSON.stringify(failed)).not.toContain('private');
    failed.lastFailureCodes.push('untrusted mutation');expect(service.workerStatus().lastFailureCodes).not.toContain('untrusted mutation');
    await jest.advanceTimersByTimeAsync(5000);const recovered=service.workerStatus();expect(recovered.lastCompletedAt).not.toBeNull();expect(recovered.lastFailureAt).toBe(failed.lastFailureAt);expect(recovered.lastFailureCodes).toEqual([]);
    await service.onModuleDestroy();
  });
  it('reports in-flight notification work and joins it before declaring shutdown complete',async()=>{
    const {service,batch}=setup();let release!:()=>void;batch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
    await service.onModuleInit();await jest.advanceTimersByTimeAsync(5000);
    expect(service.workerStatus()).toMatchObject({scope:'THIS_API_PROCESS',lifecycle:'RUNNING',inFlight:true,lastCompletedAt:null});
    const stopped=service.onModuleDestroy();expect(service.workerStatus()).toMatchObject({lifecycle:'STOPPED',inFlight:true});
    release();await stopped;expect(service.workerStatus().inFlight).toBe(false);expect(service.workerStatus().lastCompletedAt).not.toBeNull();
  });
  it('does not start a worker after shutdown during pending migration startup',async()=>{
    let release!:()=>void;const migrations={runMigrations:()=>new Promise<void>(resolve=>{release=resolve;})};
    const service=new NotificationDispatcherService({} as any,undefined,undefined,undefined,undefined,undefined,migrations as any);
    const initializing=service.onModuleInit();await service.onModuleDestroy();release();await initializing;
    expect(service.workerStatus().lifecycle).toBe('STOPPED');expect(jest.getTimerCount()).toBe(0);
  });
  it('reports test-disabled state and fails startup if migrations cannot be confirmed',async()=>{
    process.env.NODE_ENV='test';const {service}=setup();await service.onModuleInit();expect(service.workerStatus().lifecycle).toBe('TEST_DISABLED');expect(jest.getTimerCount()).toBe(0);await service.onModuleDestroy();
    process.env.NODE_ENV='production';const failed=new NotificationDispatcherService({} as any,undefined,undefined,undefined,undefined,undefined,{runMigrations:async()=>{throw new Error('fictional migration outage');}} as any);
    await expect(failed.onModuleInit()).rejects.toThrow('fictional migration outage');expect(failed.workerStatus().lifecycle).toBe('STARTING');expect(jest.getTimerCount()).toBe(0);await failed.onModuleDestroy();
  });
});
