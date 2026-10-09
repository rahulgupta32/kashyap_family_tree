import { sealImportContacts } from '../src/modules/genealogy-import/import-contact-storage';
import { validateImportPeers } from '../src/modules/genealogy-import/import-peer-validation';
const target='00000000-0000-4000-8000-000000000abc';
const payload:any={datasetKey:'DATA',branchId:'branch',persons:[{sourceId:'one',targetPersonId:target}],parentLinks:[{sourceId:'edge'}]};
const peer=(changes:any={})=>({id:'peer',source_hash:'hash',payload,...changes});
const check=(rows:any[])=>{const query=jest.fn().mockResolvedValue({rows});return {query,result:validateImportPeers({query} as any,'current',payload)};};
describe('Cross-batch source reconciliation',()=>{
 it('binds the dataset, branch and excluded batch and retains only peer hashes',async()=>{
  const {query,result}=check([peer()]);const r=await result;
  expect(query.mock.calls[0][1]).toEqual(['DATA','branch','current']);expect(r.peerBatches).toEqual([{id:'peer',sourceHash:'hash'}]);
  expect(r.issues.map(i=>i.code)).toEqual(['CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED','CROSS_BATCH_TARGET_MAPPING_RECONCILIATION_REQUIRED','CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED']);
  expect(JSON.stringify({issues:r.issues,peerBatches:r.peerBatches})).not.toContain(target);
 });
 it('deduplicates issues and matches UUIDs irrespective of casing',async()=>{
  const r=await check([peer({payload:{persons:[{sourceId:'other',targetPersonId:target.toUpperCase()}],parentLinks:[]}}),peer()]).result;
  expect(r.issues.filter(i=>i.code==='CROSS_BATCH_TARGET_MAPPING_RECONCILIATION_REQUIRED')).toHaveLength(1);
 });
 it('requires reconciliation when a historical union source ID is reused across batches',async()=>{
  const current={...payload,unions:[{sourceId:'UNI-1'}]};const query=jest.fn().mockResolvedValue({rows:[peer({payload:{persons:[],parentLinks:[],unions:[{sourceId:'UNI-1'}]}})]});
  const r=await validateImportPeers({query} as any,'current',current);expect(r.issues).toEqual([{entity:'UNION',sourceId:'UNI-1',code:'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED'}]);
 });
 it('requires reconciliation when a dispute case ID is reused across retained batches',async()=>{
  const current={...payload,claims:[{sourceId:'CASE-1'}]};const query=jest.fn().mockResolvedValue({rows:[peer({payload:{persons:[],parentLinks:[],claims:[{sourceId:'CASE-1'}]}})]});
  const r=await validateImportPeers({query} as any,'current',current);expect(r.issues).toEqual([{entity:'CLAIM',sourceId:'CASE-1',code:'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED'}]);
 });
 it('requires reconciliation for reused branch and residence identities',async()=>{
  const current={...payload,branches:[{sourceId:'BR-1'}],residences:[{sourceId:'RES-1'}]};const query=jest.fn().mockResolvedValue({rows:[peer({payload:{persons:[],parentLinks:[],branches:current.branches,residences:current.residences}})]});
  const r=await validateImportPeers({query} as any,'current',current);expect(r.issues).toEqual([{entity:'BRANCH',sourceId:'BR-1',code:'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED'},{entity:'RESIDENCE',sourceId:'RES-1',code:'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED'}]);
 });
 it('reconciles private contact IDs from encrypted peer records without exposing their values',async()=>{
  const previous=process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=Buffer.alloc(32,19).toString('base64');
  try{
   const current={...payload,privateContacts:[{sourceId:'CON-1',contactValue:'Private fictional value'}]};const query=jest.fn().mockResolvedValue({rows:[peer({payload:sealImportContacts({...current,persons:[],parentLinks:[]},'hash')})]});
   const r=await validateImportPeers({query} as any,'current',current);expect(r.issues).toEqual([{entity:'PRIVATE_CONTACT',sourceId:'CON-1',code:'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED'}]);expect(JSON.stringify(r.issues)).not.toContain('Private fictional value');
  }finally{if(previous===undefined)delete process.env.IMPORT_CONTACTS_ENCRYPTION_KEY;else process.env.IMPORT_CONTACTS_ENCRYPTION_KEY=previous;}
 });
 it('does not pass when a peer source was erased',async()=>{expect((await check([peer({payload:null})]).result).issues[0].code).toBe('PEER_SOURCE_ERASED_RECONCILIATION_REQUIRED');});
 it('blocks incomplete peer inspection at the explicit limit',async()=>{const r=await check(Array(51).fill(peer())).result;expect(r.peerBatches).toHaveLength(50);expect(r.issues).toEqual([{entity:'BATCH',sourceId:'DATA',code:'PEER_BATCH_VALIDATION_LIMIT_REACHED'}]);});
 it('allows disjoint staged identities and no peers',async()=>{
  expect((await check([]).result).issues).toEqual([]);
  expect((await check([peer({payload:{persons:[{sourceId:'other'}],parentLinks:[{sourceId:'other-edge'}]}})]).result).issues).toEqual([]);
 });
});
