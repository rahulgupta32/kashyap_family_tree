import { randomUUID } from 'crypto';
import { ClaimsService, claimCreationFingerprint } from '../src/modules/claims/claims.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';

describe('Permanent account-bound initial claim resolution',()=>{
 const account=randomUUID(),key=randomUUID(),person=randomUUID();
 const body=()=>({creationKey:key,targetPersonId:person,relationshipDescription:'Retained fictional intent',statementOfTruth:true});
 function fixture(options:{receipt?:any;closure?:any;user?:any;original?:any}={}){
  const query=jest.fn(async(sql:string)=>{
   if(sql.includes('FROM user_accounts'))return {rows:[options.user??{id:account,is_active:true}]};
   if(sql.includes('FROM claim_creation_receipts'))return {rows:options.receipt?[options.receipt]:[]};
   if(sql.includes('FROM claim_creation_closures'))return {rows:options.closure?[options.closure]:[]};
   if(sql.includes('FROM profile_claims WHERE id='))return {rows:[options.original??{id:person,claimant_user_id:account}]};
   return {rows:[]};
  });
  const audit={recordAuditIntent:jest.fn(async()=>{})};
  const service=new ClaimsService({transaction:(work:any)=>work({query})} as any,{} as any,{} as any,{} as any,{} as any,audit as any);
  return {service,query,audit};
 }
 it('closes an unused identity without looking up targets or assets or creating workflow records',async()=>{
  const f=fixture(),intent={...body(),evidenceAttachments:[{mediaAssetId:randomUUID(),documentType:'family_photo' as const}]};
  await expect(f.service.resolveClaimCreation(account,intent)).resolves.toEqual({outcome:'ABANDONED'});
  expect(f.query.mock.calls[0]).toEqual(['SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE',[account]]);
  expect(f.query.mock.calls).toContainEqual([expect.stringContaining('INSERT INTO claim_creation_closures'),[account,key,claimCreationFingerprint(intent)]]);
  expect(f.query.mock.calls.some(([sql])=>/FROM persons|media_assets|INSERT INTO profile_claims|workflow_state_transitions|claim_evidence_attachments/.test(sql))).toBe(false);
  expect(f.audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({action:'PROFILE_CLAIM_CREATION_ABANDONED',actorId:account,entityId:key}),expect.objectContaining({query:f.query}));
  expect(notificationCategoryEnabled('PROFILE_CLAIM_CREATION_ABANDONED',{})).toBe(false);
 });
 it('recovers an existing owned receipt first even after account linking, without closing or editing it',async()=>{
  const intent=body(),f=fixture({receipt:{claim_id:person,payload_hash:claimCreationFingerprint(intent)},user:{id:account,is_active:true,person_id:person}});
  await expect(f.service.resolveClaimCreation(account,intent)).resolves.toEqual({outcome:'CREATED',claimId:person});
  expect(f.query.mock.calls.some(([sql])=>sql.includes('claim_creation_closures')||sql.startsWith('UPDATE'))).toBe(false);
  expect(f.query).toHaveBeenCalledWith(expect.stringContaining('claimant_user_id=$2'),[person,account]);expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('returns a matching retained closure without a duplicate audit',async()=>{
  const intent=body(),f=fixture({closure:{payload_hash:claimCreationFingerprint(intent)}});
  await expect(f.service.resolveClaimCreation(account,intent)).resolves.toEqual({outcome:'ABANDONED'});
  expect(f.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it.each(['receipt','closure'])('rejects changed payload for an existing %s',async kind=>{
  const f=fixture({[kind]:{payload_hash:'different',claim_id:person}});
  await expect(f.service.resolveClaimCreation(account,body())).rejects.toMatchObject({status:409});
  expect(f.query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it.each([{is_active:false},{is_active:true,is_suspended:true},{is_active:true,deleted_at:new Date()}])('checks current account eligibility before receipts or closures %j',async user=>{
  const f=fixture({user});await expect(f.service.resolveClaimCreation(account,body())).rejects.toMatchObject({status:403});expect(f.query).toHaveBeenCalledTimes(1);
 });
 it('refuses create against its permanently closed key before any person or claim mutation',async()=>{
  const intent=body(),f=fixture({closure:{payload_hash:claimCreationFingerprint(intent)}});
  await expect(f.service.submitClaim(account,intent)).rejects.toMatchObject({status:409});
  expect(f.query.mock.calls.some(([sql])=>sql.includes('FROM persons')||sql.startsWith('INSERT'))).toBe(false);expect(f.audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('does not report a confirmed closure if audit recording fails',async()=>{
  const f=fixture();f.audit.recordAuditIntent.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(f.service.resolveClaimCreation(account,body())).rejects.toThrow('Audit unavailable');
 });
 it.each([
  {creationKey:undefined},{creationKey:'invalid'},{targetPersonId:'invalid'}, {statementOfTruth:'true'},
  {relationshipDescription:''},{relationshipDescription:'x'.repeat(2001)}, {accountId:account},
  {knownFamilyMembers:{}},{knownFamilyMembers:[null]},{knownFamilyMembers:Array(101).fill('context')},
  {evidenceAttachments:{}},{evidenceAttachments:null},{evidenceAttachments:Array(6).fill({})},
  {evidenceAttachments:[{mediaAssetId:person,documentType:'passport'}]},
  {evidenceAttachments:[{mediaAssetId:'bad',documentType:'family_photo'}]},
  {evidenceAttachments:[{mediaAssetId:person,documentType:'family_photo',extra:'untrusted'}]},
  {evidenceAttachments:[{mediaAssetId:person,documentType:'family_photo',description:'x'.repeat(1001)}]},
  {evidenceAttachments:[{mediaAssetId:person,documentType:'family_photo'},{mediaAssetId:person.toUpperCase(),documentType:'family_photo'}]},
 ])('rejects malformed resolution metadata before account access %j',async patch=>{
  const f=fixture();await expect(f.service.resolveClaimCreation(account,{...body(),...patch} as any)).rejects.toMatchObject({status:400});expect(f.query).not.toHaveBeenCalled();
 });
});
