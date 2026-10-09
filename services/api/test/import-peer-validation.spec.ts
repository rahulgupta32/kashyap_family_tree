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
 it('does not pass when a peer source was erased',async()=>{expect((await check([peer({payload:null})]).result).issues[0].code).toBe('PEER_SOURCE_ERASED_RECONCILIATION_REQUIRED');});
 it('blocks incomplete peer inspection at the explicit limit',async()=>{const r=await check(Array(51).fill(peer())).result;expect(r.peerBatches).toHaveLength(50);expect(r.issues).toEqual([{entity:'BATCH',sourceId:'DATA',code:'PEER_BATCH_VALIDATION_LIMIT_REACHED'}]);});
 it('allows disjoint staged identities and no peers',async()=>{
  expect((await check([]).result).issues).toEqual([]);
  expect((await check([peer({payload:{persons:[{sourceId:'other'}],parentLinks:[{sourceId:'other-edge'}]}})]).result).issues).toEqual([]);
 });
});
