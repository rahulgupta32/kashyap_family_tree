import { randomUUID } from 'crypto';
import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { RuleType } from '@kashyap/contracts';

describe('Durable cultural proposal governance admission', () => {
 const proposer=randomUUID(),reviewer=randomUUID(),senior=randomUUID(),id=randomUUID();
 let service:CulturalRulesService,query:jest.Mock,audit:any,row:any;
 const actor=(id:string)=>({id,sessionId:randomUUID(),roles:[],roleAssignments:[]} as any);
 const proposal=()=>({ruleType:RuleType.NATA_SAINO,pathCode:'F',nepaliTerm:'परीक्षण',englishTerm:'Fictional',proposedByUserId:proposer,rationale:'Fictional evidence'});
 beforeEach(()=>{
  row={id,rule_type:RuleType.NATA_SAINO,path_code:'F',nepali_term:'परीक्षण',english_term:'Fictional',proposed_by_user_id:proposer,rationale:'Fictional evidence',status:'PROPOSED',created_at:new Date()};
  query=jest.fn(async(sql:string,params:any[])=>{
   if(sql.includes('FROM cultural_rule_proposals'))return {rows:[{...row}]};
   if(sql.includes('FROM user_sessions'))return {rows:[{id:params[0]}]};
   if(sql.includes('FROM user_accounts')||sql.includes('FROM cultural_rule_authorities'))return {rows:[{id:params[0]}]};
   if(sql.includes('INSERT INTO cultural_rule_proposals'))return {rows:[{...row}]};
   if(sql.includes('UPDATE cultural_rule_proposals'))return {rows:[{...row,status:params[1],...(sql.includes('reviewer_user_id=$3')?{reviewer_user_id:params[2],reviewer_notes:params[3],reviewed_at:new Date()}:{senior_authority_user_id:params[2],authority_comments:params[3],approved_at:new Date()})}]};
   return {rows:[]};
  });
  audit={recordAuditIntent:jest.fn(async()=>{})};
  service=new CulturalRulesService({transaction:(cb:any)=>cb({query})} as any,{} as any,audit);
 });
 it('does not trust forged actor IDs even with an authenticated account',async()=>{
  await expect(service.proposeRule(proposal(),actor(reviewer))).rejects.toThrow('Actor identity');expect(query).not.toHaveBeenCalled();
 });
 it.each([{}, {ruleType:'UNKNOWN'}, {rationale:' '}, {nepaliTerm:'x'.repeat(501)}, {extra:'untrusted'}])('rejects invalid proposal metadata %j',async patch=>{
  const body={...proposal(),...patch};if(Object.keys(patch).length===0)body.pathCode='';
  await expect(service.proposeRule(body as any,actor(proposer))).rejects.toThrow();expect(query).not.toHaveBeenCalled();
 });
 it('uses database-generated identity and transactional event/audit without activating rules',async()=>{
  expect((await service.proposeRule(proposal(),actor(proposer))).id).toBe(id);
  expect(query.mock.calls.some(([sql])=>sql.includes('INSERT INTO cultural_rule_proposal_events'))).toBe(true);
  expect(audit.recordAuditIntent).toHaveBeenCalledWith(expect.objectContaining({action:'CULTURAL_RULE_PROPOSAL_PROPOSED',entityId:id}),expect.objectContaining({query}));
  expect(query.mock.calls.some(([sql])=>sql.includes('domain_rulesets'))).toBe(false);
 });
 it('rejects self-review before any decision write',async()=>{
  await expect(service.reviewRule({ruleId:id,reviewerUserId:proposer,reviewerNotes:'Fictional',isEndorsed:true},actor(proposer))).rejects.toThrow('Separation of duties');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('requires explicit current assignment, not a privileged role supplied by the caller',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('cultural_rule_proposals')?[row]:sql.includes('FROM user_sessions')?[{id:randomUUID()}]:[]}));
  await expect(service.reviewRule({ruleId:id,reviewerUserId:reviewer,reviewerNotes:'Fictional',isEndorsed:true},{...actor(reviewer),roles:['SUPER_ADMIN']})).rejects.toThrow('Current explicit');
  expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it.each(['REVIEWED','APPROVED','REJECTED'])('does not overwrite an already decided review (%s)',async status=>{
  row.status=status;await expect(service.reviewRule({ruleId:id,reviewerUserId:reviewer,reviewerNotes:'Fictional',isEndorsed:true},actor(reviewer))).rejects.toThrow('no longer awaiting');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
 });
 it('rechecks reviewer assignment before final decision and retains three independent identities',async()=>{
  row={...row,status:'REVIEWED',reviewer_user_id:reviewer};
  await expect(service.approveRule({ruleId:id,seniorAuthorityUserId:reviewer,authorityComments:'Fictional',decision:'APPROVED'},actor(reviewer))).rejects.toThrow('independent');
  const result=await service.approveRule({ruleId:id,seniorAuthorityUserId:senior,authorityComments:'Fictional',decision:'APPROVED'},actor(senior));
  expect(result.status).toBe('APPROVED');expect(query.mock.calls).toContainEqual([expect.stringContaining('FROM cultural_rule_authorities'),[reviewer,RuleType.NATA_SAINO,'REVIEWER']]);
  expect(query.mock.calls.some(([sql])=>sql.includes('domain_rulesets'))).toBe(false);
 });
 it('requires a fresh current authenticator session even when explicit authority is present',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.includes('cultural_rule_proposals')?[row]:[]}));
  await expect(service.reviewRule({ruleId:id,reviewerUserId:reviewer,reviewerNotes:'Fictional',isEndorsed:true},actor(reviewer))).rejects.toThrow('authenticator-verified');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('propagates audit failure through the transaction instead of reporting approval',async()=>{
  audit.recordAuditIntent.mockRejectedValueOnce(new Error('audit unavailable'));
  await expect(service.proposeRule(proposal(),actor(proposer))).rejects.toThrow('audit unavailable');
 });
});
