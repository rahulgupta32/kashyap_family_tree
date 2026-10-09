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
});
