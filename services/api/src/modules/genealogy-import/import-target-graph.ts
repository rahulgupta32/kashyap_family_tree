import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { GenealogyImportPayload, GenealogyImportIssue } from '@kashyap/contracts';

// A single statement observes existing links and the staged overlay together.
// UNION deduplicates reachable pairs, including cycles. The consumer stops at
// the explicit work bound; an incomplete traversal must never pass validation.
export async function validateTargetGraph(tx:PoolClient,payload:GenealogyImportPayload,peers:GenealogyImportPayload[]=[]):Promise<GenealogyImportIssue[]> {
 const staged=[payload,...peers].flatMap((source,index)=>{
  // Source IDs are batch-local until governed identity reconciliation is accepted.
  // Only explicit target mappings connect different batches; spelling never does.
  const ids=new Map(source.persons.map(p=>[p.sourceId,p.targetPersonId?.toLowerCase()??randomUUID()]));
  return source.parentLinks.filter(e=>ids.has(e.parentSourceId)&&ids.has(e.childSourceId))
   .map(e=>({parent:ids.get(e.parentSourceId),child:ids.get(e.childSourceId),sourceId:e.sourceId,current:index===0}));
 });
 if(!staged.length)return [];
 const limit=10000;
 const rows=(await tx.query(`WITH RECURSIVE staged AS (
   SELECT * FROM jsonb_to_recordset($1::jsonb) AS s(parent uuid,child uuid,"sourceId" text)
  ), edges AS (
   SELECT parent,child FROM staged UNION ALL SELECT parent_id,child_id FROM parent_links
  ), walk(root,node) AS (
   SELECT parent,child FROM staged
   UNION
   SELECT w.root,e.child FROM walk w JOIN edges e ON e.parent=w.node
  ) SELECT root,node FROM walk LIMIT $2`,[JSON.stringify(staged),limit+1])).rows;
 if(rows.length>limit)return [{entity:'BATCH',sourceId:payload.datasetKey,code:'TARGET_GRAPH_VALIDATION_LIMIT_REACHED'}];
 const cycles=new Set(rows.filter(r=>r.root===r.node).map(r=>r.root));
 const issues:GenealogyImportIssue[]=cycles.size?[{entity:'BATCH',sourceId:payload.datasetKey,code:'COMBINED_TARGET_PARENT_CYCLE'}]:[];
 // Report only source identifiers, never unrelated live graph identities.
 for(const e of staged)if(e.current&&cycles.has(e.parent))issues.push({entity:'PARENT_LINK',sourceId:e.sourceId,code:'COMBINED_TARGET_PARENT_CYCLE'});
 return issues;
}
