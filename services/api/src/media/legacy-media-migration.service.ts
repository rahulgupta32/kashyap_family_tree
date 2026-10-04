import { Injectable, OnModuleInit, OnModuleDestroy, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Role } from '@kashyap/contracts';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AuditOutboxRepository } from '../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../modules/auth/decorators/current-user.decorator';
import { uuid, textField } from '../modules/community/community-policy';
import { MediaStorageService } from './media-storage.service';

@Injectable()
export class LegacyMediaMigrationService implements OnModuleInit, OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running?:Promise<number>;
 constructor(private readonly db:DatabaseService,private readonly storage:MediaStorageService,private readonly audit:AuditOutboxRepository){}
 onModuleInit(){if(process.env.NODE_ENV!=='test'||process.env.RUN_LEGACY_MEDIA_WORKER==='true'){this.timer=setInterval(()=>{if(!this.running)this.running=this.processPending().catch(()=>0).finally(()=>{this.running=undefined;});},60000);this.timer.unref();}}
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.running;}
 private async eligible(client:PoolClient,asset:any,location:string){
  return !!asset&&asset.is_private&&asset.storage_path===location&&this.storage.isLegacyLocation(asset)
   &&asset.quarantine_status==='CLEAN'&&['ACTIVE','LEGAL_HOLD'].includes(asset.retention_status)
   &&!(await client.query('SELECT id FROM media_assets WHERE storage_path=$1 AND id<>$2 LIMIT 1',[location,asset.id])).rows.length
   &&!(await client.query("SELECT id FROM media_deletion_queue WHERE asset_id=$1 AND status='PENDING' LIMIT 1",[asset.id])).rows.length;
 }
 async approve(user:AuthenticatedUser,runId:string,itemIds:unknown,reason:unknown){
  if(!user.roleAssignments?.some(r=>r.role===Role.SUPER_ADMIN&&r.branchId===null))throw new ForbiddenException('Global Super Admin required for legacy migration');
  uuid(runId);const note=textField(reason,'Migration reason',1000,5);
  if(!this.storage.canMigrateLegacy())throw new ConflictException('Configure private S3 and the mounted legacy source first');
  if(!Array.isArray(itemIds)||!itemIds.length||itemIds.length>20||new Set(itemIds).size!==itemIds.length||itemIds.some(id=>typeof id!=='string'||!/^\d{1,18}$/.test(id)))throw new BadRequestException('Select 1–20 distinct inventory item IDs');
  return this.db.transaction(async client=>{
   const run=(await client.query('SELECT * FROM media_inventory_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];
   if(!run||run.status!=='COMPLETE'||run.storage_scope!==this.storage.inventoryScope())throw new ConflictException('Completed inventory of current storage required');
   const items=(await client.query('SELECT * FROM media_inventory_items WHERE run_id=$1 AND id=ANY($2::bigint[]) ORDER BY asset_id,id',[runId,itemIds])).rows;
   if(items.length!==itemIds.length||items.some(i=>!i.asset_id||i.finding!=='LEGACY_MIGRATION_REVIEW'))throw new BadRequestException('Select verified legacy migration findings');
   let scheduled=0;const snapshots:any[]=[];
   for(const item of items){
    const owner=(await client.query('SELECT uploader_user_id FROM media_assets WHERE id=$1',[item.asset_id])).rows[0];
    if(owner?.uploader_user_id)await client.query('SELECT id FROM user_accounts WHERE id=$1 FOR NO KEY UPDATE',[owner.uploader_user_id]);
    const asset=(await client.query('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE',[item.asset_id])).rows[0];
    if(!await this.eligible(client,asset,item.observed_location))throw new ConflictException('Legacy asset changed, is shared or is pending deletion; refresh inventory');
    // Re-read at approval; the inventory observation alone is not copy authority.
    await this.storage.read(asset);
    const result=await client.query(`INSERT INTO media_legacy_migration_queue(inventory_item_id,asset_id,storage_scope,source_location,source_bucket,source_file_name,source_checksum,source_bytes,source_mime_type,approved_by,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(asset_id,source_location) DO UPDATE SET status='PENDING',attempts=0,next_attempt_at=NOW(),error_code=NULL,approved_by=EXCLUDED.approved_by,reason=EXCLUDED.reason,
      inventory_item_id=EXCLUDED.inventory_item_id,storage_scope=EXCLUDED.storage_scope,source_bucket=EXCLUDED.source_bucket,source_file_name=EXCLUDED.source_file_name,
      source_checksum=EXCLUDED.source_checksum,source_bytes=EXCLUDED.source_bytes,source_mime_type=EXCLUDED.source_mime_type
     WHERE media_legacy_migration_queue.status='REVIEW_REQUIRED'`,[item.id,asset.id,run.storage_scope,asset.storage_path,asset.bucket,asset.file_name,asset.sha256_checksum,asset.byte_size,asset.mime_type,user.id,note]);
    scheduled+=result.rowCount||0;snapshots.push({assetId:asset.id,checksum:asset.sha256_checksum,bytes:String(asset.byte_size)});
   }
   await this.audit.recordAuditIntent({action:'LEGACY_MEDIA_MIGRATION_APPROVED',entityType:'MEDIA_INVENTORY',entityId:runId,actorId:user.id,actorRole:Role.SUPER_ADMIN,newValue:{itemIds,reason:note,scheduled,snapshots}},client);
   return {scheduled};
  });
 }
 async processPending(limit=2){
  if(!this.storage.canMigrateLegacy())return 0;
  const jobs=(await this.db.query("SELECT id FROM media_legacy_migration_queue WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY created_at,id LIMIT $1",[Math.min(Math.max(limit,0),10)])).rows;let completed=0;
  for(const job of jobs){
   try{const result=await this.db.transaction(async client=>{
    // Account before asset matches account deletion; NO KEY UPDATE permits journal FK reads.
    const preview=(await client.query('SELECT q.asset_id,a.uploader_user_id FROM media_legacy_migration_queue q JOIN media_assets a ON a.id=q.asset_id WHERE q.id=$1',[job.id])).rows[0];if(!preview)return false;
    if(preview.uploader_user_id)await client.query('SELECT id FROM user_accounts WHERE id=$1 FOR NO KEY UPDATE',[preview.uploader_user_id]);
    const asset=(await client.query('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE SKIP LOCKED',[preview.asset_id])).rows[0];if(!asset)return false;
    const row=(await client.query("SELECT * FROM media_legacy_migration_queue WHERE id=$1 AND status='PENDING' FOR UPDATE SKIP LOCKED",[job.id])).rows[0];if(!row)return false;
    if(row.storage_scope!==this.storage.inventoryScope()||!await this.eligible(client,asset,row.source_location)
     ||asset.bucket!==row.source_bucket||asset.file_name!==row.source_file_name||asset.sha256_checksum!==row.source_checksum||String(asset.byte_size)!==String(row.source_bytes)||asset.mime_type!==row.source_mime_type){
     await client.query("UPDATE media_legacy_migration_queue SET status='REVIEW_REQUIRED',error_code='SOURCE_STATE_CHANGED' WHERE id=$1",[job.id]);return false;
    }
    let bytes:Buffer;
    try{bytes=await this.storage.read(asset);}catch{await client.query("UPDATE media_legacy_migration_queue SET status='REVIEW_REQUIRED',error_code='SOURCE_BYTES_REVIEW_REQUIRED' WHERE id=$1",[job.id]);return false;}
    const prefix=asset.bucket==='private-chat'?'attachment':asset.bucket==='private-derivatives'?'derivative':'avatar';
    const fileName=`${prefix}_${randomUUID()}.${asset.file_name.split('.').at(-1)}`;
    const destination=await this.storage.put(asset.bucket,fileName,bytes,asset.mime_type,asset.uploader_user_id);
    await this.storage.read({...asset,file_name:fileName,storage_key:fileName,storage_path:destination});
    await client.query('UPDATE media_assets SET file_name=$2,storage_key=$2,storage_path=$3 WHERE id=$1',[asset.id,fileName,destination]);
    await this.audit.recordAuditIntent({action:'LEGACY_MEDIA_MIGRATED',entityType:'MEDIA_ASSET',entityId:asset.id,actorId:row.approved_by,actorRole:'SYSTEM',newValue:{checksum:asset.sha256_checksum,bytes:String(asset.byte_size),sourceRetained:true}},client);
    await client.query("UPDATE media_legacy_migration_queue SET status='PROCESSED',destination_location=$2,processed_at=NOW(),error_code=NULL,attempts=attempts+1 WHERE id=$1",[job.id,destination]);return true;
   });if(result)completed++;}
   catch{
    // Uncertain/rolled-back copies stay private and journaled for inventory review.
    // Never delete a candidate after an uncertain asset commit or touch legacy sources.
    await this.db.query(`UPDATE media_legacy_migration_queue SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'REVIEW_REQUIRED' ELSE 'PENDING' END,
     error_code='MIGRATION_RETRY_REQUIRED',next_attempt_at=NOW()+LEAST(3600,30*POWER(2,LEAST(attempts,7)))*INTERVAL '1 second' WHERE id=$1 AND status='PENDING'`,[job.id]);
   }
  }
  return completed;
 }
}
