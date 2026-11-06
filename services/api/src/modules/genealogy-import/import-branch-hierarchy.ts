import { GenealogyImportIssue, GenealogyImportPayload } from '@kashyap/contracts';

/** Inspect source-only hierarchy across the retained, scoped peer snapshot. No target branch is inferred. */
export function reconcileSourceBranchHierarchy(current:GenealogyImportPayload,peers:GenealogyImportPayload[],local:GenealogyImportIssue[]){
 const currentIds=new Set((current.branches||[]).map(branch=>branch.sourceId));
 const counts=new Map<string,number>();
 const all=[current,...peers];
 for(const source of all)for(const branch of source.branches||[])counts.set(branch.sourceId,(counts.get(branch.sourceId)||0)+1);
 const unique=new Map<string,{parent?:string;current:boolean}>();
 for(const [index,source] of all.entries())for(const branch of source.branches||[])
  if(counts.get(branch.sourceId)===1)unique.set(branch.sourceId,{parent:branch.parentSourceId,current:index===0});
 const peerIds=new Set([...unique].filter(([,branch])=>!branch.current).map(([id])=>id));
 const issues:GenealogyImportIssue[]=[];
 if([...counts].some(([id,count])=>count>1&&!currentIds.has(id)))
  issues.push({entity:'BATCH',sourceId:current.datasetKey,code:'PEER_BRANCH_ID_RECONCILIATION_REQUIRED'});
 if(peers.some(source=>(source.branches||[]).some(branch=>branch.parentSourceId&&!counts.has(branch.parentSourceId))))
  issues.push({entity:'BATCH',sourceId:current.datasetKey,code:'PEER_BRANCH_REFERENCE_RECONCILIATION_REQUIRED'});
 const unresolved=local.filter(issue=>{
  if(issue.code!=='DANGLING_BRANCH_REFERENCE')return true;
  if(issue.entity==='BRANCH')return !peerIds.has(current.branches?.find(branch=>branch.sourceId===issue.sourceId)?.parentSourceId||'');
  if(issue.entity==='PERSON')return !peerIds.has(current.persons.find(person=>person.sourceId===issue.sourceId)?.sourceMetadata?.branchSourceId||'');
  if(issue.entity==='SOURCE')return !peerIds.has(current.evidenceSources?.find(source=>source.sourceId===issue.sourceId)?.relatedBranchId||'');
  return true;
 });
 // A branch has at most one parent; iterative traversal avoids recursive stack exhaustion at the 50-peer bound.
 const visited=new Set<string>();
 for(const id of unique.keys()){
  if(visited.has(id))continue;
  const path:string[]=[],onPath=new Map<string,number>();let node:string|undefined=id;
  while(node&&unique.has(node)&&!visited.has(node)){
   const start=onPath.get(node);
   if(start!==undefined){
    const cycle=path.slice(start);
    if(cycle.some(member=>!currentIds.has(member))){
     const members=cycle.filter(member=>currentIds.has(member));
     if(members.length)for(const member of members)issues.push({entity:'BRANCH',sourceId:member,code:'CROSS_BATCH_BRANCH_CYCLE'});
     else issues.push({entity:'BATCH',sourceId:current.datasetKey,code:'CROSS_BATCH_BRANCH_CYCLE'});
    }
    break;
   }
   onPath.set(node,path.length);path.push(node);
   node=unique.get(node)?.parent;
  }
  for(const member of path)visited.add(member);
 }
 return [...unresolved,...issues];
}
