import { auditRecordHash, canonicalAuditJson } from '../src/database/repositories/audit.repository';
import { AuditAction } from '@kashyap/contracts';
describe('Canonical persisted audit digests',()=>{
 const record={id:'record',action:AuditAction.LOGIN,entity_type:'test',entity_id:'fixture',created_at:'2026-01-01T00:00:00.000Z',prev_record_hash:'0'.repeat(64),hash_version:2};
 it('retains false, zero and array ordering while ignoring JSON object key order',()=>{
  expect(canonicalAuditJson({z:false,a:[0,null]})).toBe('{"a":[0,null],"z":false}');
  expect(auditRecordHash({...record,new_value:{z:false,a:{z:0,a:1}}})).toBe(auditRecordHash({...record,new_value:{a:{a:1,z:0},z:false}}));
  expect(auditRecordHash({...record,new_value:false})).not.toBe(auditRecordHash({...record,new_value:null}));
  expect(auditRecordHash({...record,new_value:[1,2]})).not.toBe(auditRecordHash({...record,new_value:[2,1]}));
 });
 it('detects actor role, event identity, address, agent and timestamp changes',()=>{
  const original={...record,actor_role:'MEMBER',ip_address:'127.0.0.1',user_agent:'fixture'};
  for(const update of [{actor_role:'SUPER_ADMIN'},{id:'another'},{ip_address:'127.0.0.2'},{user_agent:'changed'},{created_at:'2026-01-02T00:00:00.000Z'}])expect(auditRecordHash({...original,...update})).not.toBe(auditRecordHash(original));
 });
});
