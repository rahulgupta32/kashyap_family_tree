import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { AuditAction } from '@kashyap/contracts';
import { DatabaseService } from '../src/database/database.service';
import { AuditRepository, auditRecordHash } from '../src/database/repositories/audit.repository';
import { AuditOutboxRepository } from '../src/database/repositories/audit-outbox.repository';
import { createDisposableDatabase, assertDatabaseIsolation, DisposableDatabase } from './helpers/disposable-db';

describe('Serialized audit chain and honest legacy verification (real PostgreSQL)',()=>{
 let iso:DisposableDatabase,db:DatabaseService,repo:AuditRepository,legacyId:string,legacyHash:string;
 const originalEnv={...process.env};
 beforeAll(async()=>{
  iso=await createDisposableDatabase('audit_chain','013');await assertDatabaseIsolation(iso.client,iso.dbName);
  legacyId=randomUUID();legacyHash='a'.repeat(64);
  await iso.client.query(`INSERT INTO audit_logs(id,action,entity_type,entity_id,prev_record_hash,current_record_hash)
   VALUES($1,'LOGIN','test','legacy',$2,$3)`,[legacyId,'0'.repeat(64),legacyHash]);
  await iso.client.query(fs.readFileSync(path.resolve(__dirname,'../../../database/migrations/014_serialized_audit_chain.sql'),'utf8'));
  db=new DatabaseService();await db.onModuleInit();await assertDatabaseIsolation(db,iso.dbName);repo=new AuditRepository(db);
 },60000);
 afterAll(async()=>{if(db)await db.onModuleDestroy();if(iso)await iso.drop();process.env=originalEnv;});
 it('preserves the old evidence verbatim and does not certify its unrecoverable serialization',async()=>{
  const row=(await db.query('SELECT * FROM audit_logs WHERE id=$1',[legacyId])).rows[0];
  expect(row.current_record_hash).toBe(legacyHash);expect(row.chain_position).toBeNull();expect(row.hash_version).toBe(1);
  expect(await repo.verifyIntegrity()).toMatchObject({status:'LEGACY_UNVERIFIED',legacyRecords:1,verifiedRecords:0});
 });
 it('serializes independent concurrent writers without branching or timestamp ordering assumptions',async()=>{
  await Promise.all(Array.from({length:25},(_,i)=>new AuditRepository(db).appendAuditLog(AuditAction.LOGIN,'test',`parallel-${i}`,undefined,'SYSTEM',{z:false,a:0},{longKey:'value',a:{z:2,a:1}},'::ffff:127.0.0.1','audit-test')));
  const rows=(await db.query('SELECT *,host(ip_address) AS ip_address FROM audit_logs WHERE hash_version=2 ORDER BY chain_position')).rows;
  expect(rows).toHaveLength(25);let previous=legacyHash;
  for(const row of rows){expect(row.prev_record_hash).toBe(previous);expect(auditRecordHash(row)).toBe(row.current_record_hash);previous=row.current_record_hash;}
  expect(new Set(rows.map(r=>r.prev_record_hash)).size).toBe(25);
  expect(await repo.verifyIntegrity()).toMatchObject({status:'LEGACY_UNVERIFIED',verifiedRecords:25,legacyRecords:1,failure:null});
 });
 it('shares ordering with parallel idempotent outbox workers',async()=>{
  const outbox=new AuditOutboxRepository(db);
  const entries=await Promise.all(Array.from({length:8},(_,i)=>outbox.recordAuditIntent({action:AuditAction.LOGIN,entityType:'test',entityId:`outbox-${i}`,newValue:{fixture:true}})));
  await Promise.all(entries.flatMap(e=>[outbox.processOutboxEntry(e.id,repo),outbox.processOutboxEntry(e.id,new AuditRepository(db))]));
  const count=(await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE new_value ? 'outboxId'")).rows[0].n;
  expect(count).toBe(8);expect(await repo.verifyIntegrity()).toMatchObject({verifiedRecords:33,failure:null});
 });
 it('rolls back the audit row with its owning transaction and releases the lock',async()=>{
  await expect(db.transaction(async tx=>{
   await repo.appendAuditLog(AuditAction.LOGIN,'test','rollback',undefined,undefined,undefined,undefined,undefined,undefined,tx);
   throw new Error('rollback fixture');
  })).rejects.toThrow('rollback fixture');
  expect((await db.query("SELECT id FROM audit_logs WHERE entity_id='rollback'")).rows).toHaveLength(0);
  await repo.appendAuditLog(AuditAction.LOGIN,'test','after-rollback');
  expect(await repo.verifyIntegrity()).toMatchObject({verifiedRecords:34,failure:null});
 });
 it('keeps update/delete protections and rejects a second version-2 successor in the database',async()=>{
  await expect(db.query('UPDATE audit_logs SET action=$1 WHERE id=$2',['LOGOUT',legacyId])).rejects.toThrow('immutable');
  await expect(db.query('DELETE FROM audit_logs WHERE id=$1',[legacyId])).rejects.toThrow('immutable');
  await expect(db.query(`INSERT INTO audit_logs(action,entity_type,entity_id,prev_record_hash,current_record_hash,hash_version)
   VALUES('LOGIN','test','fork',$1,$2,2)`,[legacyHash,'b'.repeat(64)])).rejects.toThrow('uq_audit_v2_predecessor');
 });
 it('reports a fabricated digest as broken without exposing event payloads',async()=>{
  const head=await repo.getLatestRecord();
  const bad=(await db.query(`INSERT INTO audit_logs(action,entity_type,entity_id,new_value,prev_record_hash,current_record_hash,hash_version)
   VALUES('LOGIN','test','corrupt','{"sensitive":"must-not-return"}',$1,$2,2) RETURNING id`,[head!.current_record_hash,'f'.repeat(64)])).rows[0];
  const result=await repo.verifyIntegrity();
  expect(result).toMatchObject({status:'BROKEN',failure:{recordId:bad.id,reason:'DIGEST_MISMATCH'}});
  expect(JSON.stringify(result)).not.toContain('must-not-return');
 });
});
