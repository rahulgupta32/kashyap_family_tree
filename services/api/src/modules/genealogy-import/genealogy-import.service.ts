import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { GenealogyImportBatch, GenealogyImportDetail, GenealogyImportReport, GenealogyImportRun } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { allowedFields, textField, uuid } from '../community/community-policy';
import { importHash, parseImportPayload, validateImport } from './import-validation';
import { validateTargetGraph } from './import-target-graph';
const validatorVersion='staging-2-target-graph';
const gates=['APPROVED_FIELD_MAPPING','ACCEPTED_SOURCE_EVIDENCE','BRANCH_AUTHORITY_SAMPLING','INDEPENDENT_PRIVACY_REVIEW','DUPLICATE_RECONCILIATION','TWO_ISOLATED_IMPORT_REHEARSALS','BACKUP_AND_ROLLBACK_REHEARSAL','PRODUCTION_WINDOW_APPROVAL','PROMOTION_WRITER_NOT_ENABLED'];
@Injectable()
export class GenealogyImportService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository){}
 private async authorize(userId:string,tx:PoolClient){
  const rows=(await tx.query(`SELECT u.id FROM user_accounts u JOIN user_roles r ON r.user_id=u.id AND r.role='SUPER_ADMIN'
   WHERE u.id=$1 AND u.is_active=TRUE AND u.is_phone_verified=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL FOR SHARE OF u,r`,[userId])).rows;
  if(!rows.length)throw new ForbiddenException('Current phone-verified Super Admin authority required');
 }
 private async evidence(tx:PoolClient,userId:string,id:string,action:string,data:any){await this.audit.recordAuditIntent({action,entityType:'GENEALOGY_IMPORT',entityId:id,actorId:userId,newValue:data},tx);}
 private dto(r:any):GenealogyImportBatch{return {id:r.id,datasetKey:r.dataset_key,branchId:r.branch_id,sourceHash:r.source_hash,sourceDescription:r.source_description,createdBy:r.created_by,createdAt:r.created_at,persons:r.person_count,parentLinks:r.parent_count};}
 private run(r:any):GenealogyImportRun{return {id:r.id,sequence:r.sequence,createdAt:r.created_at,actorId:r.actor_id,reason:r.reason,report:r.report};}
 private async batch(tx:PoolClient,id:string){const row=(await tx.query('SELECT * FROM genealogy_import_batches WHERE id=$1 FOR UPDATE',[uuid(id,'batch ID')])).rows[0];if(!row)throw new NotFoundException('Staged batch not found');return row;}
 async stage(userId:string,body:any):Promise<GenealogyImportBatch>{
  return this.db.transaction(async tx=>{
   await this.authorize(userId,tx);const payload=parseImportPayload(body),hash=importHash(payload);
   if(!(await tx.query('SELECT id FROM branches WHERE id=$1 FOR SHARE',[payload.branchId])).rows.length)throw new BadRequestException('Existing branch catalogue entry required');
   const inserted=(await tx.query(`INSERT INTO genealogy_import_batches(dataset_key,branch_id,source_hash,source_description,payload,created_by,person_count,parent_count)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dataset_key,source_hash) DO NOTHING RETURNING *`,[payload.datasetKey,payload.branchId,hash,payload.sourceDescription,JSON.stringify(payload),userId,payload.persons.length,payload.parentLinks.length])).rows[0];
   const row=inserted||(await tx.query('SELECT * FROM genealogy_import_batches WHERE dataset_key=$1 AND source_hash=$2 FOR SHARE',[payload.datasetKey,hash])).rows[0];
   if(!row.payload)throw new ConflictException('Source payload was erased; it cannot be restored by retry');
   await this.evidence(tx,userId,row.id,inserted?'GENEALOGY_IMPORT_STAGED':'GENEALOGY_IMPORT_STAGE_REPLAY',{sourceHash:hash,persons:payload.persons.length,parentLinks:payload.parentLinks.length});
   return this.dto(row);
  });
 }
 async list(userId:string,query:any){return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);allowedFields(query,['after']);const after=query.after===undefined?null:uuid(query.after,'batch cursor');
  const rows=(await tx.query(`SELECT id,dataset_key,branch_id,source_hash,source_description,created_by,created_at,person_count,parent_count FROM genealogy_import_batches WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51`,[after])).rows;
  for(const r of rows.slice(0,50))await this.evidence(tx,userId,r.id,'GENEALOGY_IMPORT_LIST_READ',{sourceHash:r.source_hash});
  return {items:rows.slice(0,50).map(r=>this.dto(r)),nextAfter:rows.length>50?rows[49].id:null};
 });}
 async detail(userId:string,id:string):Promise<GenealogyImportDetail>{return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);const row=await this.batch(tx,id);
  if(!row.payload)throw new ConflictException('Source payload erased; retained reports remain available');
  const runs=(await tx.query('SELECT * FROM genealogy_import_runs WHERE batch_id=$1 ORDER BY sequence DESC LIMIT 50',[id])).rows;
  await this.evidence(tx,userId,id,'GENEALOGY_IMPORT_DETAIL_READ',{sourceHash:row.source_hash});
  return {...this.dto(row),payload:row.payload,runs:runs.map(r=>this.run(r))};
 });}
 async runs(userId:string,id:string,query:any){return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);allowedFields(query,['before']);await this.batch(tx,id);
  if(query.before!==undefined&&(typeof query.before!=='string'||!/^\d{1,10}$/.test(query.before)||Number(query.before)<1||Number(query.before)>2147483647))throw new BadRequestException('Invalid report cursor');
  const rows=(await tx.query('SELECT * FROM genealogy_import_runs WHERE batch_id=$1 AND ($2::int IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT 51',[id,query.before===undefined?null:Number(query.before)])).rows;
  await this.evidence(tx,userId,id,'GENEALOGY_IMPORT_REPORTS_READ',{});
  return {items:rows.slice(0,50).map(r=>this.run(r)),nextBefore:rows.length>50?rows[49].sequence:null};
 });}
 async dryRun(userId:string,id:string,body:any):Promise<GenealogyImportRun>{return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);allowedFields(body,['sourceHash','requestKey','reason']);
  const requestKey=uuid(body.requestKey,'request key'),reason=textField(body.reason,'Dry-run reason',1000,10),row=await this.batch(tx,id);
  if(body.sourceHash!==row.source_hash)throw new ConflictException('Source changed; select and review its retained hash');
  const existing=(await tx.query('SELECT * FROM genealogy_import_runs WHERE batch_id=$1 AND request_key=$2',[id,requestKey])).rows[0];
  if(existing){if(existing.actor_id!==userId||existing.reason!==reason)throw new ConflictException('Request key already used for a different request');await this.evidence(tx,userId,id,'GENEALOGY_IMPORT_DRY_RUN_REPLAY',{runId:existing.id});return this.run(existing);}
  if(!row.payload)throw new ConflictException('Source payload erased; cannot revalidate');
  const payload=parseImportPayload(row.payload);if(importHash(payload)!==row.source_hash)throw new ConflictException('Source integrity check failed');
  const issues=validateImport(payload);let mappedTargets=0,duplicates=0;
  // One statement observes a single target snapshot; a retained report never authorizes promotion.
  const checks=(await tx.query(`SELECT s->>'sourceId' AS source_id,t.id AS target_id,t.branch_id,t.is_archived,
   (SELECT count(DISTINCT p.id) FROM persons p JOIN person_names n ON n.person_id=p.id
    WHERE p.branch_id=$2 AND p.is_archived=FALSE AND (t.id IS NULL OR p.id<>t.id)
    AND lower(btrim(regexp_replace(normalize(n.full_name,NFKC),'[[:space:]]+',' ','g')))=
     lower(btrim(regexp_replace(normalize(s->>'nameNepali',NFKC),'[[:space:]]+',' ','g')))) AS duplicates
   FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(s,ord) LEFT JOIN persons t ON t.id=(s->>'targetPersonId')::uuid ORDER BY ord`,[JSON.stringify(payload.persons),payload.branchId])).rows;
  checks.forEach((c,index)=>{const p=payload.persons[index];
   if(p.targetPersonId){if(!c.target_id)issues.push({entity:'PERSON',sourceId:p.sourceId,code:'TARGET_NOT_FOUND'});else if(c.branch_id!==payload.branchId||c.is_archived)issues.push({entity:'PERSON',sourceId:p.sourceId,code:'TARGET_INELIGIBLE'});else mappedTargets++;}
   if(Number(c.duplicates)>0){duplicates++;issues.push({entity:'PERSON',sourceId:p.sourceId,code:'TARGET_NAME_DUPLICATE_CANDIDATE'});}
  });
  issues.push(...await validateTargetGraph(tx,payload));
  const report:GenealogyImportReport={validatorVersion,sourceHash:row.source_hash,persons:payload.persons.length,parentLinks:payload.parentLinks.length,mappedTargets,unmappedPersons:payload.persons.length-mappedTargets,duplicateCandidatePersons:duplicates,issues,validationPassed:issues.length===0,promotionAllowed:false,gates:[...gates]};
  const r=(await tx.query(`INSERT INTO genealogy_import_runs(batch_id,sequence,request_key,actor_id,reason,report)
   SELECT $1,COALESCE(MAX(sequence),0)+1,$2,$3,$4,$5 FROM genealogy_import_runs WHERE batch_id=$1 RETURNING *`,[id,requestKey,userId,reason,JSON.stringify(report)])).rows[0];
  await this.evidence(tx,userId,id,'GENEALOGY_IMPORT_DRY_RUN_COMPLETED',{runId:r.id,sourceHash:row.source_hash,issues:issues.length,mappedTargets});return this.run(r);
 });}
 async erase(userId:string,id:string,body:any){return this.db.transaction(async tx=>{
  await this.authorize(userId,tx);allowedFields(body,['sourceHash','reason']);const reason=textField(body.reason,'Erasure reason',1000,10),row=await this.batch(tx,id);
  if(body.sourceHash!==row.source_hash)throw new ConflictException('Source hash must match');
  await tx.query('UPDATE genealogy_import_batches SET payload=NULL WHERE id=$1',[id]);
  await this.evidence(tx,userId,id,'GENEALOGY_IMPORT_PAYLOAD_ERASED',{sourceHash:row.source_hash,reason});return {id,sourceHash:row.source_hash,erased:true};
 });}
}
