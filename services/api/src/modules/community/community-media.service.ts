import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { MediaStorageService } from '../../media/media-storage.service';
import { ImageProcessorService } from '../../media/image-processor.service';
import { ImageDerivativesService } from '../../media/image-derivatives.service';
import { MalwareScannerService } from '../profile/malware-scanner.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { decodeChatAttachment } from '../chat/chat-attachments.service';
import { CommunityService } from './community.service';
import { allowedFields, canModerate, textField, uuid } from './community-policy';

@Injectable()
export class CommunityMediaService {
 constructor(private readonly db:DatabaseService,private readonly community:CommunityService,private readonly audit:AuditOutboxRepository,
  private readonly storage:MediaStorageService,private readonly scanner:MalwareScannerService,private readonly processor:ImageProcessorService,private readonly images:ImageDerivativesService){}
 private async author(id:string,user:AuthenticatedUser,client:any){
  const account=(await client.query('SELECT is_active,is_suspended,deleted_at FROM user_accounts WHERE id=$1 FOR NO KEY UPDATE',[user.id])).rows[0];
  if(!account?.is_active||account.is_suspended||account.deleted_at)throw new ForbiddenException('Active account required');
  const post=await this.community.visiblePost(id,user,client);
  if(post.author_user_id!==user.id)throw new ForbiddenException('Only the author may change post media');
  if(post.category==='ANNOUNCEMENT'&&!canModerate(user,post.branch_id))throw new ForbiddenException('Announcement authority required');
  return post;
 }
 private async replay(id:string,input:any,client:any){
  const row=(await client.query(`SELECT m.*,a.sha256_checksum,a.mime_type FROM community_post_media m JOIN media_assets a ON a.id=m.asset_id
   WHERE m.post_id=$1 AND m.client_upload_id=$2`,[id,input.clientMessageId])).rows[0];
  if(!row)return null;
  if(row.sha256_checksum!==input.checksum||row.mime_type!==input.mimeType||row.submitted_version!==input.version||row.change_reason!==input.content)throw new ConflictException('Upload retry must keep the original file and version');
  return {assetId:row.asset_id,alreadyUploaded:true};
 }
 async upload(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','reason','clientUploadId','mimeType','dataBase64']);
  if(!Number.isSafeInteger(body.version)||body.version<1)throw new BadRequestException('Invalid version');
  const reason=textField(body.reason,'Media change reason',1000,5);
  if(!['image/png','image/jpeg','image/webp'].includes(body.mimeType))throw new BadRequestException('Choose PNG, JPEG or WebP up to 5 MB');
  const input={...decodeChatAttachment({content:reason,clientMessageId:body.clientUploadId,mimeType:body.mimeType,dataBase64:body.dataBase64}),version:body.version};
  const check=async(client:any)=>{
   const post=await this.author(id,user,client),replay=await this.replay(id,input,client);if(replay)return {post,replay};
   if(post.version!==body.version)throw new ConflictException('Post changed; reload before uploading');
   if((await client.query('SELECT asset_id FROM community_post_media WHERE post_id=$1 AND removed_at IS NULL',[id])).rows.length)throw new ConflictException('Remove the current image before adding another');
   return {post,replay:null};
  };
  const previous=await this.db.transaction(check);if(previous.replay)return previous.replay;
  const assetId=randomUUID(),fileName=`community_${assetId}.${input.mimeType==='image/jpeg'?'jpg':input.mimeType==='image/png'?'png':'webp'}`;
  const scan=await this.scanner.scanFile(input.buffer,fileName);
  if(scan.status==='INFECTED')throw new BadRequestException('Image rejected by malware scanning');
  if(scan.status!=='CLEAN')throw new ServiceUnavailableException('Image scanner unavailable; nothing was uploaded');
  await this.processor.inspect(input.buffer,input.mimeType);
  const location=await this.storage.put('private-community',fileName,input.buffer,input.mimeType,user.id);
  const candidate={bucket:'private-community',file_name:fileName,storage_key:fileName,storage_path:location};
  let linked=false;
  try{
   const result=await this.db.transaction(async client=>{
    const state=await check(client);if(state.replay)return state.replay;
    await client.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,quarantine_status,retention_status,storage_path,scan_evidence)
     VALUES($1,$2,$3,'private-community',$3,$4,$5,$6,TRUE,'CLEAN','ACTIVE',$7,$8)`,[assetId,user.id,fileName,input.mimeType,input.buffer.length,input.checksum,location,JSON.stringify(scan.evidence)]);
    await client.query('INSERT INTO community_post_media(asset_id,post_id,client_upload_id,submitted_version,change_reason) VALUES($1,$2,$3,$4,$5)',[assetId,id,input.clientMessageId,body.version,reason]);
    await this.images.enqueue(client,assetId);
    const version=await this.changed(state.post,user,reason,client,'COMMUNITY_MEDIA_ADDED',assetId);
    linked=true;return {assetId,version};
   });
   if(!linked)await this.storage.remove(candidate).catch(()=>{});return result;
  }catch(error){
   // An uncertain COMMIT must not delete possibly linked bytes.
   try{if(!(await this.db.query('SELECT id FROM media_assets WHERE id=$1',[assetId])).rows.length)await this.storage.remove(candidate).catch(()=>{});}catch{}
   throw error;
  }
 }
 private async changed(post:any,user:AuthenticatedUser,reason:string,client:any,action:string,assetId:string){
  const updated=(await client.query("UPDATE community_posts SET status='PENDING',version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *",[post.id])).rows[0];
  await client.query("UPDATE community_post_appeals SET status='WITHDRAWN',resolved_at=NOW() WHERE post_id=$1 AND status='OPEN'",[post.id]);
  await this.community.saveRevision(updated,user.id,reason,client);
  await this.audit.recordAuditIntent({action,entityType:'community_post',entityId:post.id,actorId:user.id,oldValue:{version:post.version,status:post.status},newValue:{version:updated.version,status:'PENDING',assetId,reason}},client);
  return updated.version;
 }
 async remove(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','reason']);const reason=textField(body.reason,'Media change reason',1000,5);
  if(!Number.isSafeInteger(body.version)||body.version<1)throw new BadRequestException('Invalid version');
  return this.db.transaction(async client=>{
   const post=await this.author(id,user,client);if(post.version!==body.version)throw new ConflictException('Post changed; reload before removing');
   const row=(await client.query('UPDATE community_post_media SET removed_at=NOW() WHERE post_id=$1 AND removed_at IS NULL RETURNING asset_id',[id])).rows[0];
   if(!row)throw new NotFoundException('No current image');
   return {version:await this.changed(post,user,reason,client,'COMMUNITY_MEDIA_REMOVED',row.asset_id)};
  });
 }
 async download(id:string,assetId:string,user:AuthenticatedUser,variant='display'){
  uuid(assetId,'asset');
  return this.db.transaction(async client=>{
   const post=await this.community.visiblePost(id,user,client),privateHistory=post.author_user_id===user.id||canModerate(user,post.branch_id);
   if(variant==='original'&&!privateHistory)throw new ForbiddenException('Original image requires author or moderator authority');
   const asset=(await client.query(`SELECT a.* FROM community_post_media m JOIN media_assets a ON a.id=m.asset_id
    WHERE m.post_id=$1 AND m.asset_id=$2 AND ($3 OR m.removed_at IS NULL) AND a.bucket='private-community'
    AND a.quarantine_status='CLEAN' AND a.retention_status IN ('ACTIVE','LEGAL_HOLD') FOR SHARE OF a`,[id,assetId,privateHistory])).rows[0];
   if(!asset)throw new NotFoundException('Image unavailable');
   if(variant==='original')return {buffer:await this.storage.read(asset,5*1024*1024),fileName:asset.file_name,mimeType:asset.mime_type};
   return this.images.read(asset,variant);
  });
 }
 async retry(id:string,assetId:string,user:AuthenticatedUser){
  return this.db.transaction(async client=>{
   await this.author(id,user,client);const asset=(await client.query('SELECT asset_id FROM community_post_media WHERE post_id=$1 AND asset_id=$2 AND removed_at IS NULL',[id,uuid(assetId)])).rows[0];
   if(!asset)throw new NotFoundException('Image unavailable');return this.images.retry(assetId);
  });
 }
}
