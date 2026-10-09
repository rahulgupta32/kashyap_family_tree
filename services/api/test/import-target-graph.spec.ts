import { validateTargetGraph } from '../src/modules/genealogy-import/import-target-graph';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const payload:any={datasetKey:'SOURCE',persons:[{sourceId:'a',targetPersonId:a},{sourceId:'b',targetPersonId:b},{sourceId:'new'}],parentLinks:[{sourceId:'edge',parentSourceId:'a',childSourceId:'new'}]};
describe('Combined import target graph validation',()=>{
 it('does not inspect live genealogy for an empty relationship overlay',async()=>{const query=jest.fn();expect(await validateTargetGraph({query} as any,{...payload,parentLinks:[]})).toEqual([]);expect(query).not.toHaveBeenCalled();});
 it('uses parameterized UUID vertices and preserves source identifiers in cycle evidence',async()=>{
  const query=jest.fn().mockResolvedValue({rows:[{root:a,node:a}]});const issues=await validateTargetGraph({query} as any,payload);
  const overlay=JSON.parse(query.mock.calls[0][1][0]);expect(overlay[0].parent).toBe(a);expect(overlay[0].child).toMatch(/^[a-f0-9-]{36}$/);expect(overlay[0].child).not.toBe(b);expect(query.mock.calls[0][1][1]).toBe(10001);
  expect(issues).toEqual([{entity:'BATCH',sourceId:'SOURCE',code:'COMBINED_TARGET_PARENT_CYCLE'},{entity:'PARENT_LINK',sourceId:'edge',code:'COMBINED_TARGET_PARENT_CYCLE'}]);expect(JSON.stringify(issues)).not.toContain(a);
 });
 it('blocks incomplete traversals rather than claiming no cycle',async()=>{const query=jest.fn().mockResolvedValue({rows:Array(10001).fill({root:a,node:b})});expect(await validateTargetGraph({query} as any,payload)).toEqual([{entity:'BATCH',sourceId:'SOURCE',code:'TARGET_GRAPH_VALIDATION_LIMIT_REACHED'}]);});
 it('deduplicates live reachability without treating a same-direction path as a cycle',async()=>{const query=jest.fn().mockResolvedValue({rows:[{root:a,node:b}]});expect(await validateTargetGraph({query} as any,payload)).toEqual([]);});
 it('connects peer target mappings but emits current source identifiers only',async()=>{
  const peer:any={persons:[{sourceId:'pa',targetPersonId:a},{sourceId:'pb',targetPersonId:b}],parentLinks:[{sourceId:'private-peer-edge',parentSourceId:'pb',childSourceId:'pa'}]};
  const current:any={...payload,parentLinks:[{sourceId:'current-edge',parentSourceId:'a',childSourceId:'b'}]};
  const query=jest.fn().mockResolvedValue({rows:[{root:a,node:a},{root:b,node:b}]});
  const issues=await validateTargetGraph({query} as any,current,[peer]);
  const overlay=JSON.parse(query.mock.calls[0][1][0]);expect(overlay.map((e:any)=>[e.parent,e.child])).toEqual([[a,b],[b,a]]);
  expect(issues.map(i=>i.sourceId)).toEqual(['SOURCE','current-edge']);expect(JSON.stringify(issues)).not.toContain('private-peer-edge');
 });
 it('keeps unmapped identical source IDs isolated across batches',async()=>{
  const source:any={persons:[{sourceId:'one'},{sourceId:'two'}],parentLinks:[{sourceId:'edge',parentSourceId:'one',childSourceId:'two'}]};
  const query=jest.fn().mockResolvedValue({rows:[]});await validateTargetGraph({query} as any,{...source,datasetKey:'DATA'},[source]);
  const overlay=JSON.parse(query.mock.calls[0][1][0]);expect(new Set(overlay.flatMap((e:any)=>[e.parent,e.child])).size).toBe(4);
 });
 it('checks peer-only relationships even when the current batch contains no links',async()=>{
  const query=jest.fn().mockResolvedValue({rows:[{root:a,node:a}]});
  const issues=await validateTargetGraph({query} as any,{...payload,parentLinks:[]},[payload]);
  expect(query).toHaveBeenCalledTimes(1);expect(issues).toEqual([{entity:'BATCH',sourceId:'SOURCE',code:'COMBINED_TARGET_PARENT_CYCLE'}]);
 });
});
