import { ForbiddenException } from '@nestjs/common';
import { MemberDisputesService } from '../src/modules/claims/member-disputes.service';
const person='00000000-0000-4000-8000-000000000031',key='00000000-0000-4000-8000-000000000032';
const actor={id:'owner',roles:[],branchIds:[],roleAssignments:[]} as any;
describe('Account-owned member dispute boundaries',()=>{
 let service:MemberDisputesService,db:any,claims:any,genealogy:any,tx:any,audit:any;
 beforeEach(()=>{
  tx={query:jest.fn().mockResolvedValue({rows:[]})};db={query:jest.fn().mockResolvedValue({rows:[]}),transaction:jest.fn((f:any)=>f(tx))};
  claims={fileDispute:jest.fn()};genealogy={getPersonById:jest.fn().mockResolvedValue({id:person})};
  audit={recordAuditIntent:jest.fn().mockResolvedValue('audit')};service=new MemberDisputesService(db,claims,genealogy,audit);
 });
 it.each([null,{}, {submissionKey:key,reason:''}, {submissionKey:key,reason:'x'.repeat(4001)},
   {submissionKey:key,reason:'valid',actorId:'other'},{submissionKey:'invalid',reason:'valid'}])('rejects malformed inputs before the transaction: %p',async body=>{
  await expect(service.submit(person,actor,body as any)).rejects.toMatchObject({status:400});expect(db.transaction).not.toHaveBeenCalled();
 });
 it('normalizes UUID retry identity before acquiring its advisory lock',async()=>{
  const retry='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';genealogy.getPersonById.mockRejectedValue(new ForbiddenException());
  await expect(service.submit(person,actor,{submissionKey:retry,reason:'Fictional reason'})).rejects.toMatchObject({status:403});
  expect(tx.query.mock.calls[0][1]).toEqual([`member-dispute:${actor.id}:${retry.toLowerCase()}`]);
 });
 it('denies an invisible target without looking up its claim identity or writing',async()=>{
  genealogy.getPersonById.mockRejectedValue(new ForbiddenException());
  await expect(service.submit(person,actor,{submissionKey:key,reason:'Fictional reason'})).rejects.toMatchObject({status:403});
  expect(claims.fileDispute).not.toHaveBeenCalled();
  expect(tx.query.mock.calls.some(([sql]:[string])=>sql.includes('FROM profile_claims'))).toBe(false);
 });
 it.each([null,{}, {reason:''},{reason:'x'.repeat(4001)},{reason:'valid',actorId:'another'}])('rejects malformed legacy requests before a transaction: %p',async body=>{
  await expect(service.submitForClaim(key,actor,body as any)).rejects.toMatchObject({status:400});
  expect(db.transaction).not.toHaveBeenCalled();expect(claims.fileDispute).not.toHaveBeenCalled();
 });
 it('does not let knowledge of a private claim UUID bypass Person visibility',async()=>{
  tx.query.mockResolvedValue({rows:[{target_person_id:person}]});genealogy.getPersonById.mockRejectedValue(new ForbiddenException());
  await expect(service.submitForClaim(key,actor,{reason:'Fictional private target'})).rejects.toMatchObject({status:403});
  expect(claims.fileDispute).not.toHaveBeenCalled();expect(tx.query).toHaveBeenCalledTimes(1);
 });
 it.each([
  {is_claimed:false,claimed_user_id:'claimant',claimant_person_id:person},
  {is_claimed:true,claimed_user_id:'new-owner',claimant_person_id:person},
  {is_claimed:true,claimed_user_id:'claimant',claimant_person_id:'another-person'},
 ])('rechecks the locked legacy Person and current claimant binding before writes: %p',async binding=>{
  tx.query.mockImplementation(async(sql:string)=>({rows:[sql.includes('FROM profile_claims')?{target_person_id:person}:binding]}));
  const persist=jest.fn();claims.fileDispute.mockImplementation(async(_id:string,_actor:string,_body:any,context:any)=>{
   await context.authorize({target_person_id:person,claimant_user_id:'claimant'},tx);persist();
  });
  await expect(service.submitForClaim(key,actor,{reason:'Fictional stale binding'})).rejects.toMatchObject({status:409});
  expect(persist).not.toHaveBeenCalled();
 });
 it('rechecks legacy visibility after the claim lock and preserves the authorized detail response',async()=>{
  tx.query.mockImplementation(async(sql:string)=>({rows:[sql.includes('FROM profile_claims')?{target_person_id:person}:{is_claimed:true,claimed_user_id:'claimant',claimant_person_id:person}]}));
  const saved={id:key,claimId:key,disputantUserId:actor.id,status:'OPEN'};
  claims.fileDispute.mockImplementation(async(_id:string,_actor:string,_body:any,context:any)=>{
   await context.authorize({target_person_id:person,claimant_user_id:'claimant'},tx);return saved;
  });
  genealogy.getPersonById.mockResolvedValueOnce({id:person}).mockRejectedValueOnce(new ForbiddenException());
  await expect(service.submitForClaim(key,actor,{reason:'Fictional changed visibility'})).rejects.toMatchObject({status:403});
  genealogy.getPersonById.mockResolvedValue({id:person});
  expect(await service.submitForClaim(key,actor,{reason:' Fictional allowed target '})).toEqual(saved);
  expect(claims.fileDispute).toHaveBeenLastCalledWith(key,actor.id,{reason:'Fictional allowed target'},expect.objectContaining({client:tx,authorize:expect.any(Function)}));
 });
 it('rejects a foreign/missing history cursor before returning any history',async()=>{
  await expect(service.list(actor,key)).rejects.toMatchObject({status:400});expect(db.query).toHaveBeenCalledTimes(1);
  expect(db.query.mock.calls[0][1]).toEqual([key,actor.id]);
 });
 it('closes an absent owned request without a target lookup and records only redacted outcome intent',async()=>{
  expect(await service.resolve(person,actor,{submissionKey:key,reason:'Private reason'})).toEqual({outcome:'ABANDONED'});
  expect(genealogy.getPersonById).not.toHaveBeenCalled();expect(claims.fileDispute).not.toHaveBeenCalled();
  expect(audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({action:'MEMBER_DISPUTE_SUBMISSION_ABANDONED',newValue:{outcome:'ABANDONED'}}),tx);
  expect(JSON.stringify(audit.recordAuditIntent.mock.calls)).not.toContain('Private reason');
 });
 it('does not report abandonment when its audit transaction fails',async()=>{
  audit.recordAuditIntent.mockRejectedValue(new Error('Fictional audit failure'));
  await expect(service.resolve(person,actor,{submissionKey:key,reason:'Private reason'})).rejects.toThrow('Fictional audit failure');
 });
 it('projects only owned dispute state, never claimant/reviewer/claim/evidence fields',async()=>{
  db.query.mockResolvedValue({rows:[{id:key,target_person_id:person,reason:'Owned reason',status:'OPEN',
    created_at:'now',updated_at:'now',claimant_user_id:'PRIVATE',claim_id:'PRIVATE',media_url:'PRIVATE'}]});
  const page=await service.list(actor);expect(page.items[0]).toMatchObject({id:key,targetPersonId:person,status:'OPEN'});
  expect(JSON.stringify(page)).not.toContain('PRIVATE');expect(db.query.mock.calls[0][1][0]).toBe(actor.id);
 });
});
