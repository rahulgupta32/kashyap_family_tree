import { ImageDerivativesService } from '../src/media/image-derivatives.service';
import { ChatAttachmentsService } from '../src/modules/chat/chat-attachments.service';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

import { ProfileService } from '../src/modules/profile/profile.service';
import { MediaStorageService } from '../src/media/media-storage.service';
import { S3Client, CreateBucketCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteBucketCommand, GetObjectCommand, PutObjectCommand, PutBucketVersioningCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
const enabled=process.env.RUN_S3_ACCEPTANCE==='true';
const s3=new S3Client({region:'us-east-1',endpoint:process.env.MEDIA_S3_ENDPOINT,forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
(enabled?describe:describe.skip)('Real private S3 and PostgreSQL media acceptance',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  if(process.env.MEDIA_STORAGE_BACKEND!=='s3'||!process.env.MEDIA_S3_BUCKET?.startsWith('kashyap-ci-'))throw new Error('Disposable S3 fixture configuration required');
  await s3.send(new CreateBucketCommand({Bucket:process.env.MEDIA_S3_BUCKET}));
  iso=await createDisposableDatabase('s3_media');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.listen(0, '127.0.0.1');
  db=module.get(DatabaseService);chat=module.get(ChatService);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('CHAT_A','परीक्षण अ','Fictional A') RETURNING id")).rows[0].id;
  otherBranch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('CHAT_B','परीक्षण ब','Fictional B') RETURNING id")).rows[0].id;
  async function user(phone:string,role:Role,b:string){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,role,b);
   const person=(await db.query("INSERT INTO persons(gender,living_status,generation,branch_id,birth_year_bs,is_claimed,claimed_user_id) VALUES('MALE','LIVING',3,$1,2040,true,$2) RETURNING id",[b,u.id])).rows[0];
   await db.query("INSERT INTO person_names(person_id,language,first_name,last_name,full_name,is_primary) VALUES($1,'en','Fictional','Participant','Fictional Participant',true)",[person.id]);
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,person.id]);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'chat-test',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,personId:person.id,sessionId:session.id,token,roles:[role],branchIds:[b],roleAssignments:[{role,branchId:b}]};
  }
  author=await user('+9779847300001',Role.BRANCH_ADMIN,branch);reader=await user('+9779847300002',Role.VERIFIED_MEMBER,branch);outsider=await user('+9779847300003',Role.BRANCH_ADMIN,otherBranch);
  group=(await chat.create(author,{type:'GROUP',title:'Fictional receipt group',memberPersonIds:[reader.personId]})).id;
  direct=(await chat.create(author,{type:'DIRECT',personId:reader.personId})).id;
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();const objects=await s3.send(new ListObjectVersionsCommand({Bucket:process.env.MEDIA_S3_BUCKET}));for(const item of [...(objects.Versions||[]),...(objects.DeleteMarkers||[])])await s3.send(new DeleteObjectCommand({Bucket:process.env.MEDIA_S3_BUCKET,Key:item.Key,VersionId:item.VersionId}));await s3.send(new DeleteBucketCommand({Bucket:process.env.MEDIA_S3_BUCKET}));s3.destroy();});
 it('stores profiles remotely, survives service recreation, and keeps unsigned storage private',async()=>{
  const upload=await app.get(ProfileService).uploadPhoto(author.id,'image/png',png);
  const row=(await db.query('SELECT * FROM media_assets WHERE id=$1',[upload.assetId])).rows[0];
  expect(row.storage_path).toMatch(/^s3:\/\//);expect(await new MediaStorageService().read(row)).toEqual(Buffer.from(png,'base64'));
  const direct=await fetch(`${process.env.MEDIA_S3_ENDPOINT}/${process.env.MEDIA_S3_BUCKET}/private-profiles/${row.file_name}`);expect(direct.status).toBe(403);
  await request(app.getHttpServer()).get(`/profile/media/${row.id}`).set('Authorization',auth(author)).expect(200);
  await request(app.getHttpServer()).get(`/profile/media/${row.id}`).set('Authorization',auth(reader)).expect(403);
  await request(app.getHttpServer()).get(`/claims/evidence/${row.id}`).set('Authorization',auth(author)).expect(200);
  await request(app.getHttpServer()).get(`/claims/evidence/${row.id}`).set('Authorization',auth(reader)).expect(403);
 });
 it('recovers concurrent attachment retries as one durable message and keeps conversation authorization',async()=>{
  const body=payload(),endpoint=`/chat/conversations/${group}/attachments`;
  const results=await Promise.all(Array.from({length:3},()=>request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(body).expect(201)));
  message=results[0].body;expect(new Set(results.map(r=>r.body.id)).size).toBe(1);
  const objects=await s3.send(new ListObjectsV2Command({Bucket:process.env.MEDIA_S3_BUCKET,Prefix:'private-chat/'}));expect(objects.Contents).toHaveLength(1);
  const row=(await db.query('SELECT a.* FROM media_assets a JOIN chat_message_attachments l ON l.asset_id=a.id WHERE l.message_id=$1',[message.id])).rows[0];
  expect(await new MediaStorageService().read(row)).toEqual(Buffer.from(png,'base64'));
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages/${message.id}/attachment`).set('Authorization',auth(reader)).expect(200);
  await request(app.getHttpServer()).get(`/chat/conversations/${group}/messages/${message.id}/attachment`).set('Authorization',auth(outsider)).expect(404);
  process.env.SIMULATE_SCANNER_FAILURE='true';try{await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(body).expect(201);await request(app.getHttpServer()).post(endpoint).set('Authorization',auth(author)).send(payload()).expect(503);}finally{delete process.env.SIMULATE_SCANNER_FAILURE;}
 });
 it('preserves committed object bytes when the database commit acknowledgement is lost',async()=>{
  const body=payload(),real=db.transaction.bind(db);let calls=0;
  const spy=jest.spyOn(db,'transaction').mockImplementation(async(work:any)=>{const result=await real(work);if(++calls===2)throw new Error('lost commit acknowledgement');return result;});
  try{await expect(app.get(ChatAttachmentsService).send(group,author,body)).rejects.toThrow('lost commit');}finally{spy.mockRestore();}
  const retried=await app.get(ChatAttachmentsService).send(group,author,body);expect(retried.alreadySent).toBe(true);
  const downloaded=await app.get(ChatAttachmentsService).download(group,retried.id,reader);expect(downloaded.buffer).toEqual(Buffer.from(png,'base64'));
 });
 it('detects modified remote bytes and retries failed cleanup without purging a legal hold',async()=>{
  const upload=await app.get(ProfileService).uploadPhoto(author.id,'image/png',png),row=(await db.query('SELECT * FROM media_assets WHERE id=$1',[upload.assetId])).rows[0];
  await s3.send(new PutObjectCommand({Bucket:process.env.MEDIA_S3_BUCKET,Key:`private-profiles/${row.file_name}`,Body:Buffer.alloc(Number(row.byte_size))}));
  await expect(new MediaStorageService().read(row)).rejects.toThrow('integrity');
  await db.query("UPDATE media_assets SET retention_status='LEGAL_HOLD' WHERE id=$1",[row.id]);
  const queued=(await db.query("INSERT INTO media_deletion_queue(asset_id,storage_path,status) VALUES($1,$2,'PENDING') RETURNING id",[row.id,row.storage_path])).rows[0];
  expect(await app.get(ProfileService).processMediaDeletionQueue()).toBe(0);
  expect((await db.query('SELECT status,attempts FROM media_deletion_queue WHERE id=$1',[queued.id])).rows[0]).toMatchObject({status:'PENDING',attempts:1});
  await db.query("UPDATE media_assets SET retention_status='DELETED' WHERE id=$1",[row.id]);
  const spy=jest.spyOn(app.get(MediaStorageService),'remove').mockRejectedValueOnce(new Error('temporary storage outage'));
  try{expect(await app.get(ProfileService).processMediaDeletionQueue()).toBe(0);}finally{spy.mockRestore();}
  expect((await db.query('SELECT status,attempts FROM media_deletion_queue WHERE id=$1',[queued.id])).rows[0]).toMatchObject({status:'PENDING',attempts:2});
  expect(await app.get(ProfileService).processMediaDeletionQueue()).toBe(1);
  await expect(s3.send(new GetObjectCommand({Bucket:process.env.MEDIA_S3_BUCKET,Key:`private-profiles/${row.file_name}`}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
 });
 it('stores sanitized cropped derivatives privately in S3 and removes them with the source',async()=>{
  const valid='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
  const upload=await app.get(ProfileService).uploadPhoto(author.id,'image/png',valid,{left:0,top:0,width:5000,height:10000});
  // Earlier fixture files intentionally contain damaged pixel data; target this new job first.
  await db.query("UPDATE media_image_jobs SET next_attempt_at=NOW()+INTERVAL '1 hour' WHERE source_asset_id<>$1",[upload.assetId]);
  expect(await app.get(ImageDerivativesService).processPending(1)).toBe(1);
  const children=(await db.query('SELECT a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id WHERE d.source_asset_id=$1',[upload.assetId])).rows;expect(children).toHaveLength(2);
  for(const child of children){expect(child.storage_path).toMatch(/^s3:\/\//);const anonymous=await fetch(`${process.env.MEDIA_S3_ENDPOINT}/${process.env.MEDIA_S3_BUCKET}/private-derivatives/${child.file_name}`);expect(anonymous.status).toBe(403);}
  await request(app.getHttpServer()).get(`/profile/media/${upload.assetId}?variant=display`).set('Authorization',auth(author)).expect(200).expect('Content-Type',/image\/webp/);
  await app.get(ProfileService).removePhoto(author.id);
  for(const child of children)await expect(new MediaStorageService().read(child)).rejects.toThrow('not found');
 });
 it('pins a version and physically removes it from a versioned bucket rather than adding a delete marker',async()=>{
  await s3.send(new PutBucketVersioningCommand({Bucket:process.env.MEDIA_S3_BUCKET,VersioningConfiguration:{Status:'Enabled'}}));
  const upload=await app.get(ProfileService).uploadPhoto(author.id,'image/png',png),row=(await db.query('SELECT * FROM media_assets WHERE id=$1',[upload.assetId])).rows[0];
  expect(row.storage_path).not.toContain('?versionId=null');
  const originalVersion=decodeURIComponent(row.storage_path.split('?versionId=')[1]);
  await s3.send(new PutObjectCommand({Bucket:process.env.MEDIA_S3_BUCKET,Key:`private-profiles/${row.file_name}`,Body:Buffer.from('Fictional later version')}));
  expect(await new MediaStorageService().read(row)).toEqual(Buffer.from(png,'base64'));
  await new MediaStorageService().remove(row);await new MediaStorageService().remove(row);
  await expect(s3.send(new GetObjectCommand({Bucket:process.env.MEDIA_S3_BUCKET,Key:`private-profiles/${row.file_name}`,VersionId:originalVersion}))).rejects.toMatchObject({$metadata:{httpStatusCode:404}});
  const versions=await s3.send(new ListObjectVersionsCommand({Bucket:process.env.MEDIA_S3_BUCKET,Prefix:`private-profiles/${row.file_name}`}));
  expect(versions.Versions?.some(v=>v.VersionId===originalVersion)).toBe(false);expect(versions.DeleteMarkers||[]).toHaveLength(0);
 });

});
