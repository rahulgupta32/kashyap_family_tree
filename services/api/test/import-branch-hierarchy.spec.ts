import { reconcileSourceBranchHierarchy } from '../src/modules/genealogy-import/import-branch-hierarchy';

const source=(branches:any[],other:any={})=>({datasetKey:'FICTIONAL_DATASET',persons:[],parentLinks:[],branches,...other}) as any;

describe('Retained source-branch hierarchy reconciliation',()=>{
 it('resolves unique peer parents and source references while retaining review gates',()=>{
  const current=source([{sourceId:'CHILD',parentSourceId:'PARENT'}],{
   persons:[{sourceId:'PERSON-CURRENT',sourceMetadata:{branchSourceId:'PARENT'}}],
   evidenceSources:[{sourceId:'SOURCE-CURRENT',relatedBranchId:'PARENT'}],
  });
  const local:any[]=[
   {entity:'BRANCH',sourceId:'CHILD',code:'DANGLING_BRANCH_REFERENCE'},
   {entity:'PERSON',sourceId:'PERSON-CURRENT',code:'DANGLING_BRANCH_REFERENCE'},
   {entity:'SOURCE',sourceId:'SOURCE-CURRENT',code:'DANGLING_BRANCH_REFERENCE'},
   {entity:'BRANCH',sourceId:'CHILD',code:'BRANCH_SOURCE_REVIEW_REQUIRED'},
  ];
  const peer=source([{sourceId:'PARENT',nameNepali:'Private fictional parent branch'}]);
  expect(reconcileSourceBranchHierarchy(current,[peer],local)).toEqual([local[3]]);
 });
 it('detects a split cycle with current identifiers only',()=>{
  const current=source([{sourceId:'CHILD',parentSourceId:'PARENT',nameNepali:'Private current name'}]);
  const peer=source([{sourceId:'PARENT',parentSourceId:'CHILD',nameNepali:'Private peer name'}]);
  const issues=reconcileSourceBranchHierarchy(current,[peer],[{entity:'BRANCH',sourceId:'CHILD',code:'DANGLING_BRANCH_REFERENCE'}]);
  expect(issues).toEqual([{entity:'BRANCH',sourceId:'CHILD',code:'CROSS_BATCH_BRANCH_CYCLE'}]);
  expect(JSON.stringify(issues)).not.toContain('PARENT');expect(JSON.stringify(issues)).not.toContain('Private');
 });
 it('reports peer-only cycle and missing parent without disclosing peer source IDs',()=>{
  const current=source([{sourceId:'CURRENT'}]);
  const peers=[source([{sourceId:'PEER-A',parentSourceId:'PEER-B'}]),source([{sourceId:'PEER-B',parentSourceId:'PEER-A'},{sourceId:'PEER-C',parentSourceId:'MISSING'}])];
  const issues=reconcileSourceBranchHierarchy(current,peers,[]);
  expect(issues).toEqual([
   {entity:'BATCH',sourceId:current.datasetKey,code:'PEER_BRANCH_REFERENCE_RECONCILIATION_REQUIRED'},
   {entity:'BATCH',sourceId:current.datasetKey,code:'CROSS_BATCH_BRANCH_CYCLE'},
  ]);
  for(const value of ['PEER-A','PEER-B','PEER-C','MISSING'])expect(JSON.stringify(issues)).not.toContain(value);
 });
 it('never resolves ambiguous peer identities',()=>{
  const current=source([{sourceId:'CHILD',parentSourceId:'PARENT'}]);
  const peers=[source([{sourceId:'PARENT'}]),source([{sourceId:'PARENT',parentSourceId:'OTHER'}])];
  const issues=reconcileSourceBranchHierarchy(current,peers,[{entity:'BRANCH',sourceId:'CHILD',code:'DANGLING_BRANCH_REFERENCE'}]);
  expect(issues).toEqual([
   {entity:'BRANCH',sourceId:'CHILD',code:'DANGLING_BRANCH_REFERENCE'},
   {entity:'BATCH',sourceId:current.datasetKey,code:'PEER_BRANCH_ID_RECONCILIATION_REQUIRED'},
   {entity:'BATCH',sourceId:current.datasetKey,code:'PEER_BRANCH_REFERENCE_RECONCILIATION_REQUIRED'},
  ]);
 });
});
