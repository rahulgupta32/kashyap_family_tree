import { PoolClient } from 'pg';
import { GenealogyImportPayload, GenealogyImportIssue } from '@kashyap/contracts';

/** Conservative conflict detection: retained corrections require explicit reconciliation. */
export async function validateImportPeers(tx:PoolClient,batchId:string,payload:GenealogyImportPayload) {
 const peers=(await tx.query(`SELECT id,source_hash,payload FROM genealogy_import_batches
  WHERE dataset_key=$1 AND branch_id=$2 AND id<>$3 ORDER BY id LIMIT 51`,
  [payload.datasetKey,payload.branchId,batchId])).rows;
 const issues:GenealogyImportIssue[]=[],keys=new Set<string>();
 const add=(entity:GenealogyImportIssue['entity'],sourceId:string,code:string)=>{
  const key=JSON.stringify([entity,sourceId,code]);if(!keys.has(key)){keys.add(key);issues.push({entity,sourceId,code});}
 };
 const peerBatches=peers.slice(0,50).map(p=>({id:p.id,sourceHash:p.source_hash}));
 const graphSources:GenealogyImportPayload[]=[];
 if(peers.length>50){add('BATCH',payload.datasetKey,'PEER_BATCH_VALIDATION_LIMIT_REACHED');return {issues,peerBatches,graphSources};}
 const personIds=new Set<string>(),targets=new Set<string>(),linkIds=new Set<string>(),unionIds=new Set<string>(),claimIds=new Set<string>();
 for(const peer of peers){
  if(!peer.payload){add('BATCH',payload.datasetKey,'PEER_SOURCE_ERASED_RECONCILIATION_REQUIRED');continue;}
  graphSources.push(peer.payload);
  for(const p of peer.payload.persons){personIds.add(p.sourceId);if(p.targetPersonId)targets.add(p.targetPersonId.toLowerCase());}
  for(const link of peer.payload.parentLinks)linkIds.add(link.sourceId);
  for(const union of peer.payload.unions||[])unionIds.add(union.sourceId);
  for(const claim of peer.payload.claims||[])claimIds.add(claim.sourceId);
 }
 for(const p of payload.persons){
  if(personIds.has(p.sourceId))add('PERSON',p.sourceId,'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED');
  if(p.targetPersonId&&targets.has(p.targetPersonId.toLowerCase()))add('PERSON',p.sourceId,'CROSS_BATCH_TARGET_MAPPING_RECONCILIATION_REQUIRED');
 }
 for(const link of payload.parentLinks)if(linkIds.has(link.sourceId))add('PARENT_LINK',link.sourceId,'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED');
 for(const union of payload.unions||[])if(unionIds.has(union.sourceId))add('UNION',union.sourceId,'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED');
 for(const claim of payload.claims||[])if(claimIds.has(claim.sourceId))add('CLAIM',claim.sourceId,'CROSS_BATCH_SOURCE_ID_RECONCILIATION_REQUIRED');
 // graphSources is transaction-local input, never part of a retained/public report.
 return {issues,peerBatches,graphSources};
}
