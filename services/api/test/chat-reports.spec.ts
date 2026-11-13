import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { randomUUID } from 'crypto';
describe('Chat report disclosure and independent review',()=>{
 const user:any={id:randomUUID(),roles:[Role.VERIFIED_MEMBER],branchIds:[],roleAssignments:[]};
 const admin:any={...user,roles:[Role.CENTRAL_ADMIN],roleAssignments:[{role:Role.CENTRAL_ADMIN}]};
 let service:ChatService;let db:any;let client:any;let audit:any;
 beforeEach(()=>{client={query:jest.fn()};db={query:jest.fn(),transaction:jest.fn((fn:any)=>fn(client))};audit={recordAuditIntent:jest.fn()};service=new ChatService(db,audit,{} as any,{} as any);});
 it('does not disclose reports to members or branch administrators',async()=>{
  for(const actor of [user,{...user,roles:[Role.BRANCH_ADMIN],roleAssignments:[{role:Role.BRANCH_ADMIN,branchId:randomUUID()}]}])await expect(service.reviewReports(actor)).rejects.toThrow('Central moderation');
  expect(db.query).not.toHaveBeenCalled();
 });
 it('rejects identity injection before any report mutation',async()=>{
  await expect(service.reportMessage(randomUUID(),randomUUID(),user,{reason:'Spam',reporterId:user.id})).rejects.toThrow('Unexpected');
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('requires current membership and an authorized history record',async()=>{
  jest.spyOn(service,'access').mockResolvedValue({});client.query.mockResolvedValue({rows:[]});
  await expect(service.reportMessage(randomUUID(),randomUUID(),user,{reason:'Spam'})).rejects.toThrow('Visible message');
  expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('does not reopen a duplicate report',async()=>{
  jest.spyOn(service,'access').mockResolvedValue({});client.query.mockResolvedValueOnce({rows:[{id:randomUUID()}]}).mockResolvedValueOnce({rows:[]});
  await expect(service.reportMessage(randomUUID(),randomUUID(),user,{reason:'Spam'})).resolves.toEqual({alreadyReported:true});
  expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('requires another moderator for the reporter and message author',async()=>{
  client.query.mockResolvedValueOnce({rows:[{status:'OPEN',reporter_id:admin.id}]});
  await expect(service.resolveReport(randomUUID(),admin,{decision:'REMOVED',note:'Reviewed'})).rejects.toThrow('your report');
  client.query.mockResolvedValueOnce({rows:[{status:'OPEN',reporter_id:randomUUID(),message_id:randomUUID()}]}).mockResolvedValueOnce({rows:[{sender_id:admin.id}]});
  await expect(service.resolveReport(randomUUID(),admin,{decision:'REMOVED',note:'Reviewed'})).rejects.toThrow('your message');
  expect(audit.recordAuditIntent).not.toHaveBeenCalled();
 });
 it('refuses a second resolution',async()=>{
  client.query.mockResolvedValueOnce({rows:[{status:'DISMISSED'}]});
  await expect(service.resolveReport(randomUUID(),admin,{decision:'REMOVED',note:'Reviewed'})).rejects.toThrow('already resolved');
 });
});
