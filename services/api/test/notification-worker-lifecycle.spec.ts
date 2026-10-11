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
    service.onModuleInit(); service.onModuleInit();
    await jest.advanceTimersByTimeAsync(20000);
    expect(batch).toHaveBeenCalledTimes(1);expect(recover).not.toHaveBeenCalled();
    release();await jest.advanceTimersByTimeAsync(0);
    expect(recover).toHaveBeenCalledTimes(1);expect(retry).toHaveBeenCalledWith(5);
    await jest.advanceTimersByTimeAsync(5000);expect(batch).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();expect(jest.getTimerCount()).toBe(0);
  });
  it('releases the busy state after failure without logging private errors',async()=>{
    const {service,batch,error}=setup();batch.mockRejectedValueOnce(new Error('private provider credential'));
    service.onModuleInit();await jest.advanceTimersByTimeAsync(10000);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('NOTIFICATION_WORKER_UNAVAILABLE');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private provider credential');
    await service.onModuleDestroy();
  });
  it('stops future ticks and waits for the active cycle during shutdown',async()=>{
    const {service,batch,recover}=setup();
    let release!:()=>void;batch.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve([]);}));
    service.onModuleInit();await jest.advanceTimersByTimeAsync(5000);
    let stopped=false;const shutdown=service.onModuleDestroy().then(()=>{stopped=true;});
    await jest.advanceTimersByTimeAsync(15000);
    expect(stopped).toBe(false);expect(batch).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
    release();await shutdown;expect(recover).toHaveBeenCalledTimes(1);expect(stopped).toBe(true);
  });
});
