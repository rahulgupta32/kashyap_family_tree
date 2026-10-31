import { BadRequestException } from '@nestjs/common';
import { ClaimStatus, Role } from '@kashyap/contracts';
import { ClaimsService } from '../src/modules/claims/claims.service';

describe('Claim review scope and dispute input boundaries',()=>{
 let service:ClaimsService,db:any,client:any,claims:any,persons:any,users:any;
 const actor=(branchId:string|null='branch-a')=>({id:'reviewer',roles:[Role.BRANCH_VERIFIER],roleAssignments:[{role:Role.BRANCH_VERIFIER,branchId}]} as any);
 beforeEach(()=>{
  client={query:jest.fn().mockResolvedValue({rows:[{id:'claim',claimant_user_id:'owner',status:ClaimStatus.APPROVED}]})};
  db={transaction:jest.fn((operation:any)=>operation(client))};
  claims={listAll:jest.fn().mockResolvedValue([]),findById:jest.fn().mockResolvedValue({id:'claim',claimant_user_id:'owner',target_person_id:'person'}),findEvidenceByClaimId:jest.fn().mockResolvedValue([{media_asset_id:'asset'}])};
  persons={findById:jest.fn().mockResolvedValue({id:'person',branch_id:'branch-a'}),findNamesByPersonId:jest.fn().mockResolvedValue([])};
  users={findById:jest.fn().mockResolvedValue({phone_number:'+9779800000000'})};
  service=new ClaimsService(db,claims,persons,{findById:jest.fn().mockResolvedValue(null)} as any,users,{} as any);
 });
 it('denies an explicitly foreign branch filter before querying claims',async()=>{
  await expect(service.listClaims(actor(),{branchId:'branch-b'})).rejects.toMatchObject({status:403});
  expect(claims.listAll).not.toHaveBeenCalled();
 });
 it.each([null,'','  '])('denies an unscoped reviewer assignment %p',async branch=>{
  await expect(service.listClaims(actor(branch))).rejects.toMatchObject({status:403});
  expect(claims.listAll).not.toHaveBeenCalled();
 });
 it('defaults to a valid assigned branch and preserves Super Admin filtering',async()=>{
  await service.listClaims(actor());expect(claims.listAll).toHaveBeenCalledWith({branchId:'branch-a'});
  await service.listClaims({id:'super',roles:[Role.SUPER_ADMIN]} as any,{branchId:'branch-b'});
  expect(claims.listAll).toHaveBeenLastCalledWith({branchId:'branch-b'});
 });
 it('stale assignments do not widen member list or detail authority',async()=>{
  const revoked={...actor(),roles:[Role.REGISTERED_USER]};
  await service.listClaims(revoked);expect(claims.listAll).toHaveBeenCalledWith({claimantUserId:'reviewer'});
  await expect(service.getClaimById('claim',revoked)).rejects.toMatchObject({status:403});
 });
 it('null assignment cannot authorize a branchless private claim or review',async()=>{
  persons.findById.mockResolvedValue({branch_id:null});client.query.mockResolvedValue({rows:[{branch_id:null}]});
  await expect(service.getClaimById('claim',actor(null))).rejects.toMatchObject({status:403});
  await expect((service as any).validateBranchAuthority(client,actor(null),'person')).rejects.toMatchObject({status:403});
  expect(claims.findEvidenceByClaimId).not.toHaveBeenCalled();
 });
 it('foreign reviewer metadata cannot enable private evidence or phone mapping',async()=>{
  const result=await(service as any).mapToDetailDto({id:'claim',target_person_id:'person',claimant_user_id:'owner'},undefined,actor('branch-b'));
  expect(result.evidenceAttachments).toEqual([]);expect(result.claimantPhoneNumber).not.toBe('+9779800000000');
  expect(claims.findEvidenceByClaimId).not.toHaveBeenCalled();
 });
 it('preserves assigned reviewer, claimant and Super Admin detail access',async()=>{
  for(const user of [actor(),{id:'owner',roles:[Role.REGISTERED_USER]},{id:'super',roles:[Role.SUPER_ADMIN]}]){
   expect((await service.getClaimById('claim',user as any)).evidenceAttachments).toHaveLength(1);
  }
 });
 it.each([null,{}, {decision:'invalid',notes:'reason'}, {decision:'RESOLVED',notes:''},
  {decision:'DISMISSED',notes:' '},{decision:'RESOLVED',notes:123},{decision:'RESOLVED',notes:'x'.repeat(4001)},
  {decision:'RESOLVED',notes:'reason',extra:true}])('rejects malformed adjudication before any identity transaction: %p',async body=>{
  await expect(service.resolveDispute('dispute',{roles:[Role.SUPER_ADMIN]} as any,body as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it.each([null,{}, {reason:123},{reason:' '},{reason:'valid',extra:true}])('rejects malformed dispute filing before transaction: %p',async body=>{
  await expect(service.fileDispute('claim','disputant',body as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it.each([null,{},'invalid',Array(6).fill({})])('validates every supplied evidence collection before writes: %p',async evidenceAttachments=>{
  await expect(service.fileDispute('claim','disputant',{reason:'Fictional reason',evidenceAttachments} as any)).rejects.toBeInstanceOf(BadRequestException);
  expect(client.query.mock.calls.every(([sql]:[string])=>sql.startsWith('SELECT'))).toBe(true);
 });
});
