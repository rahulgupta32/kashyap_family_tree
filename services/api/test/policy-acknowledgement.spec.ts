import { randomUUID } from 'crypto';
import { PolicyAcknowledgementService } from '../src/modules/profile/policy-acknowledgement.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';
describe('Account-bound policy acknowledgement',()=>{
 const account=randomUUID(),id=randomUUID(),hash='a'.repeat(64),body={documentId:id,contentHash:hash,accepted:true};
 function fixture(options:{active?:boolean;current?:boolean;prior?:boolean;hash?:string;insert?:boolean}={}){
  let reads=0;
  const query=jest.fn(async(sql:string)=>({rows:sql.includes('SELECT id FROM user_accounts')?(options.active===false?[]:[{id:account}]):
   sql.includes('SELECT d.id,d.content_hash')?[{id,content_hash:options.hash??hash,current:options.current!==false}]:
   sql.includes('SELECT accepted_at')?(options.prior||(options.insert===false&&++reads>1)?[{accepted_at:'original'}]:[]):
   sql.includes('INSERT INTO policy_acknowledgements')?(options.insert===false?[]:[{accepted_at:'new'}]):[]}));
  const audit={recordAuditIntent:jest.fn().mockResolvedValue({})},db={transaction:jest.fn(async(run:any)=>run({query}))};
  return {service:new PolicyAcknowledgementService(db as any,audit as any),query,audit,db};
 }
 it.each([null,{}, {...body,accepted:false},{...body,contentHash:'bad'},{...body,accountId:account}])('rejects invalid or account-injected bodies before transaction %j',async value=>{
  const f=fixture();await expect(f.service.accept(account,value)).rejects.toThrow();expect(f.db.transaction).not.toHaveBeenCalled();
 });
 it('rejects inactive account before reading policy or writing receipt',async()=>{
  const f=fixture({active:false});await expect(f.service.accept(account,body)).rejects.toThrow('Active account');expect(f.query).toHaveBeenCalledTimes(1);expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('rejects stale documents and wrong hash without recording consent',async()=>{
  for(const options of [{current:false},{hash:'b'.repeat(64)}]){const f=fixture(options);await expect(f.service.accept(account,body)).rejects.toThrow('Policy changed');expect(f.query.mock.calls.some(([sql])=>sql.includes('INSERT'))).toBe(false);}
 });
 it('retains original receipt for historical response-loss retry without new audit',async()=>{
  const f=fixture({current:false,prior:true});await expect(f.service.accept(account,body)).resolves.toEqual({documentId:id,acceptedAt:'original',current:false});expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('binds receipt and audit to authenticated account and exact hash in one transaction',async()=>{
  const f=fixture();await expect(f.service.accept(account,body)).resolves.toMatchObject({acceptedAt:'new',current:true});
  expect(f.audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({actorId:account,entityId:id,newValue:{contentHash:hash}}),expect.anything());
  expect(f.query.mock.calls.map(([sql])=>sql).join(' ')).toContain('LOCK TABLE policy_documents IN SHARE MODE');
 });
 it('returns concurrent insert winner without duplicate audit',async()=>{
  const f=fixture({insert:false});await expect(f.service.accept(account,body)).resolves.toMatchObject({acceptedAt:'original'});expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('does not acknowledge success if durable audit fails',async()=>{
  const f=fixture();f.audit.recordAuditIntent.mockRejectedValueOnce(new Error('audit outage'));await expect(f.service.accept(account,body)).rejects.toThrow('audit outage');
 });
 it('policy acknowledgement is audit-only, never a member notification',()=>expect(notificationCategoryEnabled('POLICY_ACKNOWLEDGED',{})).toBe(false));
});
