import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { BranchAdministrationService } from '../src/modules/branch-administration/branch-administration.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Versioned branch and generation catalogue (real PostgreSQL/HTTP)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,users:UserRepository,audit:AuditOutboxRepository,service:BranchAdministrationService,admin:any,member:any,branch:any;
 const reason='Fictional branch administration review',base={code:'BRADM',nameNepali:'परीक्षण शाखा',nameEnglish:'Fictional branch',reason};
 const auth=(u=admin)=>({Authorization:`Bearer ${u.token}`});
 const patch=(body:any)=>request(app.getHttpServer()).patch(`/admin/branches/${branch.id}`).set(auth()).send(body);
 beforeAll(async()=>{
  iso=await createDisposableDatabase('branch_administration');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();db=module.get(DatabaseService);users=module.get(UserRepository);audit=module.get(AuditOutboxRepository);service=module.get(BranchAdministrationService);await assertDatabaseIsolation(db,iso.dbName);
  async function fixture(phone:string,role:Role){const u=await users.findOrCreateByPhone(phone);await users.setPhoneVerified(u.id,true);await users.assignRole(u.id,role);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'branch-fixture',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});return {id:u.id,token};}
  admin=await fixture('+9779847555601',Role.SUPER_ADMIN);member=await fixture('+9779847555602',Role.VERIFIED_MEMBER);
 },60000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires current verified Super Admin authority, including on mutations',async()=>{
  await request(app.getHttpServer()).get('/admin/branches').expect(401);
  for(const role of [Role.VERIFIED_MEMBER,Role.CENTRAL_ADMIN,Role.BRANCH_ADMIN]){
   await users.assignRole(member.id,role);await request(app.getHttpServer()).get('/admin/branches').set(auth(member)).expect(403);
   await request(app.getHttpServer()).post('/admin/branches').set(auth(member)).send(base).expect(403);
  }
  await db.query("DELETE FROM user_roles WHERE user_id=$1 AND role='SUPER_ADMIN'",[admin.id]);try{await request(app.getHttpServer()).get('/admin/branches').set(auth()).expect(403);}finally{await users.assignRole(admin.id,Role.SUPER_ADMIN);}
  await users.setPhoneVerified(admin.id,false);try{await request(app.getHttpServer()).post('/admin/branches').set(auth()).send(base).expect(403);}finally{await users.setPhoneVerified(admin.id,true);}
 });
 it('validates bounded metadata and refuses duplicate codes atomically',async()=>{
  for(const body of [{...base,code:'bad code'},{...base,nameEnglish:''},{...base,nameNepali:12},{...base,reason:'short'},{...base,description:'x'.repeat(3001)},{...base,actorId:member.id}])await request(app.getHttpServer()).post('/admin/branches').set(auth()).send(body).expect(400);
  const responses=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post('/admin/branches').set(auth()).send(base)));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);branch=responses.find(r=>r.status===201)!.body;
  expect(branch).toMatchObject({code:base.code,version:1,moolGhar:null});expect((await db.query('SELECT count(*) FROM branch_administration_revisions WHERE branch_id=$1',[branch.id])).rows[0].count).toBe('1');
  const response=await request(app.getHttpServer()).get('/admin/branches').set(auth()).expect(200);expect(response.headers['cache-control']).toBe('private, no-store');expect(response.body.items).toContainEqual(branch);expect(JSON.stringify(response.body)).not.toContain('+977');
  await request(app.getHttpServer()).get('/admin/branches?after=invalid').set(auth()).expect(400);await request(app.getHttpServer()).get('/admin/branches?extra=true').set(auth()).expect(400);
  await request(app.getHttpServer()).patch('/admin/branches/not-an-id').set(auth()).send({...base,code:undefined,version:1}).expect(400);
 });
 it('serializes competing metadata edits and preserves source labels and immutable history',async()=>{
  const before=branch;
  const responses=await Promise.all(['First revised branch','Second revised branch'].map(nameEnglish=>patch({nameNepali:base.nameNepali,nameEnglish,version:branch.version,reason})));
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);branch=responses.find(r=>r.status===200)!.body;
  const h=(await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/history`).set(auth()).expect(200)).body;
  expect(h.items[0]).toMatchObject({oldValue:before,newValue:branch,version:2,actorId:admin.id,reason});expect(h.items).toHaveLength(2);
  expect((await new BranchAdministrationService(db,audit).list(admin.id,{})).items).toContainEqual(branch);
  await expect(db.query('UPDATE branch_administration_revisions SET reason=$2 WHERE branch_id=$1',[branch.id,'Fictional rewritten reason'])).rejects.toThrow('append-only');
  await patch({nameNepali:branch.nameNepali,nameEnglish:'Fictional code edit',version:branch.version,code:'CHANGED',reason}).expect(400);
  await patch({nameNepali:branch.nameNepali,nameEnglish:branch.nameEnglish,version:branch.version,reason}).expect(400);
 });
 it('captures a legacy metadata snapshot without inventing its original actor',async()=>{
  const legacy=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('LEGADM','पुरानो शाखा','Fictional legacy') RETURNING id")).rows[0].id;
  await service.update(admin.id,legacy,{nameNepali:'पुरानो शाखा',nameEnglish:'Fictional revised legacy',version:1,reason});
  const h=await service.history(admin.id,legacy,0,{});expect(h.items).toHaveLength(2);expect(h.items[1]).toMatchObject({version:1,actorId:null,reason:'Pre-console metadata snapshot',oldValue:null});
 });
 it('rolls back metadata, history and creation on audit failure; reads fail closed',async()=>{
  const snapshot=await db.query('SELECT * FROM branches WHERE id=$1',[branch.id]),count=(await db.query('SELECT count(*) FROM branch_administration_revisions')).rows[0].count;
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValue(new Error('Fictional audit outage'));
  try{
   await patch({nameNepali:branch.nameNepali,nameEnglish:'Fictional rejected write',version:branch.version,reason}).expect(500);
   await request(app.getHttpServer()).post('/admin/branches').set(auth()).send({...base,code:'AUDFAIL'}).expect(500);
   await request(app.getHttpServer()).get('/admin/branches').set(auth()).expect(500);
   await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/history`).set(auth()).expect(500);
  }finally{spy.mockRestore();}
  expect((await db.query('SELECT * FROM branches WHERE id=$1',[branch.id])).rows).toEqual(snapshot.rows);expect((await db.query('SELECT count(*) FROM branch_administration_revisions')).rows[0].count).toBe(count);
  expect((await db.query("SELECT 1 FROM branches WHERE code='AUDFAIL'")).rows).toHaveLength(0);
 });
 it('validates generation labels and leaves person assignments and graph links unchanged',async()=>{
  const parent=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,1) RETURNING id',[branch.id])).rows[0].id;
  const foreign=(await db.query("SELECT id FROM branches WHERE code='LEGADM'")).rows[0].id;
  const child=(await db.query('INSERT INTO persons(branch_id,generation) VALUES($1,2) RETURNING id',[foreign])).rows[0].id;
  await db.query("INSERT INTO parent_links(parent_id,child_id,confidence) VALUES($1,$2,'VERIFIED')",[parent,child]);
  const graphBefore=(await db.query('SELECT * FROM parent_links ORDER BY id')).rows;
  const before=(await db.query('SELECT id,branch_id,generation FROM persons ORDER BY id')).rows,genBase={generation:2,nameNepali:'दोस्रो पुस्ता',nameEnglish:'Second generation',reason};
  for(const generation of [0,101,1.5,'2',null])await request(app.getHttpServer()).post(`/admin/branches/${branch.id}/generations`).set(auth()).send({...genBase,generation}).expect(400);
  await request(app.getHttpServer()).post(`/admin/branches/${branch.id}/generations`).set(auth(member)).send(genBase).expect(403);
  const responses=await Promise.all([1,2].map(()=>request(app.getHttpServer()).post(`/admin/branches/${branch.id}/generations`).set(auth()).send(genBase)));expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
  const created=responses.find(r=>r.status===201)!.body;
  const edits=await Promise.all(['Revised second generation','Other second generation'].map(nameEnglish=>request(app.getHttpServer()).patch(`/admin/branches/${branch.id}/generations/2`).set(auth()).send({nameNepali:genBase.nameNepali,nameEnglish,version:1,reason})));
  expect(edits.map(r=>r.status).sort()).toEqual([200,409]);const saved=edits.find(r=>r.status===200)!.body;
  const h=(await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/generations/2/history`).set(auth()).expect(200)).body;expect(h.items[0]).toMatchObject({oldValue:created,newValue:saved,actorId:admin.id,reason});
  for(const path of ['0','101','02','1.5','abc'])await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/generations/${path}/history`).set(auth()).expect(400);
  await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/generations/3/history`).set(auth()).expect(404);
  expect((await db.query('SELECT id,branch_id,generation FROM persons ORDER BY id')).rows).toEqual(before);
  expect((await db.query('SELECT * FROM parent_links ORDER BY id')).rows).toEqual(graphBefore);
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValue(new Error('Fictional audit outage'));try{
   await request(app.getHttpServer()).patch(`/admin/branches/${branch.id}/generations/2`).set(auth()).send({nameNepali:genBase.nameNepali,nameEnglish:'Audit rollback label',version:2,reason}).expect(500);
   await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/generations`).set(auth()).expect(500);
  }finally{spy.mockRestore();}
  expect((await service.generations(admin.id,branch.id,{}))[0]).toEqual(saved);
 });
 it('paginates branch and immutable revision reads without gaps',async()=>{
  for(let i=0;i<52;i++)await service.update(admin.id,branch.id,{nameNepali:base.nameNepali,nameEnglish:`Fictional revision ${i}`,version:2+i,reason});
  const first=await service.history(admin.id,branch.id,0,{}),second=await service.history(admin.id,branch.id,0,{before:String(first.nextBefore)});
  expect(first.items).toHaveLength(50);expect(second.items).toHaveLength(4);expect(second.nextBefore).toBeNull();expect(new Set([...first.items,...second.items].map(r=>r.version)).size).toBe(54);
  await db.query(`INSERT INTO branches(code,name_nepali,name_english) SELECT 'PAGEADM'||n,'परीक्षण','Fictional pagination' FROM generate_series(1,55) n`);
  const page=await service.list(admin.id,{}),next=await service.list(admin.id,{after:page.nextAfter});expect(page.items).toHaveLength(50);expect(next.nextAfter).toBeNull();expect(new Set([...page.items,...next.items].map(r=>r.id)).size).toBe(57);
  for(const before of ['0','-1','1.5','2147483648'])await request(app.getHttpServer()).get(`/admin/branches/${branch.id}/history?before=${before}`).set(auth()).expect(400);
 });
 it('refuses migration rollback that would discard governed metadata',async()=>{
  const fs=require('fs'),path=require('path');await expect(db.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/045_branch_administration.down.sql'),'utf8'))).rejects.toThrow('Export and reconcile');
  expect((await service.generations(admin.id,branch.id,{})).length).toBe(1);
 });
});
