import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { randomUUID } from 'crypto';
describe('Chat request identity and retry integrity',()=>{
 const user:any={id:randomUUID(),roles:[Role.VERIFIED_MEMBER],branchIds:[],roleAssignments:[]};
 const db:any={query:jest.fn(),transaction:jest.fn()},audit:any={},genealogy:any={getPersonById:jest.fn()};
 let service:ChatService;
 beforeEach(()=>{jest.clearAllMocks();service=new ChatService(db,audit,genealogy,{} as any);});
 it('rejects caller supplied sender identity',async()=>{
  await expect(service.send(randomUUID(),user,{content:'Hello',clientMessageId:randomUUID(),senderUserId:randomUUID()})).rejects.toThrow('Unexpected request fields');
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('requires a UUID retry identity and bounded content',async()=>{
  await expect(service.send(randomUUID(),user,{content:'Hello',clientMessageId:'unsafe'})).rejects.toThrow('Invalid client message');
  await expect(service.send(randomUUID(),user,{content:'x'.repeat(4001),clientMessageId:randomUUID()})).rejects.toThrow('Message must contain');
 });
 it('rejects arbitrary participant IDs on creation',async()=>{
  await expect(service.create(user,{type:'DIRECT',participantUserIds:[randomUUID()]})).rejects.toThrow('Unexpected request fields');
  expect(genealogy.getPersonById).not.toHaveBeenCalled();
 });
 it('requires verified membership for access',async()=>{
  await expect(service.access(randomUUID(),{...user,roles:[Role.REGISTERED_USER]})).rejects.toThrow('Verified community membership');
  expect(db.query).not.toHaveBeenCalled();
 });
 it('rejects nonintegral read cursors before mutation',async()=>{
  await expect(service.read(randomUUID(),user,1.5)).rejects.toThrow('Invalid read cursor');
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('rejects unbounded or malformed delivery acknowledgements before mutation',async()=>{
  for(const messageIds of [[],[user.id,user.id],['invalid'],Array.from({length:101},()=>randomUUID())]){
   await expect(service.delivered(randomUUID(),user,{messageIds})).rejects.toThrow();
  }
  await expect(service.delivered(randomUUID(),user,{messageIds:[user.id],userId:user.id})).rejects.toThrow('Unexpected request fields');
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('validates bounded distinct group selections before creating a transaction',async()=>{
  for(const ids of [[],[user.id,user.id],Array.from({length:50},()=>randomUUID())]){
   await expect(service.create(user,{type:'GROUP',title:'Fictional group',memberPersonIds:ids})).rejects.toThrow('Select 1 to 49 distinct');
  }
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('does not allow ownership to be assigned through a role mutation',async()=>{
  await expect(service.setMemberRole(randomUUID(),randomUUID(),user,{version:1,role:'OWNER'})).rejects.toThrow('ownership uses transfer');
  expect(db.transaction).not.toHaveBeenCalled();
 });
 it('rejects group settings with no editable fields',async()=>{
  await expect(service.updateGroup(randomUUID(),user,{version:1})).rejects.toThrow('Group settings are required');
  expect(db.transaction).not.toHaveBeenCalled();
 });
});
