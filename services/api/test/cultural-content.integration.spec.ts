import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { CulturalContentService } from '../src/modules/cultural-rules/cultural-content.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Governed cultural revision CMS (fictional content only)',()=>{
 let app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository,iso:DisposableDatabase,url:string;
 let author:any,reviewer:any,approver:any,member:any;
 const draft=(slug='fictional-'+randomUUID())=>({slug,titleNepali:'परीक्षण इतिहास',titleEnglish:'Fictional history',contentNepali:'यो परीक्षण सामग्री मात्र हो।',contentEnglish:'Fictional source text.',category:'HISTORY',keywords:['fictionalkeyword'],provenance:'Isolated fictional test fixture; no cultural authority evidence'});
 async function call(actor:any,path:string,body?:any){return fetch(url+'/cultural/content'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+actor.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 async function create(){const res=await call(author,'/documents',draft());expect(res.status).toBe(201);return res.json() as Promise<any>;}
 async function step(d:any,actor:any,action:string,revision=1){const res=await call(actor,`/documents/${d.id}/transition`,{version:d.version,revision,action,reason:'Fictional independent '+action});expect(res.status).toBe(201);Object.assign(d,await res.json());}
 async function prepare(d:any,revision=1){
  let res=await call(author,`/documents/${d.id}/approver`,{version:d.version,approverId:approver.id,reason:'Explicit fictional test representative designation'});expect(res.status).toBe(201);Object.assign(d,await res.json());
  await step(d,author,'SUBMIT',revision);await step(d,reviewer,'REVIEW',revision);await step(d,approver,'APPROVE',revision);
 }
 beforeAll(async()=>{
  iso=await createDisposableDatabase('cultural_cms');process.env.DB_NAME=iso.dbName;
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();await app.listen(0,'127.0.0.1');url=await app.getUrl();
  db=app.get(DatabaseService);audit=app.get(AuditOutboxRepository);await assertDatabaseIsolation(db,iso.dbName);
  const users=app.get(UserRepository),sessions=app.get(SessionRepository),jwt=app.get(JwtService);
  async function actor(role:Role,n:number){const u=await users.findOrCreateByPhone('+97798577000'+n);await users.assignRole(u.id,role);await users.setPhoneVerified(u.id);
   const s=await sessions.createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'web',expiresAt:new Date(Date.now()+3600000)});
   return {id:u.id,token:jwt.sign({sub:u.id,sid:s.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM,expiresIn:'15m'})};}
  author=await actor(Role.SUPER_ADMIN,1);reviewer=await actor(Role.CULTURAL_HISTORIAN,2);approver=await actor(Role.VERIFIED_MEMBER,3);member=await actor(Role.VERIFIED_MEMBER,4);
 },45000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('hides draft history from members, rejects forged actors and self-review, and requires explicit independent designation',async()=>{
  const d=await create();expect((await call(member,`/documents/${d.id}/history`)).status).toBe(404);
  expect((await call(member,'/documents',draft())).status).toBe(403);
  expect((await call(author,'/documents',{...draft(),authorId:approver.id})).status).toBe(400);
  expect((await call(author,`/documents/${d.id}/approver`,{version:d.version,approverId:author.id,reason:'Invalid self approval'})).status).toBe(403);
  await step(d,author,'SUBMIT');expect((await call(author,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'REVIEW',reason:'Invalid self review'})).status).toBe(403);
  expect((await call(approver,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'APPROVE',reason:'Unassigned approval'})).status).toBe(404);
  expect((await call(author,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'PUBLISH',reason:'Unapproved publish'})).status).toBe(409);
 });
 it('publishes only reviewed approved content, searches approved keywords/body and persists across a service instance',async()=>{
  const d=await create();let articles=await (await call(member,'/published?q=fictionalkeyword')).json() as any[];expect(articles.some(a=>a.id===d.id)).toBe(false);
  await prepare(d);await step(d,author,'PUBLISH');
  articles=await (await call(member,'/published?q=fictionalkeyword')).json() as any[];const article=articles.find(a=>a.id===d.id);expect(article).toMatchObject({version:1,author_id:author.id,reviewer_id:reviewer.id,approved_by:approver.id});expect(article.published_at).toBeTruthy();
  const restarted=new CulturalContentService(db,audit);expect((await restarted.published('source')).some(a=>a.id===d.id)).toBe(true);
  expect((await call(member,`/documents/${d.id}/events`)).status).toBe(404);
  const history=await (await call(approver,`/documents/${d.id}/history`)).json() as any;expect(history.items[0].state).toBe('PUBLISHED');
 });
 it('retains old published content during drafts, supersedes it without overwriting and archives current visibility',async()=>{
  const d=await create();await prepare(d);await step(d,author,'PUBLISH');
  const {slug,...b}=draft();const res=await call(author,`/documents/${d.id}/revisions`,{...b,contentNepali:'नयाँ परीक्षण सामग्री।',version:d.version,reason:'New fictional revision'});expect(res.status).toBe(201);Object.assign(d,await res.json());
  const current=await (await call(member,'/published?q=fictionalkeyword')).json() as any[];expect(current.find(x=>x.id===d.id).version).toBe(1);
  await prepare(d,2);await step(d,author,'PUBLISH',2);
  const h=await (await call(author,`/documents/${d.id}/history`)).json() as any;expect(h.items[0].state).toBe('PUBLISHED');expect(h.items[1]).toMatchObject({state:'SUPERSEDED',content_nepali:'यो परीक्षण सामग्री मात्र हो।'});
  await step(d,author,'ARCHIVE',2);expect((await (await call(member,'/published?q=fictionalkeyword')).json() as any[]).some(x=>x.id===d.id)).toBe(false);
 });
 it('serializes duplicate concurrent publication and atomically rolls back audit failures',async()=>{
  const d=await create();await prepare(d);const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Fictional unavailable audit outbox'));
  try{expect((await call(author,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'PUBLISH',reason:'Audit rollback test'})).status).toBe(500);}finally{spy.mockRestore();}
  const after=(await db.query('SELECT * FROM cultural_documents WHERE id=$1',[d.id])).rows[0];expect(after.version).toBe(d.version);expect(after.published_revision).toBeNull();
  const body={version:d.version,revision:1,action:'PUBLISH',reason:'Concurrent publication'};
  const results=await Promise.all([call(author,`/documents/${d.id}/transition`,body),call(author,`/documents/${d.id}/transition`,body)]);expect(results.map(x=>x.status).sort()).toEqual([201,409]);
  expect(Number((await db.query("SELECT count(*) FROM cultural_revision_events WHERE document_id=$1 AND action='PUBLISH'",[d.id])).rows[0].count)).toBe(1);
 });
 it('refuses publication after approval account suspension or reviewer role revocation',async()=>{
  const d=await create();await prepare(d);await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[approver.id]);
  try{expect((await call(author,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'PUBLISH',reason:'Inactive signer'})).status).toBe(403);}finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[approver.id]);}
  await db.query('DELETE FROM user_roles WHERE user_id=$1',[reviewer.id]);
  try{expect((await call(author,`/documents/${d.id}/transition`,{version:d.version,revision:1,action:'PUBLISH',reason:'Revoked reviewer'})).status).toBe(403);}finally{await app.get(UserRepository).assignRole(reviewer.id,Role.CULTURAL_HISTORIAN);}
 });
 it('preserves replaced drafts and decisions, rejects invalid pagination and protects concurrent revision edits',async()=>{
  const d=await create();const {slug,...b}=draft();const body={...b,version:d.version,reason:'Correct fictional source text'};
  const results=await Promise.all([call(author,`/documents/${d.id}/revisions`,body),call(author,`/documents/${d.id}/revisions`,body)]);expect(results.map(x=>x.status).sort()).toEqual([201,409]);
  const h=await (await call(author,`/documents/${d.id}/history`)).json() as any;expect(h.items.map((x:any)=>x.state)).toEqual(['DRAFT','ARCHIVED']);
  const events=await (await call(author,`/documents/${d.id}/events`)).json() as any;expect(events.items.map((x:any)=>x.action)).toEqual(['REVISED','DRAFT_REPLACED','CREATED']);
  expect((await call(author,`/documents/${d.id}/events?before=9223372036854775808`)).status).toBe(400);
  expect((await call(author,`/documents/${d.id}/history?before=NaN`)).status).toBe(400);
 });
});
