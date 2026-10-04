import { Injectable, ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PoolClient } from 'pg';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../database/database.service';
import { AuditOutboxRepository } from '../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../modules/auth/decorators/current-user.decorator';
import { uuid } from '../modules/community/community-policy';
import { MediaStorageService } from './media-storage.service';
@Injectable()
export class MediaInventoryService {
 constructor(private readonly db:DatabaseService,private readonly storage:MediaStorageService,private readonly audit:AuditOutboxRepository){}
 private authority(user:AuthenticatedUser){if(!user.roleAssignments?.some(r=>r.role===Role.SUPER_ADMIN&&r.branchId===null))throw new ForbiddenException('Global Super Admin required for media operations');}
 private async record(client:PoolClient,runId:string,finding:string,asset:any,location?:string,uploadIntentId?:string){
  const identity=asset?.id?'asset:'+asset.id:'object:'+location;
  await client.query(`INSERT INTO media_inventory_items(run_id,item_key,asset_id,finding,bucket,observed_location,upload_intent_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[runId,createHash('sha256').update(identity).digest('hex'),asset?.id||null,finding,asset?.bucket||null,location||asset?.storage_path||null,uploadIntentId||null]);
 }
 private async intent(client:PoolClient,user:AuthenticatedUser,action:string,id:string,newValue:any){await this.audit.recordAuditIntent({action,entityType:'MEDIA_INVENTORY',entityId:id,actorId:user.id,actorRole:Role.SUPER_ADMIN,newValue},client);}
 async start(user:AuthenticatedUser){this.authority(user);return this.db.transaction(async client=>{
  // Advisory lock serializes starts without relying on a check-then-insert race.
  await client.query('SELECT pg_advisory_xact_lock(260026)');
  if((await client.query("SELECT id FROM media_inventory_runs WHERE status='RUNNING'")).rows.length)throw new ConflictException('Resume or cancel the active inventory');
  const row=(await client.query('INSERT INTO media_inventory_runs(actor_id,storage_scope) VALUES($1,$2) RETURNING id,status,phase,created_at',[user.id,this.storage.inventoryScope()])).rows[0];
  await this.intent(client,user,'MEDIA_INVENTORY_STARTED',row.id,{scope:row.status});return row;
 });}
 async list(user:AuthenticatedUser){this.authority(user);return (await this.db.query('SELECT id,status,phase,created_at,completed_at FROM media_inventory_runs ORDER BY created_at DESC,id DESC LIMIT 20')).rows;}
 async report(user:AuthenticatedUser,id:string,after='0'){
  this.authority(user);uuid(id);if(!/^\d{1,18}$/.test(after))throw new BadRequestException('Invalid report cursor');
  const run=(await this.db.query('SELECT id,status,phase,created_at,completed_at FROM media_inventory_runs WHERE id=$1',[id])).rows[0];if(!run)throw new NotFoundException('Inventory not found');
  const items=(await this.db.query('SELECT i.id,i.asset_id,i.finding,i.bucket,i.item_key,q.status AS cleanup_status,q.error_code AS cleanup_error,u.byte_size AS expected_bytes,u.mime_type AS expected_type,u.sha256_checksum AS expected_checksum,u.state AS upload_state,u.expires_at AS upload_expires_at FROM media_inventory_items i LEFT JOIN media_orphan_deletion_queue q ON q.object_location=i.observed_location LEFT JOIN media_upload_intents u ON u.id=i.upload_intent_id WHERE i.run_id=$1 AND i.id>$2 ORDER BY i.id LIMIT 51',[id,after])).rows;
  const summary=(await this.db.query('SELECT finding,count(*)::int AS count FROM media_inventory_items WHERE run_id=$1 GROUP BY finding ORDER BY finding',[id])).rows;
  return {run,summary,items:items.slice(0,50),next:items.length>50?String(items[49].id):null};
 }
 private async lock(client:PoolClient,id:string){
  uuid(id);const run=(await client.query('SELECT * FROM media_inventory_runs WHERE id=$1 FOR UPDATE SKIP LOCKED',[id])).rows[0];
  if(!run)throw new ConflictException('Inventory unavailable or another page is running');
  if(run.status!=='RUNNING')throw new ConflictException('Inventory is no longer running');
  if(run.storage_scope!==this.storage.inventoryScope())throw new ConflictException('Storage configuration changed; cancel and start a new inventory');return run;
 }
 async cancel(user:AuthenticatedUser,id:string){this.authority(user);return this.db.transaction(async client=>{
  uuid(id);const run=(await client.query("UPDATE media_inventory_runs SET status='CANCELLED',completed_at=NOW() WHERE id=$1 AND status='RUNNING' RETURNING id",[id])).rows[0];if(!run)throw new ConflictException('Inventory is no longer running');
  await this.intent(client,user,'MEDIA_INVENTORY_CANCELLED',id,{});return {cancelled:true};
 });}
 async advance(user:AuthenticatedUser,id:string){this.authority(user);return this.db.transaction(async client=>{
  const run=await this.lock(client,id);
  if(run.phase==='ASSETS'){
   const assets=(await client.query('SELECT * FROM media_assets WHERE ($1::uuid IS NULL OR id>$1) AND created_at<=$2 ORDER BY id LIMIT 5',[run.last_asset_id,run.created_at])).rows;
   for(const asset of assets){
    let valid=true;try{this.storage.validateLocation(asset);}catch{valid=false;}
    if(!valid){await this.record(client,id,'LOCATION_REVIEW_REQUIRED',asset);continue;}
    let present=true;try{await this.storage.read(asset);}catch(error:any){present=false;await this.record(client,id,error?.status===404?(['DELETED','PURGED'].includes(asset.retention_status)?'BYTES_REMOVED':'BYTES_MISSING'):'INTEGRITY_OR_STORAGE_FAILURE',asset);}
    if(present)await this.record(client,id,'BYTES_VERIFIED',asset);
    if(['DELETED','PURGED'].includes(asset.retention_status)&&present){
     const queued=(await client.query("SELECT id FROM media_deletion_queue WHERE asset_id=$1 AND status='PENDING' AND storage_path=$2",[asset.id,asset.storage_path])).rows.length;
     await this.record(client,id,queued?'DELETION_PENDING':'DELETION_QUEUE_MISSING',asset);
    }
    if(present&&asset.quarantine_status==='CLEAN'&&['ACTIVE','LEGAL_HOLD'].includes(asset.retention_status)&&['private-profiles','private-chat'].includes(asset.bucket)&&['image/png','image/jpeg','image/webp'].includes(asset.mime_type)){
     if(!(await client.query('SELECT source_asset_id FROM media_image_jobs WHERE source_asset_id=$1',[asset.id])).rows.length)await this.record(client,id,'IMAGE_JOB_MISSING',asset);
    }
   }
   await client.query('UPDATE media_inventory_runs SET last_asset_id=COALESCE($2,last_asset_id),phase=$3 WHERE id=$1',[id,assets.at(-1)?.id||null,assets.length<5?'OBJECTS':'ASSETS']);
  }else{
   const page=await this.storage.inventoryPage(run.object_cursor);
   for(const object of page.objects){
    const refs=(await client.query('SELECT id,bucket FROM media_assets WHERE storage_path=$1 LIMIT 2',[object.location])).rows;
    const upload=object.managed?(await client.query('SELECT id,state,expires_at,created_at FROM media_upload_intents WHERE storage_scope=$1 AND bucket=$2 AND file_name=$3',[run.storage_scope,object.bucket,object.fileName])).rows[0]:null;
    const uploadFinding=upload?.state==='ABANDONED'?'CLEANUP_FENCED':upload&&['WRITING','STORED'].includes(upload.state)?(new Date(upload.expires_at).getTime()<=Date.now()&&new Date(upload.created_at).getTime()<=Date.now()-86400000?'ABANDONED_UPLOAD_REVIEW':'UPLOAD_PENDING'):upload?.state==='COMMITTED'?'LINKED_UPLOAD_REVIEW':null;
    const finding=!object.managed?'UNMANAGED_OBJECT':object.deleteMarker?'DELETE_MARKER':refs.length>1?'AMBIGUOUS_LOCATION':refs.length===1?'OBJECT_REFERENCED':uploadFinding|| (Date.now()-new Date(object.modifiedAt||Date.now()).getTime()<86400000?'UNREFERENCED_GRACE':'UNREFERENCED_REVIEW_REQUIRED');
    await this.record(client,id,finding,refs.length===1?refs[0]:{bucket:object.bucket},object.location,upload?.id);
   }
   await client.query("UPDATE media_inventory_runs SET object_cursor=$2,phase=$3,status=$4::varchar,completed_at=CASE WHEN $4::varchar='COMPLETE' THEN NOW() ELSE NULL END WHERE id=$1",[id,page.next?JSON.stringify(page.next):null,page.next?'OBJECTS':'COMPLETE',page.next?'RUNNING':'COMPLETE']);
  }
  await this.intent(client,user,'MEDIA_INVENTORY_PAGE_COMPLETED',id,{phase:run.phase});return {advanced:true};
 });}
 async recover(user:AuthenticatedUser,id:string,itemIds:unknown){
  this.authority(user);uuid(id);if(!Array.isArray(itemIds)||!itemIds.length||itemIds.length>20||new Set(itemIds).size!==itemIds.length||itemIds.some(i=>typeof i!=='string'||!/^\d{1,18}$/.test(i)))throw new BadRequestException('Select 1–20 distinct inventory item IDs');
  return this.db.transaction(async client=>{
   const run=(await client.query('SELECT * FROM media_inventory_runs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!run||run.status!=='COMPLETE'||run.storage_scope!==this.storage.inventoryScope())throw new ConflictException('A completed inventory of the current storage is required');
   const items=(await client.query('SELECT * FROM media_inventory_items WHERE run_id=$1 AND id=ANY($2::bigint[]) ORDER BY id',[id,itemIds])).rows;if(items.length!==itemIds.length)throw new BadRequestException('Inventory selection is invalid');
   let scheduled=0,skipped=0;
   for(const item of items){
    if(!['IMAGE_JOB_MISSING','DELETION_QUEUE_MISSING'].includes(item.finding)||!item.asset_id){skipped++;continue;}
    const asset=(await client.query('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE',[item.asset_id])).rows[0];
    if(!asset||asset.storage_path!==item.observed_location){skipped++;continue;}
    try{this.storage.validateLocation(asset);}catch{skipped++;continue;}
    if((await client.query('SELECT id FROM media_assets WHERE storage_path=$1 AND id<>$2 LIMIT 1',[asset.storage_path,asset.id])).rows.length){skipped++;continue;}
    if(item.finding==='DELETION_QUEUE_MISSING'&&['DELETED','PURGED'].includes(asset.retention_status)){
     const result=await client.query("INSERT INTO media_deletion_queue(asset_id,storage_path,status) SELECT $1,$2,'PENDING' WHERE NOT EXISTS(SELECT 1 FROM media_deletion_queue WHERE asset_id=$1 AND storage_path=$2 AND status='PENDING')",[asset.id,asset.storage_path]);scheduled+=result.rowCount||0;
    }else if(item.finding==='IMAGE_JOB_MISSING'&&asset.quarantine_status==='CLEAN'&&['ACTIVE','LEGAL_HOLD'].includes(asset.retention_status)&&['private-profiles','private-chat'].includes(asset.bucket)&&['image/png','image/jpeg','image/webp'].includes(asset.mime_type)){
     const result=await client.query('INSERT INTO media_image_jobs(source_asset_id) VALUES($1) ON CONFLICT DO NOTHING',[asset.id]);scheduled+=result.rowCount||0;
    }else{skipped++;}
   }
   await this.intent(client,user,'MEDIA_INVENTORY_RECOVERY_SCHEDULED',id,{itemIds,scheduled,skipped});return {scheduled,skipped};
  });
 }
}
