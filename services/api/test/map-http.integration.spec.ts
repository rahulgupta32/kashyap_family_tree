import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { MapService } from '../src/modules/map/map.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret,JWT_ISSUER,JWT_AUDIENCE,JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation } from './helpers/disposable-db';
describe('Household consent, independent review and map disclosure (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,map:MapService,branch:string,owners:any[],admin:any,outsider:any;
 const base={title:'Fictional household',district:'Fictional District',municipality:'Fictional Locality',latitude:28.238765,longitude:83.998123,visibility:'PUBLIC_AGGREGATE',mapConsent:true,protectedLocation:false,version:0};
 const auth=(u:any)=>`Bearer ${u.token}`;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('map');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);map=module.get(MapService);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('MAP_TEST','परीक्षण','Fictional Map Branch') RETURNING id")).rows[0].id;
  async function user(phone:string,role:Role){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,role,branch);
   const p=(await db.query("INSERT INTO persons(branch_id,gender,living_status,generation,birth_year_bs,is_claimed,claimed_by_user_id,profile_visibility) VALUES($1,'FEMALE','LIVING',3,2040,true,$2,'PUBLIC') RETURNING id",[branch,u.id])).rows[0];
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[u.id,p.id]);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'map-test',expiresAt:new Date(Date.now()+3600000)});
   const token=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,personId:p.id,roles:[role],roleAssignments:[{role,branchId:branch}],branchIds:[branch],token};
  }
  admin=await user('+9779847400001',Role.BRANCH_ADMIN);outsider=await user('+9779847400002',Role.VERIFIED_MEMBER);owners=[];
  for(let i=0;i<3;i++)owners.push(await user(`+977984740000${i+3}`,Role.VERIFIED_MEMBER));
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('does not accept a query flag as map authorization and requires authenticated editing',async()=>{
  await request(app.getHttpServer()).get('/map/households?isVerified=true').expect(400);
  await request(app.getHttpServer()).put('/map/mine').send(base).expect(401);
  expect((await request(app.getHttpServer()).get('/map/households').expect(200)).body.data).toEqual([]);
 });
 it('rounds coordinates before persistence, denies identity spoofing and hides pending proposals',async()=>{
  await request(app.getHttpServer()).put('/map/mine').set('Authorization',auth(owners[0])).send({...base,ownerUserId:admin.id}).expect(400);
  const result=(await request(app.getHttpServer()).put('/map/mine').set('Authorization',auth(owners[0])).send(base).expect(200)).body;
  expect(Number(result.approx_latitude)).toBe(28.2);expect(Number(result.approx_longitude)).toBe(84);
  expect(await map.getHouseholds({},admin)).toEqual([]);
  const audit=(await db.query('SELECT new_value FROM audit_outbox WHERE entity_id=$1',[result.id])).rows;
  expect(JSON.stringify(audit)).not.toContain('28.238765');
 });
 it('requires independent branch authority and commits stale review rejection without disclosure',async()=>{
  const own=await map.mine(owners[0]);await expect(map.review(own.id,owners[0],{version:own.version,decision:'APPROVE',reason:'Self approval'})).rejects.toThrow('Independent branch administrator');
  await map.review(own.id,admin,{version:own.version,decision:'APPROVE',reason:'Reviewed fictional household consent'});
  await expect(map.review(own.id,admin,{version:own.version,decision:'APPROVE',reason:'Stale retry'})).rejects.toThrow('stale');
  expect(await map.getDistrictClusters()).toEqual([]);
 });
 it('publishes only fixed district cells after three households opt in, without person IDs',async()=>{
  for(const owner of owners.slice(1)){const h=await map.save(owner,base);await map.review(h.id,admin,{version:h.version,decision:'APPROVE',reason:'Independent review'});}
  const data=(await request(app.getHttpServer()).get('/map/clusters').expect(200)).body.data;
  expect(data).toHaveLength(1);expect(data[0]).toMatchObject({approxLatitude:28,approxLongitude:84,totalHouseholds:3,precision:'DISTRICT'});
  expect(JSON.stringify(data)).not.toContain(owners[0].personId);expect(JSON.stringify(data)).not.toContain('Fictional household');
  // Bounding a fraction of the original point cannot recover an address or single-household count.
  expect(await map.getDistrictClusters({minLat:28.1,maxLat:28.3,minLng:83.9,maxLng:84.1})).toEqual([]);
 });
 it('intersects profile privacy and verified family links, and hides minor/protected locations',async()=>{
  await db.query("UPDATE persons SET profile_visibility='IMMEDIATE_FAMILY' WHERE id=$1",[owners[0].personId]);
  expect((await map.getHouseholds({},outsider)).map(r=>r.id)).not.toContain((await map.mine(owners[0])).id);
  await db.query("INSERT INTO spouse_links(person_id,spouse_id,confidence) VALUES($1,$2,'UNVERIFIED')",[owners[0].personId,outsider.personId]);
  expect((await map.getHouseholds({},outsider))).toHaveLength(2);
  await db.query("UPDATE spouse_links SET confidence='VERIFIED' WHERE person_id=$1",[owners[0].personId]);expect(await map.getHouseholds({},outsider)).toHaveLength(3);
  await db.query('UPDATE persons SET birth_year_bs=2080 WHERE id=$1',[owners[0].personId]);expect(await map.getHouseholds({},outsider)).toHaveLength(2);
  await db.query("UPDATE persons SET birth_year_bs=2040,profile_visibility='PUBLIC' WHERE id=$1",[owners[0].personId]);
  await db.query('UPDATE household_locations SET protected_location=true WHERE owner_user_id=$1',[owners[1].id]);expect(await map.getDistrictClusters()).toEqual([]);
 });
 it('reads durable audit metadata and real role-scoped dashboard counts',async()=>{
  await request(app.getHttpServer()).get('/audit').set('Authorization',auth(outsider)).expect(403);
  const dashboard=(await request(app.getHttpServer()).get('/audit/dashboard').set('Authorization',auth(admin)).expect(200)).body;
  expect(dashboard.scope).toBe('ASSIGNED_BRANCHES');expect(dashboard.persons).toBe(5);
 });
 it('withdraws consent immediately, removes saved coordinates and prevents stale restoration',async()=>{
  const before=await map.mine(owners[0]);await request(app.getHttpServer()).delete('/map/mine').set('Authorization',auth(owners[0])).expect(200);
  expect(await map.mine(owners[0])).toMatchObject({map_consent:false,approx_latitude:null,approx_longitude:null,status:'WITHDRAWN'});
  await expect(map.save(owners[0],{...base,version:before.version})).rejects.toThrow('Household changed');
  expect(await map.getDistrictClusters()).toEqual([]);
 });
});
