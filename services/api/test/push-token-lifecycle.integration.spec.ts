import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { UserRepository } from '../src/database/repositories/user.repository';
import { SessionRepository } from '../src/database/repositories/session.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { PushTokensService } from '../src/modules/notifications/push-tokens.service';
import { openPushToken } from '../src/modules/notifications/push-token.crypto';
import { getJwtSecret, JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '../src/modules/auth/auth.constants';
import { assertDatabaseIsolation, createDisposableDatabase, DisposableDatabase } from './helpers/disposable-db';

describe('Push token lifecycle (real PostgreSQL and authenticated HTTP)',()=>{
  let iso:DisposableDatabase,app:INestApplication,db:DatabaseService,tokens:PushTokensService,audit:AuditOutboxRepository;
  let users:UserRepository,sessions:SessionRepository,jwt:JwtService,counter=0;
  const saved={active:process.env.PUSH_TOKEN_ACTIVE_KEY_ID,keys:process.env.PUSH_TOKEN_KEYS_JSON};
  const path='/notifications/push-registration';
  const credential=()=>randomBytes(48).toString('hex');
  const auth=(user:{token:string})=>`Bearer ${user.token}`;
  const access=(id:string,sid:string,phone:string)=>jwt.sign({sub:id,sid,phoneNumber:phone,tokenType:'access'},
    {secret:getJwtSecret(),issuer:JWT_ISSUER,audience:JWT_AUDIENCE,algorithm:JWT_ALGORITHM});
  async function member(platform='ANDROID'){
    const phone='+977984740'+String(++counter).padStart(4,'0');
    const user=await users.findOrCreateByPhone(phone);
    const refreshToken=randomBytes(32).toString('hex');
    const session=await sessions.createSession({userId:user.id,refreshTokenHash:createHash('sha256').update(refreshToken).digest('hex'),devicePlatform:platform,expiresAt:new Date(Date.now()+3600000)});
    return {id:user.id,phone,session,refreshToken,token:access(user.id,session.id,phone)};
  }
  const register=(user:{token:string},token=credential(),platform='ANDROID')=>request(app.getHttpServer()).put(path)
    .set('Authorization',auth(user)).send({token,platform});
  beforeAll(async()=>{
    process.env.PUSH_TOKEN_ACTIVE_KEY_ID='integration';process.env.PUSH_TOKEN_KEYS_JSON=JSON.stringify({integration:randomBytes(32).toString('base64')});
    iso=await createDisposableDatabase('push_tokens');await assertDatabaseIsolation(iso.client,iso.dbName);
    const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();await app.init();
    db=module.get(DatabaseService);tokens=module.get(PushTokensService);audit=module.get(AuditOutboxRepository);
    users=module.get(UserRepository);sessions=module.get(SessionRepository);jwt=module.get(JwtService);
    await assertDatabaseIsolation(db,iso.dbName);
  },60000);
  afterAll(async()=>{
    if(app)await app.close();if(iso)await iso.drop();
    if(saved.active===undefined)delete process.env.PUSH_TOKEN_ACTIVE_KEY_ID;else process.env.PUSH_TOKEN_ACTIVE_KEY_ID=saved.active;
    if(saved.keys===undefined)delete process.env.PUSH_TOKEN_KEYS_JSON;else process.env.PUSH_TOKEN_KEYS_JSON=saved.keys;
  });
  it('requires authentication and rejects spoofed authority and mismatched platforms',async()=>{
    await request(app.getHttpServer()).put(path).send({token:credential(),platform:'ANDROID'}).expect(401);
    const user=await member();
    await request(app.getHttpServer()).put(path).set('Authorization',auth(user)).send({token:credential(),platform:'ANDROID',userId:randomUUID()}).expect(400);
    await register(user,credential(),'IOS').expect(400);
    await register(await member('web')).expect(400);
  });
  it('encrypts credentials, exposes only metadata, isolates owners and rotates with redacted audit intent',async()=>{
    const owner=await member(),other=await member(),secret=credential();
    const first=(await register(owner,secret).expect(200)).body;
    const row=(await db.query('SELECT * FROM push_token_registrations WHERE id=$1',[first.id])).rows[0];
    expect(row.token_envelope).not.toContain(secret);
    expect(openPushToken(row.token_envelope,JSON.stringify([row.id,row.user_id,row.session_family_id,row.platform,row.generation]))).toBe(secret);
    const response=await request(app.getHttpServer()).get(path).set('Authorization',auth(owner)).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body.registration).sort()).toEqual(['expiresAt','generation','id','platform']);
    expect((await request(app.getHttpServer()).get(path).set('Authorization',auth(other)).expect(200)).body.registration).toBeNull();
    await register(other,secret).expect(409);
    const second=(await register(owner).expect(200)).body;
    expect(second.id).toBe(first.id);expect(second.generation).not.toBe(first.generation);
    const events=(await db.query("SELECT action,new_value,old_value FROM audit_outbox WHERE entity_id=$1 AND action LIKE 'PUSH_TOKEN_%' ORDER BY created_at",[first.id])).rows;
    expect(events.map(row=>row.action)).toEqual(['PUSH_TOKEN_REGISTERED','PUSH_TOKEN_ROTATED']);
    expect(JSON.stringify(events)).not.toContain(secret);expect(JSON.stringify(events)).not.toContain(row.token_hash);
  });
  it('fences delayed invalid-token responses and removes the exact current generation',async()=>{
    const owner=await member(),first=(await register(owner).expect(200)).body,second=(await register(owner).expect(200)).body;
    expect(await tokens.invalidate(first.id,first.generation)).toEqual({invalidated:false});
    expect(await tokens.invalidate(second.id,second.generation)).toEqual({invalidated:true});
    expect(await tokens.invalidate(second.id,second.generation)).toEqual({invalidated:false});
    expect((await db.query("SELECT count(*)::int AS count FROM audit_outbox WHERE entity_id=$1 AND action='PUSH_TOKEN_INVALIDATED'",[second.id])).rows[0].count).toBe(1);
  });
  it('survives refresh in the same server family and supports idempotent removal',async()=>{
    const owner=await member(),first=(await register(owner).expect(200)).body;
    const refreshed=(await request(app.getHttpServer()).post('/auth/native/refresh').send({refreshToken:owner.refreshToken}).expect(200)).body;
    const token=refreshed.accessToken, sid=(jwt.decode(token) as any).sid;
    const rotated=(await db.query('SELECT * FROM user_sessions WHERE id=$1',[sid])).rows[0];
    expect(rotated.device_platform).toBe('ANDROID');expect(rotated.session_family_id).toBe(owner.session.session_family_id);
    expect((await request(app.getHttpServer()).get(path).set('Authorization','Bearer '+token).expect(200)).body.registration.id).toBe(first.id);
    await register({token}).expect(200);
    await request(app.getHttpServer()).delete(path).set('Authorization','Bearer '+token).expect(200);
    await request(app.getHttpServer()).delete(path).set('Authorization','Bearer '+token).expect(200);
    expect((await db.query("SELECT count(*)::int AS count FROM audit_outbox WHERE entity_id=$1 AND action='PUSH_TOKEN_REMOVED'",[first.id])).rows[0].count).toBe(1);
  });
  it('rejects revoked sessions and retires their credentials before token reassignment',async()=>{
    const owner=await member(),other=await member(),secret=credential(),first=(await register(owner,secret).expect(200)).body;
    await db.query('UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP,owner_revoked_at=CURRENT_TIMESTAMP WHERE id=$1',[owner.session.id]);
    await register(owner).expect(401);
    await request(app.getHttpServer()).get(path).set('Authorization',auth(owner)).expect(401);
    const second=(await register(other,secret).expect(200)).body;
    expect(second.id).not.toBe(first.id);
    expect((await db.query('SELECT id FROM push_token_registrations WHERE id=$1',[first.id])).rows).toHaveLength(0);
  });
  it('retires expired and ended families without deleting active credentials',async()=>{
    const active=await member(),ended=await member(),expired=await member();
    const a=(await register(active).expect(200)).body,e=(await register(ended).expect(200)).body,x=(await register(expired).expect(200)).body;
    await db.query('UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1',[ended.session.id]);
    await db.query("UPDATE push_token_registrations SET updated_at=CURRENT_TIMESTAMP-INTERVAL '2 days',expires_at=CURRENT_TIMESTAMP-INTERVAL '1 day' WHERE id=$1",[x.id]);
    await tokens.retireStale();
    expect((await db.query('SELECT id FROM push_token_registrations WHERE id=ANY($1::uuid[])',[[a.id,e.id,x.id]])).rows.map(row=>row.id)).toEqual([a.id]);
  });
  it('rolls back token mutation when the durable audit write fails and redacts database diagnostics',async()=>{
    const owner=await member(),secret=credential();
    const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('private-provider-token '+secret));
    try {
      const response=await register(owner,secret).expect(503);expect(JSON.stringify(response.body)).not.toContain(secret);
      expect((await db.query('SELECT id FROM push_token_registrations WHERE user_id=$1',[owner.id])).rows).toHaveLength(0);
    } finally {spy.mockRestore();}
  });
  it('fails closed without managed keys and leaves unrelated API startup and existing metadata available',async()=>{
    const owner=await member(),first=(await register(owner).expect(200)).body;
    const keys=process.env.PUSH_TOKEN_KEYS_JSON;delete process.env.PUSH_TOKEN_KEYS_JSON;
    try {
      await register(owner).expect(503);
      expect((await request(app.getHttpServer()).get(path).set('Authorization',auth(owner)).expect(200)).body.registration.id).toBe(first.id);
    } finally {process.env.PUSH_TOKEN_KEYS_JSON=keys;}
  });
  it('serializes concurrent token ownership and concurrent rotation without leaking or duplicating credentials',async()=>{
    const one=await member(),two=await member(),secret=credential();
    const results=await Promise.all([register(one,secret),register(two,secret)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const winner=results[0].status===200?one:two;
    const rotations=await Promise.all([register(winner),register(winner)]);
    expect(rotations.map(r=>r.status)).toEqual([200,200]);
    expect((await db.query('SELECT id FROM push_token_registrations WHERE user_id=$1',[winner.id])).rows).toHaveLength(1);
  });
  it('supports iOS registration for an iOS session',async()=>{
    const owner=await member('ios');expect((await register(owner,credential(),'IOS').expect(200)).body.platform).toBe('IOS');
  });
  it('rechecks session ownership, expiry and current privileged authority inside the service transaction',async()=>{
    const owner=await member(),other=await member();
    const actor={id:owner.id,sessionId:owner.session.id,roles:[]} as any;
    await expect(tokens.register({...actor,sessionId:other.session.id},{token:credential(),platform:'ANDROID'})).rejects.toMatchObject({status:401});
    await db.query("UPDATE user_sessions SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE id=$1",[owner.session.id]);
    await expect(tokens.register(actor,{token:credential(),platform:'ANDROID'})).rejects.toMatchObject({status:401});
    await db.query("UPDATE user_sessions SET expires_at=CURRENT_TIMESTAMP+INTERVAL '1 hour',authenticated_at=CURRENT_TIMESTAMP-INTERVAL '2 hours' WHERE id=$1",[owner.session.id]);
    await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'CENTRAL_ADMIN')",[owner.id]);
    await expect(tokens.register(actor,{token:credential(),platform:'ANDROID'})).rejects.toMatchObject({status:401});
    expect((await db.query('SELECT id FROM push_token_registrations WHERE user_id=$1',[owner.id])).rows).toHaveLength(0);
  });
  it('preserves credentials when provider invalidation audit persistence fails',async()=>{
    const owner=await member(),first=(await register(owner).expect(200)).body;
    const spy=jest.spyOn(audit,'recordAuditIntent').mockRejectedValueOnce(new Error('untrusted-provider-diagnostic'));
    try {
      await expect(tokens.invalidate(first.id,first.generation)).rejects.toMatchObject({status:503});
      expect((await db.query('SELECT id FROM push_token_registrations WHERE id=$1',[first.id])).rows).toHaveLength(1);
    } finally {spy.mockRestore();}
  });
});
