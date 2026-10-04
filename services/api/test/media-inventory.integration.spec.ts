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
describe('Resumable private media inventory and guarded recovery (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,chat:ChatService;
 let branch:string,otherBranch:string,author:any,reader:any,outsider:any,group:string,direct:string,message:any;
 const oldStorage=process.env.STORAGE_PATH;let storage:string;
 const png='iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=';
 const payload=(clientMessageId=randomUUID())=>({content:'Fictional attachment',clientMessageId,mimeType:'image/png',dataBase64:png});
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  storage=mkdtempSync(path.join(os.tmpdir(),'kashyap-chat-files-'));process.env.STORAGE_PATH=storage;
  iso=await createDisposableDatabase('media_inventory');await assertDatabaseIsolation(iso.client,iso.dbName);
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
 let runId:string;let assets:any[]=[];let oldOrphan:string,youngOrphan:string;
 const inventory=()=>app.get(MediaInventoryService);
 async function complete(id:string){for(let i=0;i<40;i++){if((await inventory().report(author,id)).run.status==='COMPLETE')return;await inventory().advance(author,id);}throw new Error('Inventory did not complete');}
 it('enforces current global authority and never returns content or storage paths',async()=>{
  await request(app.getHttpServer()).get('/media-operations/inventories').expect(401);
  await request(app.getHttpServer()).get('/media-operations/inventories').set('Authorization',auth(outsider)).expect(403);
  await expect(inventory().list({...author,roleAssignments:[{role:Role.SUPER_ADMIN,branchId:branch}]})).rejects.toThrow('Global Super Admin');
  await request(app.getHttpServer()).get('/media-operations/inventories').set('Authorization',auth(author)).expect(200).expect('Cache-Control','no-store');
 });
 it('records one active inventory across concurrent starts',async()=>{
  for(let i=0;i<6;i++){const upload=await app.get(ProfileService).uploadPhoto(author.id,'image/png',png);assets.push((await db.query('SELECT * FROM media_assets WHERE id=$1',[upload.assetId])).rows[0]);}
  await db.query('DELETE FROM media_image_jobs WHERE source_asset_id=ANY($1::uuid[])',[[assets[0].id,assets[1].id,assets[2].id,assets[3].id]]);
  await db.query("UPDATE media_assets SET retention_status='DELETED' WHERE id=$1",[assets[2].id]);await db.query("UPDATE media_assets SET retention_status='LEGAL_HOLD' WHERE id=$1",[assets[3].id]);
  await files.unlink(assets[4].storage_path);await files.writeFile(assets[5].storage_path,Buffer.alloc(Number(assets[5].byte_size)));
  const store=app.get(MediaStorageService);oldOrphan=await store.put('private-profiles',`avatar_${randomUUID()}.png`,Buffer.from(png,'base64'),'image/png');youngOrphan=await store.put('private-chat',`attachment_${randomUUID()}.png`,Buffer.from(png,'base64'),'image/png');await files.utimes(oldOrphan,new Date(Date.now()-172800000),new Date(Date.now()-172800000));await files.writeFile(path.join(storage,'unmanaged-secret-name.txt'),'private fixture');
  const responses=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post('/media-operations/inventories').set('Authorization',auth(author)).send({})));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);runId=responses.find(r=>r.status===201)!.body.id;
 });
 it('rolls back progress and observations when durable audit fails',async()=>{
  const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('inventory audit failure'));
  try{await expect(inventory().advance(author,runId)).rejects.toThrow('inventory audit failure');}finally{fail.mockRestore();}
  expect((await db.query('SELECT last_asset_id FROM media_inventory_runs WHERE id=$1',[runId])).rows[0].last_asset_id).toBeNull();expect((await inventory().report(author,runId)).items).toHaveLength(0);
 });
 it('resumes bounded pages and reports integrity, missing jobs, old and recent unreferenced objects',async()=>{
  await inventory().advance(author,runId);const recreated=new MediaInventoryService(db,app.get(MediaStorageService),app.get(AuditOutboxRepository));await recreated.advance(author,runId);await complete(runId);
  const report=await inventory().report(author,runId);expect(report.run.status).toBe('COMPLETE');const counts=Object.fromEntries(report.summary.map((r:any)=>[r.finding,r.count]));expect(counts).toMatchObject({BYTES_MISSING:1,INTEGRITY_OR_STORAGE_FAILURE:1,DELETION_QUEUE_MISSING:1,IMAGE_JOB_MISSING:3,UNREFERENCED_REVIEW_REQUIRED:1,UNREFERENCED_GRACE:1,UNMANAGED_OBJECT:1});
  const http=await request(app.getHttpServer()).get(`/media-operations/inventories/${runId}`).set('Authorization',auth(author)).expect(200);expect(JSON.stringify(http.body)).not.toContain(storage);expect(JSON.stringify(http.body)).not.toContain('unmanaged-secret-name');expect(http.body.items[0].observed_location).toBeUndefined();
  await request(app.getHttpServer()).get(`/media-operations/inventories/${runId}?after=-1`).set('Authorization',auth(author)).expect(400);
 });
 it('rechecks legal holds and locations before scheduling, and repeated recovery never duplicates jobs',async()=>{
  const report=await inventory().report(author,runId),items=report.items.filter((r:any)=>['IMAGE_JOB_MISSING','DELETION_QUEUE_MISSING'].includes(r.finding)).map((r:any)=>String(r.id));
  await db.query("UPDATE media_assets SET retention_status='LEGAL_HOLD' WHERE id=$1",[assets[2].id]);
  expect(await inventory().recover(author,runId,items)).toEqual({scheduled:3,skipped:1});expect((await db.query('SELECT * FROM media_deletion_queue WHERE asset_id=$1',[assets[2].id])).rows).toHaveLength(0);
  await db.query("UPDATE media_assets SET retention_status='DELETED' WHERE id=$1",[assets[2].id]);expect((await inventory().recover(author,runId,items)).scheduled).toBe(1);expect((await inventory().recover(author,runId,items)).scheduled).toBe(0);
  expect((await db.query("SELECT * FROM media_deletion_queue WHERE asset_id=$1 AND status='PENDING'",[assets[2].id])).rows).toHaveLength(1);
  await request(app.getHttpServer()).post(`/media-operations/inventories/${runId}/recover`).set('Authorization',auth(outsider)).send({itemIds:items}).expect(403);
  await expect(inventory().recover(author,runId,[items[0],items[0]])).rejects.toThrow();
 });
 it('retains unreferenced objects and rolls back scheduled recovery on audit failure',async()=>{
  const item=(await inventory().report(author,runId)).items.find((r:any)=>r.asset_id===assets[0].id&&r.finding==='IMAGE_JOB_MISSING');await db.query('DELETE FROM media_image_jobs WHERE source_asset_id=$1',[assets[0].id]);
  const fail=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('inventory recovery audit failure'));try{await expect(inventory().recover(author,runId,[String(item!.id)])).rejects.toThrow();}finally{fail.mockRestore();}
  expect((await db.query('SELECT * FROM media_image_jobs WHERE source_asset_id=$1',[assets[0].id])).rows).toHaveLength(0);expect((await files.stat(oldOrphan)).isFile()).toBe(true);expect((await files.stat(youngOrphan)).isFile()).toBe(true);
  await app.get(ProfileService).processMediaDeletionQueue();await expect(files.stat(assets[2].storage_path)).rejects.toThrow();expect((await files.stat(assets[3].storage_path)).isFile()).toBe(true);
 });
 it('blocks changed storage scope, supports cancellation, and guards rollback evidence',async()=>{
  const next=await inventory().start(author),scope=jest.spyOn(app.get(MediaStorageService),'inventoryScope').mockReturnValue('changed');try{await expect(inventory().advance(author,next.id)).rejects.toThrow('configuration changed');await inventory().cancel(author,next.id);}finally{scope.mockRestore();}
  expect((await inventory().report(author,next.id)).run.status).toBe('CANCELLED');await expect(inventory().advance(author,next.id)).rejects.toThrow('no longer running');
  await expect(db.query(readFileSync(resolve(__dirname,'../../../database/migrations/026_media_inventory.down.sql'),'utf8'))).rejects.toThrow('Inventory evidence exists');
 });
});
