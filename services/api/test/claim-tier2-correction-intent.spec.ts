import { ClaimStatus, Role } from '@kashyap/contracts';
import { ClaimsService } from '../src/modules/claims/claims.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';

describe('Tier2 correction durable intent',()=>{
 const claim={id:'claim',claimant_user_id:'owner',target_person_id:'person',status:ClaimStatus.PENDING_TIER2,version:4};
 let service:ClaimsService,client:any,audit:any;
 beforeEach(()=>{
  client={query:jest.fn(async(sql:string)=>{
   if(sql.startsWith('SELECT * FROM profile_claims'))return{rows:[claim]};
   if(sql.startsWith('SELECT * FROM user_accounts'))return{rows:[{id:'owner',person_id:null}]};
   if(sql.startsWith('SELECT * FROM persons'))return{rows:[{id:'person',claimed_user_id:null}]};
   if(sql.includes('UPDATE profile_claims'))return{rows:[{...claim,status:ClaimStatus.CORRECTION_REQUESTED,version:5}]};
   return{rows:[]};
  })};
  audit={recordAuditIntent:jest.fn().mockResolvedValue(undefined)};
  service=new ClaimsService({transaction:(operation:any)=>operation(client)} as any,{} as any,{} as any,{} as any,{} as any,audit);
  jest.spyOn(service as any,'validateFamilyRecusal').mockResolvedValue(undefined);
  jest.spyOn(service as any,'mapToDetailDto').mockImplementation(async(row:any)=>row);
 });
 it('records actor, reason and state with the correction transaction',async()=>{
  await service.tier2Review('claim',{id:'reviewer',roles:[Role.SUPER_ADMIN]} as any,{decision:'CORRECTION_REQUESTED',notes:'Private fictional correction'});
  expect(audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({action:'CLAIM_TIER2_CORRECTION_REQUIRED',entityType:'PROFILE_CLAIM',entityId:'claim',actorId:'reviewer',oldValue:expect.objectContaining({status:ClaimStatus.PENDING_TIER2}),newValue:expect.objectContaining({status:ClaimStatus.CORRECTION_REQUESTED,notes:'Private fictional correction'})}),client);
 });
 it('propagates failed durable intent instead of reporting success',async()=>{
  audit.recordAuditIntent.mockRejectedValue(new Error('Intent unavailable'));
  await expect(service.tier2Review('claim',{id:'reviewer',roles:[Role.SUPER_ADMIN]} as any,{decision:'CORRECTION_REQUESTED',notes:'Fictional correction'})).rejects.toThrow('Intent unavailable');
 });
 it('uses workflow preference and bilingual message without private correction content',()=>{
  const action='CLAIM_TIER2_CORRECTION_REQUIRED';
  expect(notificationCategoryEnabled(action,{workflow_enabled:false})).toBe(false);
  expect(notificationCategoryEnabled(action,{})).toBe(true);
  const dispatcher=new NotificationDispatcherService({} as any);
  const message=(dispatcher as any).formatNotificationMessage(action,{new_value:{notes:'Private fictional correction'}});
  expect(message).toContain('Correction requested');expect(message).toContain('संशोधन');expect(message).not.toContain('Private fictional correction');
 });
});
