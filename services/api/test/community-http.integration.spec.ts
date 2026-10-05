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
import { CommunityService } from '../src/modules/community/community.service';
import { Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../src/modules/auth/auth.constants';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Community persistent HTTP workflows and isolation',()=>{
 let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,audit:AuditOutboxRepository;
 let branch:string,otherBranch:string,author:any,reader:any,moderator:any,secondModerator:any,outsider:any,post:any;
 const token=(user:any)=>`Bearer ${user.token}`;
 beforeAll(async()=>{
  iso=await createDisposableDatabase('community');await assertDatabaseIsolation(iso.client,iso.dbName);
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
  db=module.get(DatabaseService);audit=module.get(AuditOutboxRepository);await assertDatabaseIsolation(db,iso.dbName);
  branch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('COM_A','परीक्षण अ','Fictional A') RETURNING id")).rows[0].id;
  otherBranch=(await db.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('COM_B','परीक्षण ब','Fictional B') RETURNING id")).rows[0].id;
  async function user(phone:string,role:Role,b:string){
   const u=await module.get(UserRepository).findOrCreateByPhone(phone);await module.get(UserRepository).assignRole(u.id,role,b);
   const session=await module.get(SessionRepository).createSession({userId:u.id,refreshTokenHash:randomUUID(),devicePlatform:'WEB',ipAddress:'127.0.0.1',userAgent:'community-test',expiresAt:new Date(Date.now()+3600000)});
   const jwt=module.get(JwtService).sign({sub:u.id,sid:session.id,phoneNumber:phone,tokenType:'access'}, {secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
   return {id:u.id,token:jwt,roles:[role],branchIds:[b],roleAssignments:[{role,branchId:b}]};
  }
  author=await user('+9779847200001',Role.VERIFIED_MEMBER,branch);reader=await user('+9779847200002',Role.VERIFIED_MEMBER,branch);
  secondModerator=await user('+9779847200005',Role.BRANCH_ADMIN,branch);
  moderator=await user('+9779847200003',Role.BRANCH_ADMIN,branch);outsider=await user('+9779847200004',Role.BRANCH_ADMIN,otherBranch);
 });
 afterAll(async()=>{if(app)await app.close();if(iso)await iso.drop();});
 it('requires authentication and rejects author impersonation',async()=>{
  await request(app.getHttpServer()).get('/community/posts').expect(401);
  await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Fiction',content:'Fictional message',category:'DISCUSSION',authorUserId:moderator.id}).expect(400);
 });
 it.each(['MISSING_PERSON','PROPERTY_ROOM','ASSISTANCE','COMMUNITY_PROGRAM'])('supports required %s category without bypassing moderation or branch privacy',async category=>{
  const created=(await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Category fixture',content:'Fictional category fixture',category,branchId:branch}).expect(201)).body;
  expect(created.category).toBe(category);expect(created.moderationStatus).toBe('PENDING');
  expect((await request(app.getHttpServer()).get('/community/posts').set('Authorization',token(reader)).expect(200)).body.some((p:any)=>p.id===created.id)).toBe(false);
  await request(app.getHttpServer()).get(`/community/posts/${created.id}/comments`).set('Authorization',token(outsider)).expect(403);
  const edited=(await request(app.getHttpServer()).put(`/community/posts/${created.id}`).set('Authorization',token(author)).send({title:created.title,content:'Edited category fixture',category,version:created.version,reason:'Correct category fixture'}).expect(200)).body;
  expect(edited.category).toBe(category);expect(edited.moderationStatus).toBe('PENDING');
 });
 it('creates pending content using session identity and scopes branch access',async()=>{
  await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Fiction',content:'Fictional message',category:'DISCUSSION',branchId:otherBranch}).expect(403);
  post=(await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Fictional announcement discussion',content:'Fictional community acceptance message',category:'DISCUSSION',branchId:branch}).expect(201)).body;
  expect(post.authorUserId).toBe(author.id);expect(post.moderationStatus).toBe('PENDING');
  expect((await request(app.getHttpServer()).get('/community/posts').set('Authorization',token(reader)).expect(200)).body.some((p:any)=>p.id===post.id)).toBe(false);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/comments`).set('Authorization',token(outsider)).expect(403);
 });
 it('requires the correct moderator and records durable publication audit',async()=>{
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(outsider)).send({decision:'PUBLISHED',version:post.version,notes:'Fictional review'}).expect(403);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:post.version,notes:'Fictional independent approval'}).expect(201);
  const reopened=new CommunityService(db,audit);
  expect((await reopened.listPosts(reader)).some(p=>p.id===post.id&&p.moderationStatus==='PUBLISHED')).toBe(true);
  expect((await db.query("SELECT id FROM audit_outbox WHERE entity_id=$1 AND action='COMMUNITY_POST_MODERATED'",[post.id])).rows).toHaveLength(1);
 });
 it('keeps repeated concurrent likes idempotent in PostgreSQL',async()=>{
  await Promise.all(Array.from({length:8},()=>request(app.getHttpServer()).put(`/community/posts/${post.id}/like`).set('Authorization',token(reader)).send({liked:true}).expect(200)));
  expect((await db.query('SELECT count(*)::int AS count FROM community_reactions WHERE post_id=$1',[post.id])).rows[0].count).toBe(1);
  await request(app.getHttpServer()).put(`/community/posts/${post.id}/like`).set('Authorization',token(reader)).send({liked:false}).expect(200);
 });
 it('persists comments with authenticated author and rejects invalid reply targets',async()=>{
  const comment=(await request(app.getHttpServer()).post(`/community/posts/${post.id}/comments`).set('Authorization',token(reader)).send({content:'Fictional participant reply'}).expect(201)).body;
  expect(comment.authorUserId).toBe(reader.id);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/comments`).set('Authorization',token(reader)).send({content:'Forged sender',authorUserId:author.id}).expect(400);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/comments`).set('Authorization',token(reader)).send({content:'Invalid parent',parentCommentId:randomUUID()}).expect(400);
  expect((await request(app.getHttpServer()).get(`/community/posts/${post.id}/comments`).set('Authorization',token(author)).expect(200)).body[0].id).toBe(comment.id);
 });
 it('hides reported content and requires a current-version moderator decision',async()=>{
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/flag`).set('Authorization',token(reader)).send({reason:'Fictional policy review request'}).expect(201);
  const queue=(await request(app.getHttpServer()).get('/community/posts?queue=true').set('Authorization',token(moderator)).expect(200)).body;
  const pending=queue.find((p:any)=>p.id===post.id);expect(pending.reportsCount).toBe(1);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/comments`).set('Authorization',token(reader)).expect(404);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:1,notes:'Stale review attempt'}).expect(409);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:pending.version,notes:'Resolved fictional report'}).expect(201);
 });
 it('returns published edits to moderation with restricted durable revision history',async()=>{
  const current=(await db.query('SELECT * FROM community_posts WHERE id=$1',[post.id])).rows[0];
  const payload={title:current.title,content:'Updated fictional content',category:'DISCUSSION',version:current.version,reason:'Correct fictional gathering details'};
  await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(reader)).send(payload).expect(403);
  await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(moderator)).send(payload).expect(403);
  await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(author)).send({...payload,branchId:otherBranch}).expect(400);
  const edited=(await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(author)).send(payload).expect(200)).body;
  expect(edited.moderationStatus).toBe('PENDING');expect(edited.version).toBe(current.version+1);expect(edited.canEdit).toBe(true);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/comments`).set('Authorization',token(reader)).expect(404);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions`).set('Authorization',token(reader)).expect(404);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions`).set('Authorization',token(outsider)).expect(403);
  const rows=(await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions`).set('Authorization',token(moderator)).expect(200)).body;
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({version:edited.version,content:payload.content,reason:payload.reason});
  expect(rows[1].content).toBe('Fictional community acceptance message');
  expect(rows[0].editorUserId).toBeUndefined();
  const reopened=new CommunityService(db,audit);expect(await reopened.revisions(post.id,author)).toHaveLength(2);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:current.version,notes:'Stale pre-edit approval'}).expect(409);
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:edited.version,notes:'Review updated content independently'}).expect(201);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions`).set('Authorization',token(reader)).expect(403);
 });
 it('serializes competing edits and retains exactly one winning revision',async()=>{
  const current=(await db.query('SELECT * FROM community_posts WHERE id=$1',[post.id])).rows[0];
  const results=await Promise.all(['First competing edit','Second competing edit'].map(content=>request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(author)).send({title:current.title,content,category:current.category,version:current.version,reason:'Concurrent edit fixture'})));
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await db.query('SELECT count(*)::int AS n FROM community_post_revisions WHERE post_id=$1',[post.id])).rows[0].n).toBe(3);
  const now=(await db.query('SELECT * FROM community_posts WHERE id=$1',[post.id])).rows[0];
  await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(author)).send({title:now.title,content:now.content,category:now.category,version:now.version,reason:'No changed content fixture'}).expect(200);
  expect((await db.query('SELECT version FROM community_posts WHERE id=$1',[post.id])).rows[0].version).toBe(now.version);
 });
 it('rolls back edits and revision snapshots together when audit fails',async()=>{
  const current=(await db.query('SELECT * FROM community_posts WHERE id=$1',[post.id])).rows[0];
  const before=(await db.query('SELECT count(*)::int AS n FROM community_post_revisions WHERE post_id=$1',[post.id])).rows[0].n;
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected edit audit failure'));
  try{await request(app.getHttpServer()).put(`/community/posts/${post.id}`).set('Authorization',token(author)).send({title:current.title,content:'Must roll back revision',category:current.category,version:current.version,reason:'Audit failure fixture'}).expect(500);}finally{spy.mockRestore();}
  expect((await db.query('SELECT version,content FROM community_posts WHERE id=$1',[post.id])).rows[0]).toMatchObject({version:current.version,content:current.content});
  expect((await db.query('SELECT count(*)::int AS n FROM community_post_revisions WHERE post_id=$1',[post.id])).rows[0].n).toBe(before);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions?page=0`).set('Authorization',token(author)).expect(400);
 });
 it('retains scoped reasons and independently reviews author appeals',async()=>{
  const created=(await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Appeal fixture',content:'Fictional appeal content',category:'ASSISTANCE',branchId:branch}).expect(201)).body;
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/moderate`).set('Authorization',token(moderator)).send({decision:'REJECTED',version:created.version,notes:'Fictional policy reason'}).expect(201);
  const rejected=(await request(app.getHttpServer()).get('/community/posts').set('Authorization',token(author)).expect(200)).body.find((p:any)=>p.id===created.id);
  expect(rejected.moderationOutcome.notes).toBe('Fictional policy reason');expect(rejected.canAppeal).toBe(true);
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/appeal`).set('Authorization',token(reader)).send({version:rejected.version,reason:'Forged author appeal'}).expect(404);
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/appeal`).set('Authorization',token(author)).send({version:created.version,reason:'Stale author appeal'}).expect(409);
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/appeal`).set('Authorization',token(author)).send({version:rejected.version,reason:'Please reconsider fictional context'}).expect(201);
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/appeal`).set('Authorization',token(author)).send({version:rejected.version,reason:'Duplicate appeal fixture'}).expect(409);
  const pending=(await db.query('SELECT version FROM community_posts WHERE id=$1',[created.id])).rows[0];
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:pending.version,notes:'Original reviewer cannot resolve'}).expect(403);
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/moderate`).set('Authorization',token(secondModerator)).send({decision:'PUBLISHED',version:pending.version,notes:'Independent appeal review approved'}).expect(201);
  expect((await db.query('SELECT status FROM community_post_appeals WHERE post_id=$1',[created.id])).rows[0].status).toBe('RESOLVED');
  const publicPost=(await request(app.getHttpServer()).get('/community/posts').set('Authorization',token(reader)).expect(200)).body.find((p:any)=>p.id===created.id);
  expect(publicPost.moderationOutcome).toBeUndefined();expect(publicPost.appealReason).toBeUndefined();
 });
 it('rolls back an appeal when its durable audit cannot be written',async()=>{
  const created=(await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Appeal rollback fixture',content:'Fictional appeal content',category:'DISCUSSION',branchId:branch}).expect(201)).body;
  await request(app.getHttpServer()).post(`/community/posts/${created.id}/moderate`).set('Authorization',token(moderator)).send({decision:'REJECTED',version:created.version,notes:'Fictional review rejection'}).expect(201);
  const before=(await db.query('SELECT version,status FROM community_posts WHERE id=$1',[created.id])).rows[0];
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected appeal audit failure'));
  try{await request(app.getHttpServer()).post(`/community/posts/${created.id}/appeal`).set('Authorization',token(author)).send({version:before.version,reason:'Appeal must roll back'}).expect(500);}finally{spy.mockRestore();}
  expect((await db.query('SELECT version,status FROM community_posts WHERE id=$1',[created.id])).rows[0]).toEqual(before);
  expect((await db.query('SELECT id FROM community_post_appeals WHERE post_id=$1',[created.id])).rows).toHaveLength(0);
 });
 it('rolls back content if durable audit intent cannot be written',async()=>{
  const before=(await db.query('SELECT count(*)::int AS count FROM community_posts')).rows[0].count;
  const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('Injected outbox failure'));
  try {await request(app.getHttpServer()).post('/community/posts').set('Authorization',token(author)).send({title:'Rollback fixture',content:'Must never persist without audit',category:'DISCUSSION'}).expect(500);} finally{spy.mockRestore();}
  expect((await db.query('SELECT count(*)::int AS count FROM community_posts')).rows[0].count).toBe(before);
 });
 it('soft-deletes only for the author or scoped moderator and preserves lineage',async()=>{
  const people=(await db.query('SELECT count(*)::int AS count FROM persons')).rows[0].count;
  await request(app.getHttpServer()).delete(`/community/posts/${post.id}`).set('Authorization',token(reader)).expect(404);
  const pending=(await db.query('SELECT version FROM community_posts WHERE id=$1',[post.id])).rows[0];
  await request(app.getHttpServer()).post(`/community/posts/${post.id}/moderate`).set('Authorization',token(moderator)).send({decision:'PUBLISHED',version:pending.version,notes:'Publish fixture before deletion authorization check'}).expect(201);
  await request(app.getHttpServer()).delete(`/community/posts/${post.id}`).set('Authorization',token(reader)).expect(403);
  await request(app.getHttpServer()).delete(`/community/posts/${post.id}`).set('Authorization',token(author)).expect(200);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/comments`).set('Authorization',token(moderator)).expect(404);
  await request(app.getHttpServer()).get(`/community/posts/${post.id}/revisions`).set('Authorization',token(author)).expect(404);
  expect((await db.query('SELECT count(*)::int AS n FROM community_post_revisions WHERE post_id=$1',[post.id])).rows[0].n).toBe(3);
  expect((await db.query('SELECT deleted_at FROM community_posts WHERE id=$1',[post.id])).rows[0].deleted_at).not.toBeNull();
  expect((await db.query('SELECT count(*)::int AS count FROM persons')).rows[0].count).toBe(people);
 });
});
