import { AuditOutboxRepository } from '../database/repositories/audit-outbox.repository';
import { Injectable, OnModuleInit, OnModuleDestroy, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MediaStorageService } from './media-storage.service';
import { ImageProcessorService, ImageCrop } from './image-processor.service';
@Injectable()
export class ImageDerivativesService implements OnModuleInit,OnModuleDestroy {
 private timer?:NodeJS.Timeout;private running?:Promise<number>;
 constructor(private readonly db:DatabaseService,private readonly storage:MediaStorageService,private readonly processor:ImageProcessorService,private readonly audit:AuditOutboxRepository){}
 onModuleInit(){if(process.env.NODE_ENV!=='test'||process.env.RUN_IMAGE_WORKER==='true'){this.timer=setInterval(()=>{if(!this.running)this.running=this.processPending().catch(()=>0).finally(()=>{this.running=undefined;});},5000);this.timer.unref();}}
 async onModuleDestroy(){if(this.timer)clearInterval(this.timer);await this.running;}
 async enqueue(client:PoolClient,sourceId:string,crop:ImageCrop|null=null){await client.query('INSERT INTO media_image_jobs(source_asset_id,crop) VALUES($1,$2) ON CONFLICT DO NOTHING',[sourceId,crop?JSON.stringify(crop):null]);}
 async status(sourceId:string){const row=(await this.db.query('SELECT status,attempts,error_code,next_attempt_at FROM media_image_jobs WHERE source_asset_id=$1',[sourceId])).rows[0];return row?{status:row.status,attempts:row.attempts,errorCode:row.error_code,nextAttemptAt:row.next_attempt_at}:{status:'NOT_SCHEDULED'};}
 async retry(sourceId:string){const row=(await this.db.query(`INSERT INTO media_image_jobs(source_asset_id)
  SELECT id FROM media_assets WHERE id=$1 AND quarantine_status='CLEAN' AND retention_status IN ('ACTIVE','LEGAL_HOLD')
  AND mime_type IN ('image/png','image/jpeg','image/webp') AND bucket IN ('private-profiles','private-chat','private-community')
  ON CONFLICT(source_asset_id) DO UPDATE SET status='PENDING',attempts=0,error_code=NULL,next_attempt_at=NOW()
  WHERE media_image_jobs.status IN ('FAILED','PENDING') RETURNING source_asset_id`,[sourceId])).rows[0];if(!row)throw new BadRequestException('Image processing is ready or cannot be retried');return {status:'PENDING'};}

 async read(source:any,variant:string){
  if(!['thumbnail','display'].includes(variant))throw new BadRequestException('Choose original, thumbnail or display');
  const row=(await this.db.query(`SELECT a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id
   WHERE d.source_asset_id=$1 AND d.kind=$2 AND d.source_checksum=$3 AND a.quarantine_status='CLEAN'
   AND a.retention_status NOT IN ('DELETED','PURGED')`,[source.id,variant,source.sha256_checksum])).rows[0];
  if(!row)throw new ServiceUnavailableException('Image is processing; use a placeholder and retry');
  return {buffer:await this.storage.read(row,5*1024*1024),fileName:row.file_name,mimeType:row.mime_type,byteSize:row.byte_size};
 }
 async processPending(limit=2){
  let completed=0;
  for(let i=0;i<Math.min(Math.max(limit,0),10);i++){
   let sourceId:string|undefined;const candidates:any[]=[];
   try{
    const outcome=await this.db.transaction(async client=>{
     const job=(await client.query("SELECT * FROM media_image_jobs WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
     if(!job)return false;sourceId=job.source_asset_id;
     const source=(await client.query('SELECT * FROM media_assets WHERE id=$1 FOR UPDATE',[sourceId])).rows[0];
     if(!source||source.quarantine_status!=='CLEAN'||!['ACTIVE','LEGAL_HOLD'].includes(source.retention_status)){
      await client.query("UPDATE media_image_jobs SET status='CANCELLED',error_code='SOURCE_UNAVAILABLE' WHERE source_asset_id=$1",[sourceId]);return false;
     }
     const bytes=await this.storage.read(source);
     const outputs=await this.processor.generate(bytes,source.mime_type,job.crop);
     for(const output of outputs){
      const id=randomUUID(),fileName=`derivative_${id}.webp`,storagePath=await this.storage.put('private-derivatives',fileName,output.buffer,'image/webp',source.uploader_user_id);
      const candidate={id,bucket:'private-derivatives',storage_key:fileName,file_name:fileName,storage_path:storagePath};candidates.push(candidate);
      const checksum=createHash('sha256').update(output.buffer).digest('hex');
      await client.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,quarantine_status,retention_status,storage_path,scan_evidence)
       VALUES($1,$2,$3,'private-derivatives',$3,'image/webp',$4,$5,true,'CLEAN',$6,$7,$8)`,[id,source.uploader_user_id,fileName,output.buffer.length,checksum,source.retention_status,storagePath,JSON.stringify({derivedFrom:sourceId,sourceScan:'CLEAN',processor:'sharp-0.35.5'})]);
      await client.query('INSERT INTO media_derivatives(source_asset_id,kind,asset_id,width,height,source_checksum,transform) VALUES($1,$2,$3,$4,$5,$6,$7)',[sourceId,output.kind,id,output.width,output.height,source.sha256_checksum,JSON.stringify({version:1,processor:'sharp-0.35.5',autoOrient:true,stripMetadata:true,crop:job.crop,format:'webp',quality:output.kind==='thumbnail'?75:82})]);
     }
     await this.audit.recordAuditIntent({action:'MEDIA_DERIVATIVES_CREATED',entityType:'MEDIA_ASSET',entityId:sourceId,actorId:source.uploader_user_id,actorRole:'SYSTEM',newValue:{kinds:['thumbnail','display'],sourceChecksum:source.sha256_checksum,transformVersion:1}},client);
     await client.query("UPDATE media_image_jobs SET status='READY',error_code=NULL,completed_at=NOW(),attempts=attempts+1 WHERE source_asset_id=$1",[sourceId]);return true;
    });
    if(outcome)completed++;else if(!sourceId)break;
   }catch{
    // Reconcile uncertain COMMITs before removing candidate objects.
    for(const candidate of candidates){try{const stored=await this.db.query('SELECT id FROM media_assets WHERE id=$1',[candidate.id]);if(!stored.rows.length)await this.storage.remove(candidate);}catch{}}
    if(sourceId)await this.db.query(`UPDATE media_image_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'FAILED' ELSE 'PENDING' END,
     error_code='IMAGE_PROCESSING_FAILED',next_attempt_at=NOW()+LEAST(3600,10*POWER(2,LEAST(attempts,8)))*INTERVAL '1 second'
     WHERE source_asset_id=$1 AND status='PENDING'`,[sourceId]);
   }
  }
  return completed;
 }
}
