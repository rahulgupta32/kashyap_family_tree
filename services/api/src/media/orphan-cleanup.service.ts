import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../database/database.service';
import { AuditOutboxRepository } from '../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../modules/auth/decorators/current-user.decorator';
import { uuid, textField } from '../modules/community/community-policy';
import { MediaStorageService } from './media-storage.service';
@Injectable()
export class OrphanCleanupService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running?:Promise<number>;
 constructor(private readonly db:DatabaseService,private readonly storage:MediaStorageService,private readonly audit:AuditOutboxRepository){}
 onModuleInit(){if(process.env.NODE_ENV!=='test'||process.env.RUN_ORPHAN_WORKER==='true'){this.timer=setInterval(()=>{if(!this.running)this.running=this.processPending().catch(()=>0).finally(()=>{this.running=undefined;});},60000);this.timer.unref();}}
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.running;}
 async approve(user:AuthenticatedUser,runId:string,itemIds:unknown,reason:unknown){
  if(!user.roleAssignments?.some(r=>r.role===Role.SUPER_ADMIN&&r.branchId===null))throw new ForbiddenException('Global Super Admin required for orphan review');
  uuid(runId);const note=textField(reason,'Cleanup reason',1000,5);
  if(!Array.isArray(itemIds)||!itemIds.length||itemIds.length>20||new Set(itemIds).size!==itemIds.length||itemIds.some(id=>typeof id!=='string'||!/^\d{1,18}$/.test(id)))throw new BadRequestException('Select 1–20 distinct inventory item IDs');
  return this.db.transaction(async client=>{
   const run=(await client.query('SELECT * FROM media_inventory_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];
   if(!run||run.status!=='COMPLETE'||run.storage_scope!==this.storage.inventoryScope())throw new ConflictException('Completed inventory of current storage required');
   const items=(await client.query('SELECT * FROM media_inventory_items WHERE run_id=$1 AND id=ANY($2::bigint[]) ORDER BY id',[runId,itemIds])).rows;
   if(items.length!==itemIds.length||items.some(i=>i.asset_id||!['ABANDONED_UPLOAD_REVIEW','CLEANUP_FENCED'].includes(i.finding)))throw new BadRequestException('Only expired journaled uploads are eligible; untracked objects require reconciliation');
   let scheduled=0;
   for(const item of items){
    const owner=(await client.query('SELECT uploader_user_id FROM media_upload_intents WHERE id=$1',[item.upload_intent_id])).rows[0];
    if(owner?.uploader_user_id)await client.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE',[owner.uploader_user_id]);
    const intent=(await client.query("SELECT * FROM media_upload_intents WHERE id=$1 AND storage_scope=$2 AND state IN ('WRITING','STORED','ABANDONED') AND expires_at<=NOW() AND created_at<=NOW()-INTERVAL '24 hours' FOR UPDATE",[item.upload_intent_id,run.storage_scope])).rows[0];
    if(intent){try{this.storage.validateLocation({bucket:intent.bucket,file_name:intent.file_name,storage_key:intent.file_name,storage_path:item.observed_location});}catch{throw new ConflictException('Upload location changed');}if(intent.object_location&&intent.object_location!==item.observed_location)throw new ConflictException('Upload version changed');}
    if(!intent)throw new ConflictException('Upload is active, linked or its location changed; refresh inventory');
    if((await client.query('SELECT id FROM media_assets WHERE storage_path=$1 OR (bucket=$2 AND file_name=$3) LIMIT 1',[item.observed_location,intent.bucket,intent.file_name])).rows.length)throw new ConflictException('Media is referenced and cannot be purged');
    if((await client.query('SELECT id FROM data_retention_records WHERE user_id=$1 AND released_at IS NULL LIMIT 1',[intent.uploader_user_id])).rows.length)throw new ConflictException('Uploader has an unreleased legal hold');
    await client.query("UPDATE media_upload_intents SET state='ABANDONED' WHERE id=$1",[intent.id]);
    const result=await client.query(`INSERT INTO media_orphan_deletion_queue(inventory_item_id,intent_id,object_location,approved_by,reason) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(object_location) DO UPDATE SET status='PENDING',attempts=0,next_attempt_at=NOW(),error_code=NULL,approved_by=EXCLUDED.approved_by,reason=EXCLUDED.reason
     WHERE media_orphan_deletion_queue.status='REVIEW_REQUIRED'`,[item.id,intent.id,item.observed_location,user.id,note]);scheduled+=result.rowCount||0;
   }
   await this.audit.recordAuditIntent({action:'ORPHAN_CLEANUP_APPROVED',entityType:'MEDIA_INVENTORY',entityId:runId,actorId:user.id,actorRole:Role.SUPER_ADMIN,newValue:{itemIds,reason:note,scheduled}},client);return {scheduled};
  });
 }
 async processPending(limit=5){
  const jobs=(await this.db.query("SELECT id FROM media_orphan_deletion_queue WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY created_at,id LIMIT $1",[Math.min(Math.max(limit,0),20)])).rows;let completed=0;
  for(const job of jobs){
   try{const result=await this.db.transaction(async client=>{
    const preview=(await client.query('SELECT u.uploader_user_id FROM media_orphan_deletion_queue q JOIN media_upload_intents u ON u.id=q.intent_id WHERE q.id=$1',[job.id])).rows[0];
    if(preview?.uploader_user_id)await client.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE',[preview.uploader_user_id]);
    const row=(await client.query(`SELECT q.*,u.bucket,u.file_name,u.byte_size,u.sha256_checksum,u.state,u.storage_scope,u.uploader_user_id FROM media_orphan_deletion_queue q JOIN media_upload_intents u ON u.id=q.intent_id WHERE q.id=$1 AND q.status='PENDING' FOR UPDATE OF q,u SKIP LOCKED`,[job.id])).rows[0];if(!row)return false;
    if(row.state!=='ABANDONED'||row.storage_scope!==this.storage.inventoryScope()||(await client.query('SELECT id FROM data_retention_records WHERE user_id=$1 AND released_at IS NULL LIMIT 1',[row.uploader_user_id])).rows.length||(await client.query('SELECT id FROM media_assets WHERE storage_path=$1 OR (bucket=$2 AND file_name=$3) LIMIT 1',[row.object_location,row.bucket,row.file_name])).rows.length){await client.query("UPDATE media_orphan_deletion_queue SET status='REVIEW_REQUIRED',error_code='CURRENT_STATE_PROTECTED' WHERE id=$1",[job.id]);return false;}
    const candidate={bucket:row.bucket,file_name:row.file_name,storage_key:row.file_name,storage_path:row.object_location,byte_size:row.byte_size,sha256_checksum:row.sha256_checksum};
    let absent=false;
    try{await this.storage.read(candidate);}catch(error:any){if(error?.status===404)absent=true;else if(String(error?.message).includes('integrity')||String(error?.message).includes('Invalid media location')){await client.query("UPDATE media_orphan_deletion_queue SET status='REVIEW_REQUIRED',error_code='INTEGRITY_REVIEW_REQUIRED' WHERE id=$1",[job.id]);return false;}else throw error;}
    if(!absent)await this.storage.remove(candidate);
    await this.audit.recordAuditIntent({action:'ORPHAN_CLEANUP_COMPLETED',entityType:'MEDIA_ORPHAN_CLEANUP',entityId:job.id,actorId:row.approved_by,actorRole:'SYSTEM',newValue:{intentId:row.intent_id,alreadyAbsent:absent}},client);
    await client.query("UPDATE media_orphan_deletion_queue SET status='PROCESSED',processed_at=NOW(),error_code=NULL,attempts=attempts+1 WHERE id=$1",[job.id]);return true;
   });if(result)completed++;}
   catch{await this.db.query(`UPDATE media_orphan_deletion_queue SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'REVIEW_REQUIRED' ELSE 'PENDING' END,error_code='CLEANUP_RETRY_REQUIRED',next_attempt_at=NOW()+LEAST(3600,30*POWER(2,LEAST(attempts,7)))*INTERVAL '1 second' WHERE id=$1 AND status='PENDING'`,[job.id]);}
  }
  return completed;
 }
}
