import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { PersonRepository } from '../src/database/repositories/person.repository';
import { CulturalRulesService } from '../src/modules/cultural-rules/cultural-rules.service';
import { Role, RuleType } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Durable cultural proposals: fictional authority assignments only',()=>{
 let app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository,service:CulturalRulesService,iso:DisposableDatabase,url:string;
 let author:any,reviewer:any,senior:any,outsider:any;
 const body=()=>({ruleType:RuleType.NATA_SAINO,pathCode:'F',nepaliTerm:'परीक्षण मात्र',englishTerm:'Fictional candidate only',rationale:'Fictional source; not approved cultural evidence',proposedByUserId:author.id});
 async function call(actor:any,path:string,data?:any){return fetch(url+'/cultural/rule-proposals'+path,{method:data===undefined?'GET':'POST',headers:{...(actor?{Authorization:'Bearer '+actor.token}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});}
 async function create(){return service.proposeRule(body(),author);}
 const review=(id:string,actor=reviewer)=>service.reviewRule({ruleId:id,reviewerUserId:actor.id,reviewerNotes:'Fictional textual review',isEndorsed:true},actor);
 const decide=(id:string,actor=senior)=>service.approveRule({ruleId:id,seniorAuthorityUserId:actor.id,authorityComments:'Fictional independent decision only',decision:'APPROVED'},actor);
 beforeAll(async()=>{
  iso=await createDisposableDatabase('cultural_proposals');process.env.DB_NAME=iso.dbName;
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();await app.listen(0,'127.0.0.1');url=await app.getUrl();
  db=app.get(DatabaseService);audit=app.get(AuditOutboxRepository);service=app.get(CulturalRulesService);await assertDatabaseIsolation(db,iso.dbName);
  const users=app.get(UserRepository),sessions=app.get(SessionRepository),jwt=app.get(JwtService);
  async function actor(n:number){const u=await users.findOrCreateByPhone('+97798577100'+n);await users.assignRole(u.id,Role.CULTURAL_HISTORIAN);await users.setPhoneVerified(u.id);
   const s=await sessions.createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'web',expiresAt:new Date(Date.now()+3600000)});
   await db.query('INSERT INTO account_authenticators(user_id,generation,enabled_at) VALUES($1,1,CURRENT_TIMESTAMP)',[u.id]);
   await db.query('UPDATE user_sessions SET mfa_verified_at=CURRENT_TIMESTAMP,mfa_generation=1 WHERE id=$1',[s.id]);
   return {id:u.id,sessionId:s.id,roles:[Role.CULTURAL_HISTORIAN],roleAssignments:[],token:jwt.sign({sub:u.id,sid:s.id,tokenType:'access'},{secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM,expiresIn:'15m'})};}
  author=await actor(1);reviewer=await actor(2);senior=await actor(3);outsider=await actor(4);
  // Fixture provisioning does not authorize real accounts or activate domain rules.
  for(const [user,duty] of [[reviewer,'REVIEWER'],[senior,'SENIOR_APPROVER']] as const){
   await db.query('INSERT INTO cultural_rule_authorities(user_id,rule_type,duty,assigned_by,provenance) VALUES($1,$2,$3,$4,$5)',[user.id,RuleType.NATA_SAINO,duty,author.id,'Isolated fictional test authority; never a real approval']);
  }
 },45000);
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires authentication, matching actor identity, strict metadata and private response caching',async()=>{
  expect((await call(null,'',body())).status).toBe(401);
  expect((await call(author,'',{...body(),proposedByUserId:outsider.id})).status).toBe(403);
  expect((await call(author,'',{...body(),rationale:' '})).status).toBe(400);
  expect((await call(author,'',{...body(),extra:'untrusted'})).status).toBe(400);
  const res=await call(author,'',body());expect(res.status).toBe(201);expect(res.headers.get('cache-control')).toBe('private, no-store');
 });
 it('persists through service replacement, keeps drafts private, and scopes authority per rule type',async()=>{
  const p=await create(),restarted=new CulturalRulesService(db,app.get(PersonRepository),audit);
  expect((await restarted.getProposal(p.id,author)).id).toBe(p.id);
  expect((await call(outsider,'/'+p.id)).status).toBe(404);
  expect((await call(outsider,'/'+p.id+'/history')).status).toBe(404);
  const list=await (await call(outsider,'')).json() as any;expect(list.items).toEqual([]);
  expect((await (await call(reviewer,'')).json() as any).items.some((x:any)=>x.id===p.id)).toBe(true);
  const other=await service.proposeRule({...body(),ruleType:RuleType.JUTHO_SUTOK},author);
  await expect(review(other.id)).rejects.toThrow('Current explicit');
  expect((await call(reviewer,'/'+other.id)).status).toBe(404);
  expect((await call(author,'?before=invalid')).status).toBe(400);
 });
 it('requires three independent actors and cannot infer final authority from administrative claims',async()=>{
  const p=await create();
  await expect(review(p.id,{...author,roles:[Role.SUPER_ADMIN]})).rejects.toThrow('Current explicit');
  await expect(decide(p.id)).rejects.toThrow('reviewed before');
  const selfProposal=await service.proposeRule({...body(),proposedByUserId:reviewer.id},reviewer);
  await expect(review(selfProposal.id)).rejects.toThrow('Separation of duties');
  await review(p.id);
  await db.query('INSERT INTO cultural_rule_authorities(user_id,rule_type,duty,assigned_by,provenance) VALUES($1,$2,$3,$4,$5)',[reviewer.id,RuleType.NATA_SAINO,'SENIOR_APPROVER',author.id,'Fictional overlapping duties test; independence is per proposal']);
  await expect(decide(p.id,reviewer)).rejects.toThrow('independent');
  await expect(decide(p.id,{...outsider,roles:[Role.SUPER_ADMIN]})).rejects.toThrow('Current explicit');
  await expect(service.reviewRule({ruleId:p.id,reviewerUserId:reviewer.id,reviewerNotes:'Spoofed actor',isEndorsed:true},outsider)).rejects.toThrow('Actor identity');
  await decide(p.id);
  const h=await service.proposalHistory(p.id,author);expect(h.map(x=>x.toStatus)).toEqual(['PROPOSED','REVIEWED','APPROVED']);
  expect(new Set(h.map(x=>x.actorId)).size).toBe(3);
 });
 it('retains rejected reviews as terminal without allowing later endorsement or final approval',async()=>{
  const p=await create();await service.reviewRule({ruleId:p.id,reviewerUserId:reviewer.id,reviewerNotes:'Fictional evidence does not support proposed term',isEndorsed:false},reviewer);
  await expect(review(p.id)).rejects.toThrow('no longer awaiting');await expect(decide(p.id)).rejects.toThrow('reviewed before');
  expect((await service.getProposal(p.id,author)).status).toBe('REJECTED');expect(await service.proposalHistory(p.id,author)).toHaveLength(2);
 });
 it('serializes concurrent review and decision attempts, retaining exactly one event and audit for each',async()=>{
  const p=await create();
  const reviewed=await Promise.allSettled([review(p.id),review(p.id)]);expect(reviewed.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const approved=await Promise.allSettled([decide(p.id),decide(p.id)]);expect(approved.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const counts=(await db.query(`SELECT (SELECT count(*) FROM cultural_rule_proposal_events WHERE proposal_id=$1) AS events,
    (SELECT count(*) FROM audit_outbox WHERE entity_id=$1::text AND entity_type='CULTURAL_RULE_PROPOSAL') AS audits`,[p.id])).rows[0];
  expect(Number(counts.events)).toBe(3);expect(Number(counts.audits)).toBe(3);
 });
 it('rolls back proposal state and history when same-transaction audit evidence cannot be recorded',async()=>{
  const p=await create();const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Fictional audit outage'));
  try{await expect(review(p.id)).rejects.toThrow('Fictional audit outage');}finally{spy.mockRestore();}
  expect((await service.getProposal(p.id,author)).status).toBe('PROPOSED');expect(await service.proposalHistory(p.id,author)).toHaveLength(1);
  await review(p.id);
 });
 it('rejects suspended signers and revoked reviewer assignments before final approval',async()=>{
  const p=await create();await review(p.id);await db.query('UPDATE user_accounts SET is_suspended=TRUE WHERE id=$1',[reviewer.id]);
  try{await expect(decide(p.id)).rejects.toThrow('Current explicit');}finally{await db.query('UPDATE user_accounts SET is_suspended=FALSE WHERE id=$1',[reviewer.id]);}
  await db.query("UPDATE cultural_rule_authorities SET revoked_at=NOW() WHERE user_id=$1 AND duty='REVIEWER' AND revoked_at IS NULL",[reviewer.id]);
  try{await expect(decide(p.id)).rejects.toThrow('Current explicit');}finally{
   await db.query('INSERT INTO cultural_rule_authorities(user_id,rule_type,duty,assigned_by,provenance) VALUES($1,$2,$3,$4,$5)',[reviewer.id,RuleType.NATA_SAINO,'REVIEWER',author.id,'Fictional renewed assignment after revocation']);
  }
  expect((await service.getProposal(p.id,author)).status).toBe('REVIEWED');
 });
 it('rejects stale session authentication and replaced authenticator generations without decision writes',async()=>{
  const p=await create();
  await db.query('UPDATE user_sessions SET mfa_generation=0 WHERE id=$1',[reviewer.sessionId]);
  try{await expect(review(p.id)).rejects.toThrow('authenticator-verified');}finally{await db.query('UPDATE user_sessions SET mfa_generation=1 WHERE id=$1',[reviewer.sessionId]);}
  await db.query("UPDATE user_sessions SET authenticated_at=CURRENT_TIMESTAMP-INTERVAL '2 hours' WHERE id=$1",[reviewer.sessionId]);
  try{await expect(review(p.id)).rejects.toThrow('authenticator-verified');}finally{await db.query('UPDATE user_sessions SET authenticated_at=CURRENT_TIMESTAMP WHERE id=$1',[reviewer.sessionId]);}
  expect((await service.getProposal(p.id,author)).status).toBe('PROPOSED');expect(await service.proposalHistory(p.id,author)).toHaveLength(1);
 });
 it('retains immutable proposal content, decisions and assignment evidence without changing active rulesets',async()=>{
  const before=(await db.query('SELECT * FROM domain_rulesets ORDER BY id')).rows;
  const p=await create();await review(p.id);await decide(p.id);
  await expect(db.query('UPDATE cultural_rule_proposals SET nepali_term=$2 WHERE id=$1',[p.id,'Altered'])).rejects.toThrow('CONTENT_IMMUTABLE');
  await expect(db.query("UPDATE cultural_rule_proposals SET status='REVIEWED' WHERE id=$1",[p.id])).rejects.toThrow('TRANSITION_FORBIDDEN');
  await expect(db.query('DELETE FROM cultural_rule_proposals WHERE id=$1',[p.id])).rejects.toThrow('RETAINED');
  await expect(db.query('DELETE FROM cultural_rule_proposal_events WHERE proposal_id=$1',[p.id])).rejects.toThrow('IMMUTABLE');
  await expect(db.query('UPDATE cultural_rule_authorities SET provenance=$2 WHERE user_id=$1',[senior.id,'Changed'])).rejects.toThrow('RETAINED');
  expect((await db.query('SELECT * FROM domain_rulesets ORDER BY id')).rows).toEqual(before);
 });
});
