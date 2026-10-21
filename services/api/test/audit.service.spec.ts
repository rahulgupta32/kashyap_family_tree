import { AuditService } from '../src/modules/audit/audit.service';
import { Role } from '@kashyap/contracts';
describe('Durable audit browsing permissions and safe filters',()=>{
 const db:any={query:jest.fn()},service=new AuditService(db);
 const viewer:any={roles:[Role.VERIFIED_MEMBER],roleAssignments:[]};
 beforeEach(()=>jest.clearAllMocks());
 it('denies audit browsing and operational counts to members',async()=>{
  await expect(service.listAuditLogs(viewer)).rejects.toThrow('Central audit authority');
  await expect(service.dashboard(viewer)).rejects.toThrow('Administrative dashboard');expect(db.query).not.toHaveBeenCalled();
 });
 it('limits pages and binds filter text rather than interpolating it',async()=>{
  const admin={...viewer,roles:[Role.SUPER_ADMIN]};
  await expect(service.listAuditLogs(admin,{limit:1000})).rejects.toThrow('page size');
  db.query.mockResolvedValue({rows:[]});const input="';DROP TABLE audit_logs;--";
  expect(await service.listAuditLogs(admin,{action:input})).toEqual({items:[],nextCursor:null});
  expect(db.query.mock.calls[0][0]).not.toContain(input);expect(db.query.mock.calls[0][1]).toEqual([input,51]);
  expect(db.query.mock.calls[0][0]).not.toContain('old_value');
 });
});
