import {Test} from '@nestjs/testing';
import {INestApplication} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {randomUUID} from 'crypto';
import {AppModule} from '../src/app.module';
import {DatabaseService} from '../src/database/database.service';
import {AuditOutboxRepository} from '../src/database/repositories/audit-outbox.repository';
import {UserRepository} from '../src/database/repositories/user.repository';
import {SessionRepository} from '../src/database/repositories/session.repository';
import {Role} from '@kashyap/contracts';
import {getJwtSecret,JWT_ISSUER,JWT_AUDIENCE,JWT_ALGORITHM} from '../src/modules/auth/auth.constants';
import {createDisposableDatabase,DisposableDatabase,assertDatabaseIsolation} from './helpers/disposable-db';

describe('Permissioned exact administrative ID lookup',()=>{
 let app:INestApplication,db:DatabaseService,iso:DisposableDatabase,url:string,admin:any,branch:any,member:any,personA:string,personB:string,claimA:string,claimB:string,changeA:string,changeB:string;
 const call=(u:any,type:string,id:string,extra='')=>fetch(`${url}/admin/lookup?type=${type}&id=${id}${extra}`,{headers:{Authorization:`Bearer ${u.token}`}});
 beforeAll(async()=>{
  iso=await createDisposableDatabase('admin_lookup');process.env.DB_NAME=iso.dbName;
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();await app.listen(0,'127.0.0.1');url=await app.getUrl();db=app.get(DatabaseService);await assertDatabaseIsolation(db,iso.dbName);
  const b=[];for(const code of ['LOOKUP_A','LOOKUP_B'])b.push((await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES($1,'परीक्षण','Fictional lookup branch') RETURNING id",[code])).rows[0].id);
  const users=app.get(UserRepository),sessions=app.get(SessionRepository),jwt=app.get(JwtService);
  async function actor(role:Role,n:number,branchId:string|null=null){const u=await users.findOrCreateByPhone('+97798566000'+n);await users.assignRole(u.id,role,branchId);
   const s=await sessions.createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'web',expiresAt:new Date(Date.now()+3600000)});
   return {id:u.id,token:jwt.sign({sub:u.id,sid:s.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM,expiresIn:'15m'})};}
  admin=await actor(Role.SUPER_ADMIN,1);branch=await actor(Role.BRANCH_ADMIN,2,b[0]);member=await actor(Role.VERIFIED_MEMBER,3);
  const people=[];for(const id of b)people.push((await db.query('INSERT INTO persons(branch_id,generation,birth_year_bs) VALUES($1,3,2040) RETURNING id',[id])).rows[0].id);[personA,personB]=people;
  const secondClaimant=await actor(Role.VERIFIED_MEMBER,4);
  const claims=[],changes=[];for(const [i,p] of people.entries()){const claimant=i===0?member:secondClaimant;claims.push((await db.query("INSERT INTO profile_claims(target_person_id,claimant_user_id,relationship_description) VALUES($1,$2,'Fictional lookup claim') RETURNING id",[p,claimant.id])).rows[0].id);
   changes.push((await db.query("INSERT INTO genealogy_change_requests(target_person_id,requester_user_id,request_type,proposed_changes,reason) VALUES($1,$2,'UPDATE_PERSON','{}','Fictional lookup correction') RETURNING id",[p,member.id])).rows[0].id);}[claimA,claimB]=claims;[changeA,changeB]=changes;
 },45000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('returns each exact record type, no-store, and a minimal account projection without credentials or phone',async()=>{
  for(const [type,id] of [['PERSON',personA],['USER',member.id],['CLAIM',claimA],['CHANGE_REQUEST',changeA]]){
   const res=await call(admin,type,id);expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');const body=await res.json() as any;expect(body.id).toBe(id);expect(body.type).toBe(type);
   if(type==='USER'){expect(Object.keys(body.result).sort()).toEqual(['createdAt','id','isActive','isPhoneVerified','isSuspended','personId','roles']);expect(JSON.stringify(body)).not.toContain('+977');}
  }
 });
 it('enforces current roles and branch scope, conceals cross-branch records and refuses branch account lookup',async()=>{
  expect((await call(member,'PERSON',personA)).status).toBe(403);
  for(const [type,local,other] of [['PERSON',personA,personB],['CLAIM',claimA,claimB],['CHANGE_REQUEST',changeA,changeB]]){expect((await call(branch,type,local)).status).toBe(200);expect((await call(branch,type,other)).status).toBe(404);}
  expect((await call(branch,'USER',member.id)).status).toBe(403);
  await db.query('DELETE FROM user_roles WHERE user_id=$1',[branch.id]);expect((await call(branch,'PERSON',personA)).status).toBe(403);
 });
 it('rejects non-exact IDs, unknown types and forged query fields; missing records return 404',async()=>{
  expect((await call(admin,'USER',member.id.slice(0,8))).status).toBe(400);expect((await call(admin,'SESSIONS',member.id)).status).toBe(400);
  expect((await call(admin,'USER',member.id,'&actorId='+admin.id)).status).toBe(400);
  expect((await call(admin,'USER',randomUUID())).status).toBe(404);
 });
 it('audits successful account access without response data and fails closed when audit storage fails',async()=>{
  expect((await call(admin,'USER',member.id)).status).toBe(200);
  const event=(await db.query("SELECT * FROM audit_outbox WHERE action='ADMIN_EXACT_ID_LOOKUP' AND entity_id=$1 ORDER BY created_at DESC LIMIT 1",[member.id])).rows[0];expect(event.actor_id).toBe(admin.id);expect(event.new_value).toEqual({lookupType:'USER'});
  const spy=jest.spyOn(app.get(AuditOutboxRepository),'recordAuditIntent').mockRejectedValueOnce(new Error('Fictional audit unavailable'));
  try{const res=await call(admin,'USER',member.id);expect(res.status).toBe(500);expect(await res.text()).not.toContain(member.id);}finally{spy.mockRestore();}
 });
});
