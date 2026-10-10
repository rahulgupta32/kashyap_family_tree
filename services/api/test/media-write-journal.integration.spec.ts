import { OrphanCleanupService } from '../src/media/orphan-cleanup.service';
import { MediaInventoryService } from '../src/media/media-inventory.service';
import { MediaStorageService } from '../src/media/media-storage.service';
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
describe('Durable write journal and reviewed orphan cleanup (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const oldStorage=process.env.STORAGE_PATH;let storage:string;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  storage=mkdtempSync(path.join(os.tmpdir(),'kashyap-chat-files-'));process.env.STORAGE_PATH=storage;
  iso=await createDisposableDatabase('media_write_journal');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();if(storage)await files.rm(storage,{recursive:true,force:true});if(oldStorage===undefined)delete process.env.STORAGE_PATH;else process.env.STORAGE_PATH=oldStorage;});
 const store=()=>app.get(MediaStorageService),inventory=()=>app.get(MediaInventoryService),cleanup=()=>app.get(OrphanCleanupService);
 const bytes=()=>Buffer.from(png,'base64');let source:any;let orphan:any,uncertain:any,active:any,runId:string;let untracked:string;
 async function loose(){const fileName=`avatar_${randomUUID()}.png`,location=await store().put('private-profiles',fileName,bytes(),'image/png',author.id);return (await db.query('SELECT * FROM media_upload_intents WHERE file_name=$1',[fileName])).rows[0];}
 async function expire(intent:any){await db.query("UPDATE media_upload_intents SET created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day' WHERE id=$1",[intent.id]);}
 async function scan(){const run=await inventory().start(author);for(let i=0;i<60;i++){if((await inventory().report(author,run.id)).run.status==='COMPLETE')return run.id;await inventory().advance(author,run.id);}throw new Error('Inventory did not complete');}
 async function itemFor(id:string,location:string){return (await db.query('SELECT * FROM media_inventory_items WHERE run_id=$1 AND observed_location=$2 AND asset_id IS NULL',[id,location])).rows[0];}
 async function link(intent:any,location=intent.object_location){return db.query(`INSERT INTO media_assets(id,uploader_user_id,storage_key,bucket,file_name,mime_type,byte_size,sha256_checksum,is_private,quarantine_status,retention_status,storage_path)
 VALUES($1,$2,$3,$4,$3,$5,$6,$7,true,'CLEAN','ACTIVE',$8) RETURNING id`,[randomUUID(),author.id,intent.file_name,intent.bucket,intent.mime_type,intent.byte_size,intent.sha256_checksum,location]);}
 it('authenticates the independent pool with explicit database settings and no database URL',async()=>{
  const url=process.env.DATABASE_URL,standalone=new DatabaseService();delete process.env.DATABASE_URL;
  try{await standalone.onModuleInit();expect((await standalone.journalQuery('SELECT current_database() AS name')).rows[0].name).toBe(iso.dbName);}
  finally{await standalone.onModuleDestroy();if(url!==undefined)process.env.DATABASE_URL=url;}
 });
 it('commits source and derivative write provenance without changing original bytes',async()=>{
  const photo=await app.get(ProfileService).uploadPhoto(author.id,'image/png',png);source=(await db.query('SELECT * FROM media_assets WHERE id=$1',[photo.assetId])).rows[0];await app.get(ImageDerivativesService).processPending(1);
  const intents=(await db.query('SELECT * FROM media_upload_intents WHERE asset_id=$1 OR asset_id IN (SELECT asset_id FROM media_derivatives WHERE source_asset_id=$1)',[photo.assetId])).rows;expect(intents).toHaveLength(3);for(const intent of intents){expect(intent.state).toBe('COMMITTED');expect(intent.uploader_user_id).toBe(author.id);expect(intent.object_location).toBeTruthy();}expect(await store().read(source)).toEqual(bytes());
 });
 it('keeps independent durable write intent and bytes when the caller transaction rolls back',async()=>{
  await expect(db.transaction(async()=>{orphan=await loose();throw new Error('caller rollback');})).rejects.toThrow('caller rollback');expect((await db.query('SELECT state FROM media_upload_intents WHERE id=$1',[orphan.id])).rows[0].state).toBe('STORED');expect(await files.readFile(orphan.object_location)).toEqual(bytes());
 });
 it('fails before writing on reservation failure and records uncertain writes for later reconciliation',async()=>{
  const name=`avatar_${randomUUID()}.png`,reserve=jest.spyOn(db,'journalQuery').mockRejectedValueOnce(new Error('journal unavailable'));try{await expect(store().put('private-profiles',name,bytes(),'image/png',author.id)).rejects.toThrow('reservation');}finally{reserve.mockRestore();}await expect(files.stat(store().location('private-profiles',name))).rejects.toThrow();
  const real=db.journalQuery.bind(db),fileName=`avatar_${randomUUID()}.png`,fail=jest.spyOn(db,'journalQuery').mockImplementation(async(sql:string,params:any[])=>{if(sql.startsWith('UPDATE'))throw new Error('lost write acknowledgement');return real(sql,params);});try{await expect(store().put('private-profiles',fileName,bytes(),'image/png',author.id)).rejects.toThrow('write failed');}finally{fail.mockRestore();}uncertain=(await db.query('SELECT * FROM media_upload_intents WHERE file_name=$1',[fileName])).rows[0];expect(uncertain.state).toBe('WRITING');expect(uncertain.object_location).toBeNull();expect(await files.readFile(store().location(uncertain.bucket,fileName))).toEqual(bytes());
 });
 it('distinguishes active, expired and untracked objects in redacted inventory',async()=>{
  await expire(orphan);await expire(uncertain);active=await loose();untracked=store().location('private-profiles',`avatar_${randomUUID()}.png`);await files.writeFile(untracked,bytes());await files.utimes(untracked,new Date(Date.now()-172800000),new Date(Date.now()-172800000));runId=await scan();
  expect((await itemFor(runId,orphan.object_location)).finding).toBe('ABANDONED_UPLOAD_REVIEW');expect((await itemFor(runId,store().location(uncertain.bucket,uncertain.file_name))).finding).toBe('ABANDONED_UPLOAD_REVIEW');expect((await itemFor(runId,active.object_location)).finding).toBe('UPLOAD_PENDING');expect((await itemFor(runId,untracked)).finding).toBe('UNREFERENCED_REVIEW_REQUIRED');expect(JSON.stringify(await inventory().report(author,runId))).not.toContain(storage);
 });
 it('requires global authority and rejects active/untracked selection; approval audit failure preserves the write',async()=>{
  const item=await itemFor(runId,orphan.object_location);
  await request(app.getHttpServer()).post(`/media-operations/inventories/${runId}/orphan-cleanup`).set('Authorization',auth(outsider)).send({itemIds:[String(item.id)],reason:'Fictional orphan review'}).expect(403);
  for(const location of [active.object_location,untracked]){const row=await itemFor(runId,location);await expect(cleanup().approve(author,runId,[String(row.id)],'Fictional review')).rejects.toThrow('expired journaled');}
  const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('approval audit failure'));try{await expect(cleanup().approve(author,runId,[String(item.id)],'Fictional orphan review')).rejects.toThrow('approval audit failure');}finally{fail.mockRestore();}
  expect((await db.query('SELECT state FROM media_upload_intents WHERE id=$1',[orphan.id])).rows[0].state).toBe('STORED');expect((await db.query('SELECT * FROM media_orphan_deletion_queue')).rows).toHaveLength(0);
 });
 it('fences late links before exact cleanup and preserves referenced originals and untracked files',async()=>{
  const item=await itemFor(runId,orphan.object_location);expect(await cleanup().approve(author,runId,[String(item.id)],'Fictional reviewed abandonment')).toEqual({scheduled:1});expect((await cleanup().approve(author,runId,[String(item.id)],'Repeated fictional review')).scheduled).toBe(0);await expect(link(orphan)).rejects.toThrow('not linkable');expect(await cleanup().processPending()).toBe(1);await expect(files.stat(orphan.object_location)).rejects.toThrow();expect(await store().read(source)).toEqual(bytes());expect(await files.readFile(untracked)).toEqual(bytes());
  const report=await inventory().report(author,runId);expect(report.items.find((i:any)=>String(i.id)===String(item.id))!.cleanup_status).toBe('PROCESSED');
 });
 it('retries storage failure, then reconciles deletion followed by audit rollback without replaying a valid link',async()=>{
  const location=store().location(uncertain.bucket,uncertain.file_name),item=await itemFor(runId,location);await cleanup().approve(author,runId,[String(item.id)],'Fictional uncertain-write review');const fail=jest.spyOn(store(),'remove').mockRejectedValueOnce(new Error('storage unavailable'));try{expect(await cleanup().processPending()).toBe(0);}finally{fail.mockRestore();}let job=(await db.query('SELECT * FROM media_orphan_deletion_queue WHERE intent_id=$1',[uncertain.id])).rows[0];expect(job.attempts).toBe(1);expect(job.status).toBe('PENDING');expect((await files.stat(location)).isFile()).toBe(true);await db.query('UPDATE media_orphan_deletion_queue SET next_attempt_at=NOW() WHERE id=$1',[job.id]);
  const audit=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('completion audit failure'));try{expect(await cleanup().processPending()).toBe(0);}finally{audit.mockRestore();}await expect(files.stat(location)).rejects.toThrow();await db.query('UPDATE media_orphan_deletion_queue SET next_attempt_at=NOW() WHERE id=$1',[job.id]);expect(await cleanup().processPending()).toBe(1);await expect(link(uncertain,location)).rejects.toThrow('not linkable');
 });
 it('refuses a newly linked object from an old report and cannot reuse a reserved generated key',async()=>{
  const late=await loose();await expire(late);const id=await scan(),item=await itemFor(id,late.object_location);await link(late);await expect(cleanup().approve(author,id,[String(item.id)],'Fictional stale review')).rejects.toThrow('active, linked');await expect(store().put(late.bucket,late.file_name,bytes(),late.mime_type,author.id)).rejects.toThrow('reservation');expect(await files.readFile(late.object_location)).toEqual(bytes());
 });
 it('rechecks uploader legal holds before approval and physical cleanup',async()=>{
  const held=await loose();await expire(held);const id=await scan(),item=await itemFor(id,held.object_location);
  const hold=(await db.query("INSERT INTO data_retention_records(user_id,asset_id,holding_authority,legal_basis,retention_reason,release_conditions,retention_period_days,expires_at) VALUES($1,$2,'FICTIONAL','TEST_ONLY','Fixture','Fixture release',1,NOW()+INTERVAL '1 day') RETURNING id",[author.id,source.id])).rows[0];await expect(cleanup().approve(author,id,[String(item.id)],'Fictional held review')).rejects.toThrow('legal hold');await db.query('UPDATE data_retention_records SET released_at=NOW() WHERE id=$1',[hold.id]);await cleanup().approve(author,id,[String(item.id)],'Fictional released review');await db.query('UPDATE data_retention_records SET released_at=NULL WHERE id=$1',[hold.id]);expect(await cleanup().processPending()).toBe(0);expect((await files.stat(held.object_location)).isFile()).toBe(true);await db.query('UPDATE data_retention_records SET released_at=NOW() WHERE id=$1',[hold.id]);expect((await cleanup().approve(author,id,[String(item.id)],'Fictional final hold release')).scheduled).toBe(1);expect(await cleanup().processPending()).toBe(1);
 });
 it('retains changed bytes for review and reconciles a lost cleanup commit acknowledgement',async()=>{
  const changed=await loose();await expire(changed);const id=await scan(),item=await itemFor(id,changed.object_location);await cleanup().approve(author,id,[String(item.id)],'Fictional integrity review');await files.writeFile(changed.object_location,Buffer.alloc(bytes().length));expect(await cleanup().processPending()).toBe(0);expect((await db.query('SELECT status FROM media_orphan_deletion_queue WHERE intent_id=$1',[changed.id])).rows[0].status).toBe('REVIEW_REQUIRED');await files.writeFile(changed.object_location,bytes());await cleanup().approve(author,id,[String(item.id)],'Fictional repaired bytes review');const real=db.transaction.bind(db),lost=jest.spyOn(db,'transaction').mockImplementationOnce(async(work:any)=>{await real(work);throw new Error('lost commit acknowledgement');});try{expect(await cleanup().processPending()).toBe(0);}finally{lost.mockRestore();}expect((await db.query('SELECT status,attempts FROM media_orphan_deletion_queue WHERE intent_id=$1',[changed.id])).rows[0]).toMatchObject({status:'PROCESSED',attempts:1});
  await expect(db.query(readFileSync(resolve(__dirname,'../../../database/migrations/027_media_write_journal.down.sql'),'utf8'))).rejects.toThrow('evidence exists');
 });
});
