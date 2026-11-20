import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
describe('Notification claim polling bounds',()=>{
  it.each([0,-1,51,1.5,NaN,Infinity])('rejects invalid batch size %s before database writes',async size=>{
    const query=jest.fn(); const worker=new NotificationDispatcherService({query} as any);
    await expect(worker.processOutboxBatch(size)).rejects.toThrow('Invalid notification batch size');
    expect(query).not.toHaveBeenCalled();
  });
  it('stops an empty queue after one bounded atomic claim',async()=>{
    const query=jest.fn().mockResolvedValue({rows:[]});
    expect(await new NotificationDispatcherService({query} as any).processOutboxBatch(50)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
