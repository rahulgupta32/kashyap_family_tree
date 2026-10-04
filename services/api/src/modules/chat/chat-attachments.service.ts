import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { ChatService } from './chat.service';
import { MalwareScannerService, ScanResultStatus } from '../profile/malware-scanner.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, canModerate, member, textField, uuid } from '../community/community-policy';

const MAX_BYTES=5*1024*1024;
export function decodeChatAttachment(body:any){
 allowedFields(body,['content','clientMessageId','mimeType','dataBase64']);
 const content=textField(body.content,'Message',4000),clientMessageId=uuid(body.clientMessageId,'client message');
 if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(body.mimeType))throw new BadRequestException('Choose PNG, JPEG, WebP or PDF');
 if(typeof body.dataBase64!=='string'||body.dataBase64.length>Math.ceil(MAX_BYTES/3)*4||!body.dataBase64.length||body.dataBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64))throw new BadRequestException('Invalid or oversized attachment data');
 const buffer=Buffer.from(body.dataBase64,'base64');
 if(!buffer.length||buffer.length>MAX_BYTES||buffer.toString('base64')!==body.dataBase64)throw new BadRequestException('Invalid or oversized attachment data');
 const signatures:{[key:string]:boolean}={
  'image/png':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
  'image/jpeg':buffer[0]===255&&buffer[1]===216&&buffer[2]===255,
  'image/webp':buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP',
  'application/pdf':buffer.toString('ascii',0,5)==='%PDF-',
 };
 if(!signatures[body.mimeType])throw new BadRequestException('Attachment header does not match its declared format');
 return {content,clientMessageId,buffer,mimeType:body.mimeType as string,checksum:createHash('sha256').update(buffer).digest('hex')};
}

@Injectable()
export class ChatAttachmentsService {
 constructor(private readonly db:DatabaseService,private readonly chat:ChatService,private readonly scanner:MalwareScannerService){}
 private directory(){return path.resolve(process.env.STORAGE_PATH||path.resolve(process.cwd(),'storage/uploads'),'chat');}
 private async retry(id:string,user:AuthenticatedUser,input:ReturnType<typeof decodeChatAttachment>,client:PoolClient){
  const row=(await client.query(`SELECT m.id,m.message_text,a.sha256_checksum,a.mime_type FROM chat_messages m
   LEFT JOIN chat_message_attachments link ON link.message_id=m.id LEFT JOIN media_assets a ON a.id=link.asset_id
   WHERE m.conversation_id=$1 AND m.sender_id=$2 AND m.client_message_id=$3`,[id,user.id,input.clientMessageId])).rows[0];
  if(!row)return null;
  if(row.message_text!==input.content||row.sha256_checksum!==input.checksum||row.mime_type!==input.mimeType)throw new ConflictException('An attachment retry must keep the original content and file');
  await this.chat.send(id,user,{content:input.content,clientMessageId:input.clientMessageId},client);
  return {id:row.id,alreadySent:true};
 }
 async send(id:string,user:AuthenticatedUser,body:any){
  const input=decodeChatAttachment(body);
  const previous=await this.db.transaction(async client=>{await this.chat.access(id,user,client);return this.retry(id,user,input,client);});
  if(previous)return previous;
  const ext:{[key:string]:string}={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/pdf':'pdf'};
  const assetId=randomUUID(),fileName=`attachment_${assetId}.${ext[input.mimeType]}`;
  const scan=await this.scanner.scanFile(input.buffer,fileName);
  if(scan.status===ScanResultStatus.INFECTED)throw new BadRequestException('Attachment rejected by malware scanning');
  if(scan.status!==ScanResultStatus.CLEAN)throw new ServiceUnavailableException('Attachment scanner unavailable; nothing was sent');
  const directory=this.directory(),filePath=path.join(directory,fileName);
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  try{await fs.writeFile(filePath,input.buffer,{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')await fs.unlink(filePath).catch(()=>{});throw error;}
  let linked=false;
  try{
   const result=await this.db.transaction(async client=>{
    await this.chat.access(id,user,client);
    const replay=await this.retry(id,user,input,client);if(replay)return replay;
    const message=await this.chat.send(id,user,{content:input.content,clientMessageId:input.clientMessageId},client);
    await client.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,quarantine_status,retention_status,storage_path,scan_evidence)
     VALUES($1,$2,$3,'private-chat',$3,$4,$5,$6,TRUE,'CLEAN','ACTIVE',$7,$8)`,[assetId,user.id,fileName,input.mimeType,input.buffer.length,input.checksum,filePath,JSON.stringify(scan.evidence)]);
    await client.query('INSERT INTO chat_message_attachments(message_id,asset_id) VALUES($1,$2)',[message.id,assetId]);
    linked=true;return message;
   });
   if(!linked)await fs.unlink(filePath).catch(()=>{});
   return result;
  }catch(error){
   // A lost COMMIT acknowledgement is uncertain. Remove bytes only after a
   // separate read proves no asset was committed; otherwise retain for recovery.
   try{const stored=await this.db.query('SELECT id FROM media_assets WHERE id=$1',[assetId]);if(!stored.rows.length)await fs.unlink(filePath).catch(()=>{});}catch{}
   throw error;
  }
 }
 async download(id:string,messageId:string,user:AuthenticatedUser){
  uuid(messageId,'message');
  return this.db.transaction(async client=>{
   await this.chat.access(id,user,client);
   const row=(await client.query(`SELECT a.* FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=$3
    JOIN chat_message_attachments link ON link.message_id=m.id JOIN media_assets a ON a.id=link.asset_id
    WHERE m.conversation_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND m.sequence>p.history_from_sequence
    AND a.bucket='private-chat' AND a.quarantine_status='CLEAN' AND a.retention_status='ACTIVE'`,[id,messageId,user.id])).rows[0];
   if(!row)throw new NotFoundException('Attachment not available');
   return this.readFile(row);
  });
 }
 async downloadReported(reportId:string,user:AuthenticatedUser){
  member(user);uuid(reportId,'report');if(!canModerate(user))throw new ForbiddenException('Central moderation authority required');
  return this.db.transaction(async client=>{
   const row=(await client.query(`SELECT a.* FROM chat_message_reports r JOIN chat_messages m ON m.id=r.message_id
    JOIN chat_message_attachments link ON link.message_id=m.id JOIN media_assets a ON a.id=link.asset_id
    WHERE r.id=$1 AND m.deleted_at IS NULL AND a.bucket='private-chat' AND a.retention_status='ACTIVE' AND a.quarantine_status='CLEAN'
    FOR SHARE OF m,a`,[reportId])).rows[0];
   if(!row)throw new NotFoundException('Reported attachment not available');
   return this.readFile(row);
  });
 }
 private async readFile(row:any){
  const expected=path.join(this.directory(),row.file_name);
  if(path.dirname(expected)!==this.directory()||path.resolve(row.storage_path||'')!==expected)throw new NotFoundException('Attachment not available');
  let buffer:Buffer;try{const stat=await fs.stat(expected);if(!stat.isFile()||stat.size<1||stat.size>MAX_BYTES||stat.size!==Number(row.byte_size))throw new ServiceUnavailableException('Attachment integrity verification failed');buffer=await fs.readFile(expected);}catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new NotFoundException('Attachment not available');}
  if(buffer.length!==Number(row.byte_size)||createHash('sha256').update(buffer).digest('hex')!==row.sha256_checksum)throw new ServiceUnavailableException('Attachment integrity verification failed');
  return {buffer,mimeType:row.mime_type,fileName:row.file_name};
 }

}
