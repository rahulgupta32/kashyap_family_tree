import { randomUUID } from 'crypto';
import { directParticipantsEligible, eligibleDirectConversationIds } from '../src/modules/chat/direct-chat-safety';
import { PrivacyEngineService } from '../src/modules/genealogy/privacy/privacy-engine.service';

describe('Current direct-chat adult eligibility',()=>{
 const first=randomUUID(),second=randomUUID(),conversation=randomUUID();
 const adult=(account_id:string)=>({id:randomUUID(),account_id,is_claimed:true,claimed_user_id:account_id,
  account_verified:true,account_active:true,account_suspended:false,account_deleted:null,
  living_status:'LIVING',birth_year_bs:2040,birth_date_bs:null,is_minor_protected:false,is_archived:false});
 let db:any;
 beforeEach(()=>{db={query:jest.fn()};jest.spyOn(PrivacyEngineService.prototype,'getCurrentBsDate').mockReturnValue({year:2083,month:6,day:27});});
 afterEach(()=>jest.restoreAllMocks());
 it('permits two currently linked claimed adults and locks their current links/ages during mutations',async()=>{
  db.query.mockResolvedValue({rows:[adult(first),adult(second)]});
  const tx:any={};expect(await directParticipantsEligible(db,[first,second],tx)).toBe(true);
  expect(db.query.mock.calls[0][0]).toContain('FOR SHARE OF u,person');expect(db.query.mock.calls[0][2]).toBe(tx);
 });
 it.each([
  {birth_year_bs:2080}, {birth_year_bs:null}, {is_minor_protected:true}, {is_archived:true},
  {id:null}, {is_claimed:false}, {claimed_user_id:randomUUID()}, {account_verified:false},
 ])('denies an ineligible participant in either direction: %j',async change=>{
  for(const reversed of [false,true]){
   const rows=[{...adult(first),...change},adult(second)];
   db.query.mockResolvedValue({rows:reversed?rows.reverse():rows});
   expect(await directParticipantsEligible(db,conversation)).toBe(false);
  }
 });
 it('keeps exact eighteenth birthday and uncertain-year rules centralized in the privacy engine',async()=>{
  const person={...adult(first),birth_year_bs:2065,birth_date_bs:'2065-06-27'};
  db.query.mockResolvedValue({rows:[person,adult(second)]});expect(await directParticipantsEligible(db,conversation)).toBe(true);
  person.birth_date_bs='2065-06-28';expect(await directParticipantsEligible(db,conversation)).toBe(false);
  person.birth_date_bs='';expect(await directParticipantsEligible(db,conversation)).toBe(false);
  person.birth_date_bs='2065-06-99';expect(await directParticipantsEligible(db,conversation)).toBe(false);
 });
 it('fails closed on absent participants and does not query an empty candidate list',async()=>{
  db.query.mockResolvedValue({rows:[adult(first)]});expect(await directParticipantsEligible(db,conversation)).toBe(false);
  db.query.mockClear();expect(await eligibleDirectConversationIds(db,first,[])).toEqual([]);expect(db.query).not.toHaveBeenCalled();
 });
 it('filters current age/account eligibility in a bounded candidate batch',async()=>{
  const allowed=randomUUID(),protectedId=randomUUID(),inactive=randomUUID(),missing=randomUUID();
  db.query.mockResolvedValue({rows:[
   ...[adult(first),adult(second)].map(p=>({...p,conversation_id:allowed})),
   ...[{...adult(first),is_minor_protected:true},adult(second)].map(p=>({...p,conversation_id:protectedId})),
   ...[{...adult(first),account_active:false},adult(second)].map(p=>({...p,conversation_id:inactive})),
   ...[{...adult(first),id:null},adult(second)].map(p=>({...p,conversation_id:missing})),
  ].sort((a,b)=>a.conversation_id.localeCompare(b.conversation_id))});
  const ids=[allowed,protectedId,inactive,missing];expect(await eligibleDirectConversationIds(db,first,ids)).toEqual([allowed]);
  expect(db.query.mock.calls[0][0]).toContain('LIMIT 500');expect(db.query.mock.calls[0][1]).toEqual([first,null,ids]);
 });
 it('scans inbox eligibility in cursor batches without retaining all profile records',async()=>{
  const ids=Array.from({length:501},()=>randomUUID()).sort();
  const rows=(selected:string[])=>selected.flatMap(id=>[adult(first),adult(second)].map(p=>({...p,conversation_id:id})));
  db.query.mockResolvedValueOnce({rows:rows(ids.slice(0,500))}).mockResolvedValueOnce({rows:rows(ids.slice(500))});
  expect(await eligibleDirectConversationIds(db,first)).toEqual(ids);
  expect(db.query).toHaveBeenCalledTimes(2);expect(db.query.mock.calls[1][1]).toEqual([first,ids[499]]);
 });
});
