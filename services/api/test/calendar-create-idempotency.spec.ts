import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CalendarService, calendarCreateFingerprint } from '../src/modules/calendar/calendar.service';

describe('Calendar creation retry contract',()=>{
  const user=randomUUID(),key=randomUUID();
  it('canonicalizes nested object keys but distinguishes payload and array changes',()=>{
    expect(calendarCreateFingerprint({title:'A',selection:{a:1,b:2}})).toBe(calendarCreateFingerprint({selection:{b:2,a:1},title:'A'}));
    expect(calendarCreateFingerprint({title:'A'})).not.toBe(calendarCreateFingerprint({title:'B'}));
    expect(calendarCreateFingerprint({ids:[1,2]})).not.toBe(calendarCreateFingerprint({ids:[2,1]}));
  });
  it('rejects malformed keys and unknown fields before starting a transaction',async()=>{
    const db={transaction:jest.fn()};const service=new CalendarService(db as any,{} as any,{} as any,{} as any);
    await expect(service.createEvent(user,null as any)).rejects.toThrow('Calendar event body required');
    await expect(service.createEvent(user,{creationKey:'bad'} as any)).rejects.toThrow();
    await expect(service.createEvent(user,{creationKey:key,unexpected:true} as any)).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
  function replay(hash:string){
    const query=jest.fn(async(sql:string)=>({rows:sql.includes('INSERT INTO calendar_create_receipts')?[]:
      sql.includes('SELECT payload_hash')?[{payload_hash:hash,event_id:'existing'}]:sql.includes('SELECT * FROM calendar_events')?[{id:'existing'}]:[]}));
    const db={transaction:jest.fn(async(run:any)=>run({query}))};
    const service=new CalendarService(db as any,{} as any,{} as any,{} as any);
    const scope=jest.spyOn(service as any,'authorizeScope').mockResolvedValue({});
    const validate=jest.spyOn(service as any,'validate');
    jest.spyOn(service as any,'detail').mockResolvedValue({id:'existing'});
    return {service,query,db,scope,validate};
  }
  it('replays only after current authorization and bypasses expired date/preview validation',async()=>{
    const payload={title:'Original',audiencePreviewId:randomUUID()};const f=replay(calendarCreateFingerprint(payload));
    await expect(f.service.createEvent(user,{...payload,creationKey:key} as any)).resolves.toEqual({id:'existing'});
    expect(f.scope).toHaveBeenCalledWith(user,payload,expect.anything());expect(f.validate).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql])=>sql.includes('calendar_event_revisions'))).toBe(false);
    f.scope.mockRejectedValueOnce(new Error('account suspended'));
    await expect(f.service.createEvent(user,{...payload,creationKey:key} as any)).rejects.toThrow('account suspended');
  });
  it('rejects conflicting reuse without touching event side effects',async()=>{
    const f=replay(calendarCreateFingerprint({title:'Original'}));
    await expect(f.service.createEvent(user,{title:'Changed',creationKey:key} as any)).rejects.toBeInstanceOf(ConflictException);
    expect(f.validate).not.toHaveBeenCalled();expect(f.db.transaction).toHaveBeenCalledTimes(1);
  });
  it('restarts the complete transaction on serialization failure with a bounded limit',async()=>{
    const payload={title:'Original'},f=replay(calendarCreateFingerprint(payload));
    f.db.transaction.mockRejectedValueOnce(Object.assign(new Error('serialization'),{code:'40001'}));
    await expect(f.service.createEvent(user,{...payload,creationKey:key} as any)).resolves.toEqual({id:'existing'});
    expect(f.db.transaction).toHaveBeenCalledTimes(2);
    f.db.transaction.mockReset().mockRejectedValue(Object.assign(new Error('serialization'),{code:'40001'}));
    await expect(f.service.createEvent(user,{...payload,creationKey:key} as any)).rejects.toThrow('Concurrent change');
    expect(f.db.transaction).toHaveBeenCalledTimes(3);
  });
  it('a permanent close prevents replaying creation with the old key',async()=>{
    const payload={title:'Original'},f=replay(calendarCreateFingerprint(payload));
    f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('INSERT INTO calendar_create_receipts')?[]:
      sql.includes('SELECT payload_hash')?[{payload_hash:calendarCreateFingerprint(payload),event_id:null,abandoned:true}]:[]}));
    await expect(f.service.createEvent(user,{...payload,creationKey:key} as any)).rejects.toThrow('permanently closed');
    expect(f.validate).not.toHaveBeenCalled();
  });
  function resolution(rows:any[],inserted=false){
    const query=jest.fn(async(sql:string)=>({rows:sql.includes('INSERT INTO calendar_create_receipts')?(inserted?[{creation_key:key}]:[]):
      sql.includes('SELECT payload_hash')?rows:sql.includes('SELECT id FROM calendar_events')?[{id:'owned-event'}]:[]}));
    const db={transaction:jest.fn(async(run:any)=>run({query}))};
    const service=new CalendarService(db as any,{recordCreationClosure:jest.fn().mockResolvedValue({})} as any,{} as any,{} as any);
    jest.spyOn(service as any,'actor').mockResolvedValue({});
    return {service,query,db};
  }
  it('reserves a permanent terminal close after current-account authorization',async()=>{
    const f=resolution([],true);
    await expect(f.service.resolveCreation(user,{creationKey:key} as any)).resolves.toEqual({outcome:'ABANDONED'});
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining('TRUE'),[user,key,calendarCreateFingerprint({})]);
    expect(f.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO calendar_events'))).toBe(false);
  });
  it('recovers an owned committed ID with a key-only request and rejects conflicting full payloads',async()=>{
    const f=resolution([{payload_hash:calendarCreateFingerprint({title:'Original'}),event_id:'owned-event',abandoned:false}]);
    await expect(f.service.resolveCreation(user,{creationKey:key} as any)).resolves.toEqual({outcome:'CREATED',eventId:'owned-event'});
    await expect(f.service.resolveCreation(user,{creationKey:key,title:'Different'} as any)).rejects.toThrow('another payload');
    await expect(f.service.resolveCreation(user,{} as any)).rejects.toThrow('creation key');
  });
  it('repeats terminal resolution without work and bounds resolution serialization retries',async()=>{
    const f=resolution([{payload_hash:calendarCreateFingerprint({}),abandoned:true}]);
    f.db.transaction.mockRejectedValueOnce(Object.assign(new Error('serialization'),{code:'40001'}));
    await expect(f.service.resolveCreation(user,{creationKey:key} as any)).resolves.toEqual({outcome:'ABANDONED'});
    expect(f.db.transaction).toHaveBeenCalledTimes(2);
    await expect(f.service.resolveCreation(user,{creationKey:key,title:'Original full intent'})).resolves.toEqual({outcome:'ABANDONED'});
    f.db.transaction.mockReset().mockRejectedValue(Object.assign(new Error('deadlock'),{code:'40P01'}));
    await expect(f.service.resolveCreation(user,{creationKey:key} as any)).rejects.toThrow('Concurrent change');
    expect(f.db.transaction).toHaveBeenCalledTimes(3);
  });

});
