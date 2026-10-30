import { ForbiddenException } from '@nestjs/common';
import { MemberDisputesService } from '../src/modules/claims/member-disputes.service';
const person='00000000-0000-4000-8000-000000000031',key='00000000-0000-4000-8000-000000000032';
const actor={id:'owner',roles:[],branchIds:[],roleAssignments:[]} as any;
describe('Account-owned member dispute boundaries',()=>{
 let service:MemberDisputesService,db:any,claims:any,genealogy:any,tx:any;
 beforeEach(()=>{
  tx={query:jest.fn().mockResolvedValue({rows:[]})};db={query:jest.fn().mockResolvedValue({rows:[]}),transaction:jest.fn((f:any)=>f(tx))};
  claims={fileDispute:jest.fn()};genealogy={getPersonById:jest.fn().mockResolvedValue({id:person})};
  service=new MemberDisputesService(db,claims,genealogy);
 });
 it.each([null,{}, {submissionKey:key,reason:''}, {submissionKey:key,reason:'x'.repeat(4001)},
   {submissionKey:key,reason:'valid',actorId:'other'},{submissionKey:'invalid',reason:'valid'}])('rejects malformed inputs before the transaction: %p',async body=>{
  await expect(service.submit(person,actor,body as any)).rejects.toMatchObject({status:400});expect(db.transaction).not.toHaveBeenCalled();
 });
 it('denies an invisible target without looking up its claim identity or writing',async()=>{
  genealogy.getPersonById.mockRejectedValue(new ForbiddenException());
  await expect(service.submit(person,actor,{submissionKey:key,reason:'Fictional reason'})).rejects.toMatchObject({status:403});
  expect(claims.fileDispute).not.toHaveBeenCalled();
  expect(tx.query.mock.calls.some(([sql]:[string])=>sql.includes('FROM profile_claims'))).toBe(false);
 });
 it('rejects a foreign/missing history cursor before returning any history',async()=>{
  await expect(service.list(actor,key)).rejects.toMatchObject({status:400});expect(db.query).toHaveBeenCalledTimes(1);
  expect(db.query.mock.calls[0][1]).toEqual([key,actor.id]);
 });
 it('projects only owned dispute state, never claimant/reviewer/claim/evidence fields',async()=>{
  db.query.mockResolvedValue({rows:[{id:key,target_person_id:person,reason:'Owned reason',status:'OPEN',
    created_at:'now',updated_at:'now',claimant_user_id:'PRIVATE',claim_id:'PRIVATE',media_url:'PRIVATE'}]});
  const page=await service.list(actor);expect(page.items[0]).toMatchObject({id:key,targetPersonId:person,status:'OPEN'});
  expect(JSON.stringify(page)).not.toContain('PRIVATE');expect(db.query.mock.calls[0][1][0]).toBe(actor.id);
 });
});
