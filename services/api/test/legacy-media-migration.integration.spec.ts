import { LegacyMediaMigrationService } from '../src/media/legacy-media-migration.service';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { MediaInventoryService } from '../src/media/media-inventory.service';
import { MediaStorageService } from '../src/media/media-storage.service';
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

import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
describe('Reviewed legacy media migration (real PostgreSQL; mocked S3 transport)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const original={...process.env};let storage:string;const remote=new Map<string,Buffer>();let sequence=0;let send:jest.SpyInstance;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  storage=mkdtempSync(path.join(os.tmpdir(),'kashyap-legacy-files-'));process.env.MEDIA_STORAGE_BACKEND='s3';process.env.MEDIA_S3_BUCKET='fictional-private';process.env.MEDIA_LEGACY_STORAGE_PATH=storage;
  delete process.env.MEDIA_LEGACY_LOCATION_PREFIX;delete process.env.MEDIA_S3_ENDPOINT;
  send=jest.spyOn(S3Client.prototype,'send') as jest.SpyInstance;send.mockImplementation(async(command:any)=>{
   const input=command.input,key=input.Key;
   if(command instanceof PutObjectCommand){const version=`fixture-${++sequence}`;remote.set(key+'?'+version,Buffer.from(input.Body));return {VersionId:version};}
   if(command instanceof GetObjectCommand){const bytes=remote.get(key+'?'+input.VersionId);if(!bytes){const error:any=new Error('missing');error.name='NoSuchKey';throw error;}return {ContentLength:bytes.length,Body:Readable.from([bytes])};}
   if(command instanceof DeleteObjectCommand){remote.delete(key+'?'+input.VersionId);return {};}
   if(command instanceof ListObjectVersionsCommand)return {Versions:[...remote.entries()].filter(([key])=>key.startsWith(input.Prefix)).map(([key,bytes])=>({Key:key.split('?')[0],VersionId:key.split('?')[1],LastModified:new Date(),Size:bytes.length})),IsTruncated:false};
   return {};
  });
  iso=await createDisposableDatabase('legacy_media_migration');await assertDatabaseIsolation(iso.client,iso.dbName);
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
  await module.get(UserRepository).assignRole(author.id,Role.SUPER_ADMIN,null);author.roleAssignments.push({role:Role.SUPER_ADMIN,branchId:null});author.roles.push(Role.SUPER_ADMIN);
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();if(storage)await files.rm(storage,{recursive:true,force:true});send?.mockRestore();process.env={...original};});
 const store=()=>app.get(MediaStorageService),inventory=()=>app.get(MediaInventoryService),migration=()=>app.get(LegacyMediaMigrationService);
 const bytes=()=>Buffer.from(png,'base64');let source:any,runId:string,item:any;
 async function legacy(retention='ACTIVE'){
  const id=randomUUID(),fileName=`avatar_${id}.png`,location=path.join(storage,fileName);await files.writeFile(location,bytes());
  return (await db.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,quarantine_status,retention_status,storage_path)
   VALUES($1,$2,$3,'private-profiles',$3,'image/png',$4,$5,true,'CLEAN',$6,$7) RETURNING *`,[id,author.id,fileName,bytes().length,createHash('sha256').update(bytes()).digest('hex'),retention,location])).rows[0];
 }
 async function scan(){const run=await inventory().start(author);for(let i=0;i<60;i++){if((await inventory().report(author,run.id)).run.status==='COMPLETE')return run.id;await inventory().advance(author,run.id);}throw new Error('Incomplete inventory');}
 async function finding(run:string,asset:string){return (await db.query("SELECT * FROM media_inventory_items WHERE run_id=$1 AND asset_id=$2 AND finding='LEGACY_MIGRATION_REVIEW'",[run,asset])).rows[0];}
 async function approve(asset:any){const run=await scan(),selected=await finding(run,asset.id);await migration().approve(author,run,[String(selected.id)],'Fictional verified migration review');return {run,selected};}
 async function row(asset:any){return (await db.query('SELECT * FROM media_assets WHERE id=$1',[asset.id])).rows[0];}
 async function job(asset:any){return (await db.query('SELECT * FROM media_legacy_migration_queue WHERE asset_id=$1',[asset.id])).rows[0];}
 async function due(asset:any){await db.query('UPDATE media_legacy_migration_queue SET next_attempt_at=NOW() WHERE asset_id=$1',[asset.id]);}
 it('keeps owner authorization for configured legacy reads and exposes redacted review findings',async()=>{
  source=await legacy();await db.query('UPDATE user_accounts SET avatar_asset_id=$1 WHERE id=$2',[source.id,author.id]);
  await request(app.getHttpServer()).get(`/profile/media/${source.id}`).set('Authorization',auth(author)).expect(200);await request(app.getHttpServer()).get(`/profile/media/${source.id}`).set('Authorization',auth(reader)).expect(403);
  runId=await scan();item=await finding(runId,source.id);expect(item).toBeTruthy();const report=await inventory().report(author,runId);expect(JSON.stringify(report)).not.toContain(storage);expect(report.items.find((i:any)=>String(i.id)===String(item.id))!.expected_checksum).toBe(source.sha256_checksum);
 });
 it('uses the exact PostgreSQL cutoff for assets created within the same millisecond',async()=>{
  const included=await legacy(),excluded=await legacy(),run=await inventory().start(author);
  await db.query("UPDATE media_inventory_runs SET created_at='2026-10-03T00:00:00.123999Z' WHERE id=$1",[run.id]);
  await db.query("UPDATE media_assets SET created_at='2026-10-03T00:00:00.123500Z' WHERE id=$1",[included.id]);await db.query("UPDATE media_assets SET created_at='2026-10-03T00:00:00.124001Z' WHERE id=$1",[excluded.id]);
  for(let i=0;i<60;i++){if((await inventory().report(author,run.id)).run.status==='COMPLETE')break;await inventory().advance(author,run.id);}
  expect(await finding(run.id,included.id)).toBeTruthy();expect(await finding(run.id,excluded.id)).toBeUndefined();
 });
 it('requires global review authority and rolls approval back when its audit fails',async()=>{
  await request(app.getHttpServer()).post(`/media-operations/inventories/${runId}/legacy-migration`).set('Authorization',auth(outsider)).send({itemIds:[String(item.id)],reason:'Fictional review'}).expect(403);
  await expect(migration().approve(author,runId,[String(item.id)],'x')).rejects.toThrow();await expect(migration().approve(author,runId,[String(item.id),String(item.id)],'Fictional review')).rejects.toThrow();
  const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('approval audit failure'));try{await expect(migration().approve(author,runId,[String(item.id)],'Fictional review')).rejects.toThrow('approval audit failure');}finally{fail.mockRestore();}expect(await job(source)).toBeUndefined();
 });
 it('copies and verifies bytes while preserving the asset, photo reference and original source',async()=>{
  expect((await migration().approve(author,runId,[String(item.id)],'Fictional owner migration')).scheduled).toBe(1);expect((await migration().approve(author,runId,[String(item.id)],'Fictional repeated approval')).scheduled).toBe(0);
  expect(await migration().processPending()).toBe(1);const current=await row(source);expect(current.id).toBe(source.id);expect(current.file_name).not.toBe(source.file_name);expect(current.storage_path).toMatch(/^s3:\/\//);expect(current.sha256_checksum).toBe(source.sha256_checksum);expect(current.mime_type).toBe(source.mime_type);expect(current.quarantine_status).toBe('CLEAN');expect(await store().read(current)).toEqual(bytes());expect(await files.readFile(source.storage_path)).toEqual(bytes());expect((await job(source)).status).toBe('PROCESSED');
  expect((await db.query('SELECT avatar_asset_id FROM user_accounts WHERE id=$1',[author.id])).rows[0].avatar_asset_id).toBe(source.id);expect((await db.query('SELECT state,asset_id FROM media_upload_intents WHERE file_name=$1',[current.file_name])).rows[0]).toEqual({state:'COMMITTED',asset_id:source.id});
  await request(app.getHttpServer()).get(`/profile/media/${source.id}`).set('Authorization',auth(author)).expect(200);await request(app.getHttpServer()).get(`/profile/media/${source.id}`).set('Authorization',auth(reader)).expect(403);
 });
 it('retains the source pointer on a failed PUT and on failed destination verification, then retries',async()=>{
  const asset=await legacy();await approve(asset);const put=jest.spyOn(store(),'put').mockRejectedValueOnce(new Error('storage outage'));try{expect(await migration().processPending()).toBe(0);}finally{put.mockRestore();}expect((await row(asset)).storage_path).toBe(asset.storage_path);expect((await job(asset)).attempts).toBe(1);await due(asset);
  const read=store().read.bind(store()),fail=jest.spyOn(store(),'read').mockImplementation(async(a:any)=>{if(a.storage_path.startsWith('s3://'))throw new Error('verification outage');return read(a);});try{expect(await migration().processPending()).toBe(0);}finally{fail.mockRestore();}expect((await row(asset)).storage_path).toBe(asset.storage_path);expect((await db.query("SELECT id FROM media_upload_intents WHERE state='STORED'")).rows.length).toBeGreaterThan(0);await due(asset);const restarted=new LegacyMediaMigrationService(db,store(),app.get(AuditOutboxRepository));expect(await restarted.processPending()).toBe(1);expect(await files.readFile(asset.storage_path)).toEqual(bytes());
 });
 it('rechecks deleted state and stale source locations before copying',async()=>{
  const asset=await legacy(),review=await approve(asset),before=remote.size;await db.query("UPDATE media_assets SET retention_status='DELETED' WHERE id=$1",[asset.id]);expect(await migration().processPending()).toBe(0);expect((await job(asset)).status).toBe('REVIEW_REQUIRED');expect(remote.size).toBe(before);await expect(migration().approve(author,review.run,[String(review.selected.id)],'Fictional stale review')).rejects.toThrow('changed');
  const moved=await legacy(),id=await scan(),selected=await finding(id,moved.id);await db.query('UPDATE media_assets SET storage_path=$2 WHERE id=$1',[moved.id,'/unmapped/source']);await expect(migration().approve(author,id,[String(selected.id)],'Fictional moved review')).rejects.toThrow('changed');
 });
 it('refuses shared locations and pending deletion queues without writing bytes',async()=>{
  const shared=await legacy(),alias=await legacy();await db.query('UPDATE media_assets SET storage_path=$2 WHERE id=$1',[alias.id,shared.storage_path]);const id=await scan(),selected=await finding(id,shared.id);await expect(migration().approve(author,id,[String(selected.id)],'Fictional shared review')).rejects.toThrow('shared');
  const queued=await legacy();await db.query("INSERT INTO media_deletion_queue(asset_id,storage_path,status) VALUES($1,$2,'PENDING')",[queued.id,queued.storage_path]);const run=await scan(),item=await finding(run,queued.id);await expect(migration().approve(author,run,[String(item.id)],'Fictional deletion review')).rejects.toThrow('pending deletion');
 });
 it('moves legal-held bytes without releasing hold records or modifying the source',async()=>{
  const held=await legacy('LEGAL_HOLD'),hold=(await db.query("INSERT INTO data_retention_records(user_id,asset_id,holding_authority,legal_basis,retention_reason,release_conditions,retention_period_days,expires_at) VALUES($1,$2,'FICTIONAL','TEST','Fixture','Fixture',1,NOW()+INTERVAL '1 day') RETURNING id",[author.id,held.id])).rows[0];await approve(held);expect(await migration().processPending()).toBe(1);expect((await row(held)).retention_status).toBe('LEGAL_HOLD');expect((await db.query('SELECT released_at,asset_id FROM data_retention_records WHERE id=$1',[hold.id])).rows[0]).toEqual({released_at:null,asset_id:held.id});expect(await files.readFile(held.storage_path)).toEqual(bytes());
 });
 it('retains changed source bytes for review and permits explicit reapproval after repair',async()=>{
  const asset=await legacy(),review=await approve(asset);await files.writeFile(asset.storage_path,Buffer.alloc(bytes().length));expect(await migration().processPending()).toBe(0);expect((await job(asset)).error_code).toBe('SOURCE_BYTES_REVIEW_REQUIRED');expect((await row(asset)).storage_path).toBe(asset.storage_path);await files.writeFile(asset.storage_path,bytes());await migration().approve(author,review.run,[String(review.selected.id)],'Fictional repaired source review');expect(await migration().processPending()).toBe(1);
 });
 it('recovers copy/audit rollback and lost commit acknowledgement without deleting either source',async()=>{
  const asset=await legacy();await approve(asset);const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('copy audit failure'));try{expect(await migration().processPending()).toBe(0);}finally{fail.mockRestore();}expect((await row(asset)).storage_path).toBe(asset.storage_path);await due(asset);expect(await migration().processPending()).toBe(1);expect(await files.readFile(asset.storage_path)).toEqual(bytes());
  const uncertain=await legacy();await approve(uncertain);const real=db.transaction.bind(db),lost=jest.spyOn(db,'transaction').mockImplementationOnce(async(work:any)=>{await real(work);throw new Error('lost commit acknowledgement');});try{expect(await migration().processPending()).toBe(0);}finally{lost.mockRestore();}expect((await job(uncertain)).status).toBe('PROCESSED');expect(await store().read(await row(uncertain))).toEqual(bytes());expect(await files.readFile(uncertain.storage_path)).toEqual(bytes());
 });
 it('requires renewed review after configuration changes and protects migration evidence on rollback',async()=>{
  const asset=await legacy(),review=await approve(asset),scope=jest.spyOn(store(),'inventoryScope').mockReturnValue('changed');try{expect(await migration().processPending()).toBe(0);}finally{scope.mockRestore();}expect((await job(asset)).error_code).toBe('SOURCE_STATE_CHANGED');await migration().approve(author,review.run,[String(review.selected.id)],'Fictional configuration review');expect(await migration().processPending()).toBe(1);
  await expect(db.query(readFileSync(resolve(__dirname,'../../../database/migrations/028_legacy_media_migration.down.sql'),'utf8'))).rejects.toThrow('migration evidence exists');
 });
});
