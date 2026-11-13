import { ChatAttachmentsService } from '../src/modules/chat/chat-attachments.service';
import { promises as files, mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { ChatService } from '../src/modules/chat/chat.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

import { ProfileService } from '../src/modules/profile/profile.service';
import { ImageDerivativesService } from '../src/media/image-derivatives.service';
import { ImageProcessorService } from '../src/media/image-processor.service';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
const sharp=require('sharp');
describe('Private image jobs, source authorization and retention (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const oldStorage=process.env.STORAGE_PATH;let storage:string;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  storage=mkdtempSync(path.join(os.tmpdir(),'kashyap-chat-files-'));process.env.STORAGE_PATH=storage;
  iso=await createDisposableDatabase('image_derivatives');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();if(storage)await files.rm(storage,{recursive:true,force:true});if(oldStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=oldStorage;});
 let photo:any,source:any;
 const images=()=>app.get(ImageDerivativesService);
 const profile=()=>app.get(ProfileService);
 it('queues a selected crop with an unchanged private original and a safe processing placeholder',async()=>{
  const bytes=await sharp({create:{width:800,height:400,channels:3,background:'green'}}).jpeg().withExif({IFD0:{Artist:'Fictional private contributor'}}).toBuffer();
  photo=await profile().uploadPhoto(author.id,'image/jpeg',bytes.toString('base64'),{left:2500,top:0,width:5000,height:10000});
  source=(await db.query('SELECT * FROM media_assets WHERE id=$1',[photo.assetId])).rows[0];expect(await files.readFile(source.storage_path)).toEqual(bytes);
  await request(app.getHttpServer()).get(`/profile/media/${source.id}?variant=display`).set('Authorization',auth(author)).expect(503);
  await request(app.getHttpServer()).get(`/profile/media/${source.id}/processing`).set('Authorization',auth(author)).expect(200).expect(r=>expect(r.body.status).toBe('PENDING'));
  await request(app.getHttpServer()).get(`/profile/media/${source.id}/processing`).set('Authorization',auth(outsider)).expect(403);
 });
 it('creates one thumbnail/display pair across concurrent workers with private provenance and metadata removal',async()=>{
  await Promise.all([images().processPending(),images().processPending()]);
  const rows=(await db.query('SELECT d.*,a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id WHERE d.source_asset_id=$1',[source.id])).rows;expect(rows).toHaveLength(2);
  expect((await images().status(source.id)).status).toBe('READY');
  for(const row of rows){expect(row.source_checksum).toBe(source.sha256_checksum);expect(row.transform).toMatchObject({stripMetadata:true,crop:{left:2500,top:0,width:5000,height:10000}});expect(row.bucket).toBe('private-derivatives');const metadata=await sharp(await files.readFile(row.storage_path)).metadata();expect(metadata.exif).toBeUndefined();expect(metadata.width).toBe(row.kind==='thumbnail'?256:400);expect(metadata.height).toBe(row.kind==='thumbnail'?256:400);
   await request(app.getHttpServer()).get(`/profile/media/${row.id}`).set('Authorization',auth(author)).expect(404);await request(app.getHttpServer()).get(`/claims/evidence/${row.id}`).set('Authorization',auth(author)).expect(404);
  }
  await request(app.getHttpServer()).get(`/profile/media/${source.id}?variant=display`).set('Authorization',auth(author)).expect(200).expect('Content-Type',/image\/webp/).expect('Cache-Control','no-store');
  await request(app.getHttpServer()).get(`/profile/media/${source.id}?variant=thumbnail`).set('Authorization',auth(reader)).expect(403);
  await request(app.getHttpServer()).get(`/profile/media/${source.id}?variant=unknown`).set('Authorization',auth(author)).expect(400);
 });
 it('retries temporary failures without publishing partial output and stops after bounded attempts',async()=>{
  const upload=await profile().uploadPhoto(author.id,'image/png',png);
  const fail=jest.spyOn(app.get(ImageProcessorService),'generate').mockRejectedValue(new Error('temporary decoder failure'));
  try{await images().processPending(1);await db.query("UPDATE media_image_jobs SET attempts=4,next_attempt_at=NOW() WHERE source_asset_id=$1",[upload.assetId]);await images().processPending(1);}finally{fail.mockRestore();}
  expect(await images().status(upload.assetId)).toMatchObject({status:'FAILED',attempts:5,errorCode:'IMAGE_PROCESSING_FAILED'});
  expect((await db.query('SELECT * FROM media_derivatives WHERE source_asset_id=$1',[upload.assetId])).rows).toHaveLength(0);
  await request(app.getHttpServer()).post(`/profile/media/${upload.assetId}/retry`).set('Authorization',auth(outsider)).expect(403);
  await request(app.getHttpServer()).post(`/profile/media/${upload.assetId}/retry`).set('Authorization',auth(author)).expect(201);await images().processPending(1);expect((await images().status(upload.assetId)).status).toBe('READY');
 });
 it('rolls back audit failure and cleans candidate objects, while a lost COMMIT keeps committed derivatives',async()=>{
  const upload=await profile().uploadPhoto(author.id,'image/png',png),before=await files.readdir(path.join(storage,'derivatives'));
  const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('audit unavailable'));
  try{await images().processPending(1);}finally{fail.mockRestore();}expect(await files.readdir(path.join(storage,'derivatives'))).toEqual(before);
  await profile().imageProcessing(upload.assetId,author,true);
  const real=db.transaction.bind(db),lost=jest.spyOn(db,'transaction').mockImplementationOnce(async(work:any)=>{await real(work);throw new Error('lost commit acknowledgement');});
  try{await images().processPending(1);}finally{lost.mockRestore();}
  expect((await images().status(upload.assetId)).status).toBe('READY');const display=await profile().getMediaAsset(upload.assetId,author,undefined,undefined,undefined,'display');expect((await sharp(display.buffer).metadata()).format).toBe('webp');
 });
 it('removes source display references, queues all derivatives and physically deletes bytes together',async()=>{
  const upload=await profile().uploadPhoto(author.id,'image/png',png);await images().processPending(1);
  const paths=(await db.query('SELECT storage_path FROM media_assets WHERE id=$1 OR id IN (SELECT asset_id FROM media_derivatives WHERE source_asset_id=$1)',[upload.assetId])).rows;expect(paths).toHaveLength(3);
  await request(app.getHttpServer()).delete('/profile/photo').set('Authorization',auth(author)).expect(200).expect(r=>expect(r.body.retainedForEvidence).toBe(false));
  expect((await profile().getMe(author.id)).avatarAssetId).toBeUndefined();
  for(const row of paths)await expect(files.stat(row.storage_path)).rejects.toMatchObject({code:'ENOENT'});
  await request(app.getHttpServer()).get(`/profile/media/${upload.assetId}?variant=display`).set('Authorization',auth(author)).expect(404);expect((await images().status(upload.assetId)).status).toBe('CANCELLED');
 });
 it('inherits source legal holds and releases derivatives only with the governed source release',async()=>{
  const upload=await profile().uploadPhoto(author.id,'image/png',png);await images().processPending(1);
  await db.query("UPDATE media_assets SET retention_status='LEGAL_HOLD' WHERE id=$1",[upload.assetId]);
  const retained=await profile().removePhoto(author.id);expect(retained.retainedForEvidence).toBe(true);
  const children=(await db.query('SELECT a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id WHERE d.source_asset_id=$1',[upload.assetId])).rows;expect(children).toHaveLength(2);
  for(const child of children){expect(child.retention_status).toBe('LEGAL_HOLD');expect((await files.stat(child.storage_path)).isFile()).toBe(true);}
  const hold=(await db.query("INSERT INTO data_retention_records(user_id,asset_id,holding_authority,legal_basis,retention_reason,release_conditions,retention_period_days,expires_at) VALUES($1,$2,'FICTIONAL_AUTHORITY','TEST_ONLY','Fixture','Fixture release',1,NOW()+INTERVAL '1 day') RETURNING id",[author.id,upload.assetId])).rows[0];
  await profile().reviewLegalHold(hold.id,author.id,'RELEASE','Fictional authority fixture');
  for(const child of children)await expect(files.stat(child.storage_path)).rejects.toMatchObject({code:'ENOENT'});
 });
 it('uses conversation history authority for image derivatives and denies removed members and tombstones',async()=>{
  const sent=await app.get(ChatAttachmentsService).send(group,author,payload());await images().processPending(1);
  const endpoint=`/chat/conversations/${group}/messages/${sent.id}/attachment?variant=display`;
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(reader)).expect(200).expect('Content-Type',/image\/webp/);
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(outsider)).expect(404);
  const info=await chat.info(group,author);await chat.removeMember(group,reader.id,author,{version:info.version});
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(reader)).expect(404);await chat.removeMessage(group,sent.id,author);
  await request(app.getHttpServer()).get(endpoint).set('Authorization',auth(author)).expect(404);
 });
 it('refuses unsafe upload crop, base64 and dimensions without creating media records',async()=>{
  const before=(await db.query('SELECT count(*) FROM media_assets')).rows[0].count;
  for(const crop of [{left:9999,top:0,width:10000,height:10000},{left:0,top:0,width:Infinity,height:1}])await expect(profile().uploadPhoto(author.id,'image/png',png,crop)).rejects.toThrow();
  await expect(profile().uploadPhoto(author.id,'image/png',png+' ')).rejects.toThrow();
  const oversized=await sharp({create:{width:8193,height:1,channels:3,background:'green'}}).png().toBuffer();await expect(profile().uploadPhoto(author.id,'image/png',oversized.toString('base64'))).rejects.toThrow('8192');
  expect((await db.query('SELECT count(*) FROM media_assets')).rows[0].count).toBe(before);
 });
 it('account deletion preserves held derivatives while deleting non-held sources and their derivatives',async()=>{
  const held=await profile().uploadPhoto(author.id,'image/png',png);await images().processPending(1);
  const free=await profile().uploadPhoto(author.id,'image/png',png);await images().processPending(1);
  const claim=(await db.query("INSERT INTO profile_claims(claimant_user_id,target_person_id,relationship_description,status,statement_of_truth) VALUES($1,$2,'Fictional fixture','DISPUTED',TRUE) RETURNING id",[author.id,author.personId])).rows[0];
  await db.query("INSERT INTO claim_evidence_attachments(claim_id,media_asset_id,document_type,sha256_hash,description) VALUES($1,$2,'citizenship',$3,'Fictional proof')",[claim.id,held.assetId,held.sha256]);
  const heldChildren=(await db.query('SELECT a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id WHERE d.source_asset_id=$1',[held.assetId])).rows;
  const freeChildren=(await db.query('SELECT a.* FROM media_derivatives d JOIN media_assets a ON a.id=d.asset_id WHERE d.source_asset_id=$1',[free.assetId])).rows;expect(heldChildren).toHaveLength(2);expect(freeChildren).toHaveLength(2);
  const challenge=await profile().requestAccountDeletionChallenge(author.id);expect(challenge.otp).toBeDefined();await profile().deleteAccount(author.id,{challengeId:challenge.challengeId,otp:challenge.otp});
  for(const child of heldChildren){expect((await db.query('SELECT retention_status FROM media_assets WHERE id=$1',[child.id])).rows[0].retention_status).toBe('LEGAL_HOLD');expect((await files.stat(child.storage_path)).isFile()).toBe(true);}
  for(const child of freeChildren)await expect(files.stat(child.storage_path)).rejects.toMatchObject({code:'ENOENT'});
  await request(app.getHttpServer()).get(`/profile/media/${held.assetId}?variant=display`).set('Authorization',auth(author)).expect(401);
 });

});
