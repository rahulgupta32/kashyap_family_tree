/* Logical restore rehearsal for generated fictional databases only. Never a production backup/PITR tool. */
const { Pool } = require('../services/api/node_modules/pg');
const { randomUUID, createHash } = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { canonicalSchemaDefinition } = require('./restore-schema-canonicalization.cjs');
const { AuditRepository, canonicalAuditJson } = require('../services/api/dist/database/repositories/audit.repository');
const { AuditOutboxRepository } = require('../services/api/dist/database/repositories/audit-outbox.repository');

const identifier = value => `"${value.replace(/"/g, '""')}"`;
const digest = value => createHash('sha256').update(canonicalAuditJson(value)).digest('hex');
const result = { kind: 'DISPOSABLE_FICTIONAL_LOGICAL_RESTORE', status: 'FAILED',
  productionAcceptance: false, pitrVerified: false, productionRpoVerified: false,
  productionRtoVerified: false, startedAt: new Date().toISOString(), cleanup: 'NOT_STARTED' };
let stage = 'CONFIGURATION', admin, source, target, temporary;
const created = [];

function adapter(pool) {
  return {
    query: (sql, params, client) => (client || pool).query(sql, params),
    getClient: () => pool.connect(),
    transaction: async callback => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const value = await callback(client); await client.query('COMMIT'); return value; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}

async function manifest(pool) {
  const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const records = [];
  for (const { tablename } of tables) {
    const rows = (await pool.query(`SELECT to_jsonb(t) AS value FROM public.${identifier(tablename)} t ORDER BY to_jsonb(t)::text`)).rows.map(row => row.value);
    records.push({ table: tablename, count: rows.length, digest: digest(rows) });
  }
  const constraints = (await pool.query(`SELECT c.conname,c.conrelid::regclass::text AS relation,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY relation,c.conname`)).rows;
  const indexes = (await pool.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const triggers = (await pool.query(`SELECT t.tgname,c.relname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  const sequences = (await pool.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
  const columns = (await pool.query(`SELECT table_name,column_name,ordinal_position,column_default,is_nullable,
    data_type,udt_schema,udt_name,character_maximum_length,numeric_precision,numeric_scale,
    datetime_precision,is_identity,identity_generation,is_generated,generation_expression
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  // Trigger declarations alone do not prove the restored enforcement function is intact.
  const routines = (await pool.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,arguments`)).rows;
  return { records,
    constraints: constraints.map(row => ({ ...row, definition: canonicalSchemaDefinition(row.definition) })),
    indexes: indexes.map(row => ({ ...row, indexdef: canonicalSchemaDefinition(row.indexdef) })),
    triggers, sequences, columns, routines };
}

async function run() {
  // An explicit disposable CI service, loopback host and test mode are mandatory.
  if (process.env.NODE_ENV !== 'test' || process.env.KASHYAP_DISPOSABLE_RESTORE !== 'true') throw new Error('Explicit test-only restore mode required');
  const container = process.env.KASHYAP_RESTORE_CONTAINER || '';
  const host = process.env.DB_HOST || '';
  const user = process.env.DB_USER || '';
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(container) || !['127.0.0.1', 'localhost'].includes(host)
    || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(user)) throw new Error('Invalid isolated service configuration');
  const settings = { host, port: Number(process.env.DB_PORT || 5432), user, password: process.env.DB_PASSWORD, max: 2 };
  const suffix = randomUUID().replace(/-/g, '');
  const sourceName = `kashyap_iso_restore_source_${suffix}`, targetName = `kashyap_iso_restore_target_${suffix}`;
  admin = new Pool({ ...settings, database: 'postgres' });
  stage = 'CREATE_DISPOSABLE_DATABASES';
  for (const name of [sourceName, targetName]) {
    await admin.query(`CREATE DATABASE ${identifier(name)}`); created.push(name);
  }
  source = new Pool({ ...settings, database: sourceName }); target = new Pool({ ...settings, database: targetName });
  for (const [pool, expected] of [[source, sourceName], [target, targetName]]) {
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, expected);
  }
  stage = 'APPLY_FROZEN_MIGRATIONS';
  await source.query('CREATE TABLE schema_migrations(version VARCHAR(100) PRIMARY KEY,name VARCHAR(255) NOT NULL,applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,checksum VARCHAR(64) NOT NULL,execution_time_ms INT NOT NULL)');
  const migrations = path.join(__dirname, '../database/migrations');
  const files = fs.readdirSync(migrations).filter(name => /^\d{3}_.*\.sql$/.test(name) && !name.endsWith('.down.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrations, file), 'utf8'); await source.query(sql);
    await source.query('INSERT INTO schema_migrations(version,name,checksum,execution_time_ms) VALUES($1,$2,$3,0)',
      [file.split('_')[0], file, createHash('sha256').update(sql).digest('hex')]);
  }
  stage = 'SEED_FICTIONAL_WITNESSES';
  await source.query('CREATE FUNCTION public.kashyap_restore_fixture() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$');
  const userId = (await source.query("INSERT INTO user_accounts(phone_number,is_phone_verified) VALUES('+9779800000099',true) RETURNING id")).rows[0].id;
  const branchId = (await source.query("INSERT INTO branches(code,name_nepali,name_english) VALUES('RESTORE_FIXTURE','काल्पनिक शाखा','Fictional restore branch') RETURNING id")).rows[0].id;
  const people = (await source.query('INSERT INTO persons(branch_id,generation,created_by) VALUES($1,1,$2),($1,2,$2) RETURNING id,generation', [branchId, userId])).rows;
  const parent = people.find(row => row.generation === 1).id, child = people.find(row => row.generation === 2).id;
  for (const [id, first, language] of [[parent, 'Fictional Parent', 'en'], [child, 'काल्पनिक सन्तान', 'ne']]) {
    await source.query('INSERT INTO person_names(person_id,language,first_name,last_name,full_name) VALUES($1,$2,$3,$4,$5)', [id, language, first, 'Fixture', `${first} Fixture`]);
  }
  await source.query('INSERT INTO parent_links(parent_id,child_id,created_by) VALUES($1,$2,$3)', [parent, child, userId]);
  await source.query("INSERT INTO user_roles(user_id,role,branch_id) VALUES($1,'REGISTERED_USER',$2)", [userId, branchId]);
  await source.query("INSERT INTO user_sessions(user_id,refresh_token_hash,device_platform,expires_at) VALUES($1,$2,'ANDROID',CURRENT_TIMESTAMP+INTERVAL '1 hour')", [userId, digest(randomUUID())]);
  const sourceAdapter = adapter(source), audit = new AuditRepository(sourceAdapter), outbox = new AuditOutboxRepository(sourceAdapter);
  const processed = await outbox.recordAuditIntent({ action: 'UPDATE', entityType: 'persons', entityId: parent, actorId: userId, newValue: { fixture: 'Fictional restore evidence' } });
  await outbox.processOutboxEntry(processed.id, audit);
  const retained = await outbox.recordAuditIntent({ action: 'UPDATE', entityType: 'persons', entityId: child, actorId: userId, newValue: { fixture: 'Fictional retry evidence' } });
  await outbox.markFailed(retained.id, 'FICTIONAL_RESTORE_RETRY');
  const exhausted = await outbox.recordAuditIntent({ action: 'UPDATE', entityType: 'persons', entityId: child, actorId: userId, newValue: { fixture: 'Fictional exhausted evidence' } });
  await source.query("UPDATE audit_outbox SET status='FAILED',retry_count=10 WHERE id=$1", [exhausted.id]);
  const recoveryId = randomUUID();
  const reviewerId = (await source.query("INSERT INTO user_accounts(phone_number,is_phone_verified) VALUES('+9779800000098',true) RETURNING id")).rows[0].id;
  await source.query("INSERT INTO audit_delivery_recovery_requests(id,outbox_id,proposed_by,reason_code) VALUES($1,$2,$3,'DEPENDENCY_RECOVERED')", [recoveryId, exhausted.id, userId]);
  await source.query("INSERT INTO audit_delivery_recovery_decisions(request_id,approved_by,outcome) VALUES($1,$2,'FAILED')", [recoveryId, reviewerId]);
  assert.equal((await audit.verifyIntegrity()).status, 'VERIFIED');
  const before = await manifest(source);
  stage = 'DUMP_AND_RESTORE';
  temporary = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kashyap-disposable-restore-'));
  // Commands use argv, not shell interpolation. The service uses its own local test socket.
  const dump = spawnSync('docker', ['exec', container, 'pg_dump', '-U', user, '-Fc', '--no-owner', '--no-privileges', sourceName], { maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  if (dump.status !== 0 || !dump.stdout?.length) throw new Error('Disposable dump failed');
  const archive = path.join(temporary, 'fictional.dump'); fs.writeFileSync(archive, dump.stdout, { mode: 0o600 });
  const restoreStarted = Date.now();
  const restored = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '-U', user, '--exit-on-error', '--no-owner', '--no-privileges', '-d', targetName],
    { input: fs.readFileSync(archive), maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
  if (restored.status !== 0) throw new Error('Disposable restore failed');
  result.fixtureRestoreElapsedMs = Date.now() - restoreStarted;
  stage = 'VERIFY_RESTORED_RECORDS_AND_PROTECTIONS';
  const after = await manifest(target);
  result.mismatchedAreas = Object.keys(before).filter(key => digest(before[key]) !== digest(after[key]));
  // Schema-only diagnostics keep strict comparison failures reviewable without emitting records.
  result.schemaDifferences = {};
  for (const key of ['constraints', 'indexes', 'triggers', 'sequences', 'columns', 'routines']) {
    if (!result.mismatchedAreas.includes(key)) continue;
    const oldRows = new Set(before[key].map(canonicalAuditJson));
    const newRows = new Set(after[key].map(canonicalAuditJson));
    result.schemaDifferences[key] = {
      sourceOnly: before[key].filter(row => !newRows.has(canonicalAuditJson(row))),
      restoredOnly: after[key].filter(row => !oldRows.has(canonicalAuditJson(row))),
    };
  }
  assert.deepEqual(after, before);
  stage = 'VERIFY_SCHEMA_DRIFT_DETECTION';
  // Real PostgreSQL negative controls: roll back each mutation before continuing.
  // These witnesses prove unchanged records/triggers cannot hide changed functions or columns.
  await target.query('BEGIN');
  try {
    await target.query('CREATE OR REPLACE FUNCTION public.kashyap_restore_fixture() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$');
    const changed = await manifest(target);
    assert.notDeepEqual(changed.routines, before.routines);
    assert.deepEqual(changed.records, before.records);
    assert.deepEqual(changed.triggers, before.triggers);
  } finally { await target.query('ROLLBACK'); }
  await target.query('BEGIN');
  try {
    await target.query('ALTER TABLE public.persons ADD COLUMN restore_drift_fixture integer DEFAULT 7');
    const changed = await manifest(target);
    assert.notDeepEqual(changed.columns, before.columns);
  } finally { await target.query('ROLLBACK'); }
  assert.deepEqual(await manifest(target), before);
  result.routineDriftDetection = 'VERIFIED'; result.columnDriftDetection = 'VERIFIED';
  stage = 'VERIFY_RESTORED_PROTECTIONS';
  const targetAudit = new AuditRepository(adapter(target));
  const integrity = await targetAudit.verifyIntegrity(); assert.equal(integrity.status, 'VERIFIED'); assert.equal(integrity.verifiedRecords, 1);
  await assert.rejects(target.query('UPDATE audit_logs SET action=action'), /immutable/i);
  await assert.rejects(target.query('INSERT INTO parent_links(parent_id,child_id) VALUES($1,$1)', [parent]));
  const retry = (await target.query('SELECT status,retry_count,next_attempt_at FROM audit_outbox WHERE id=$1', [retained.id])).rows[0];
  assert.equal(retry.status, 'FAILED'); assert.equal(retry.retry_count, 1); assert.ok(retry.next_attempt_at);
  assert.equal((await target.query('SELECT outcome FROM audit_delivery_recovery_decisions WHERE request_id=$1', [recoveryId])).rows[0].outcome, 'FAILED');
  await assert.rejects(target.query('UPDATE audit_delivery_recovery_requests SET reason_code=reason_code'), /immutable/i);
  await assert.rejects(target.query('DELETE FROM audit_delivery_recovery_decisions'), /immutable/i);
  result.retainedRecoveryEvidence = 'VERIFIED';
  await targetAudit.appendAuditLog('UPDATE', 'persons', child, userId, 'SYSTEM', null, { fixture: 'Post-restore append' });
  assert.equal((await targetAudit.verifyIntegrity()).verifiedRecords, 2);
  result.status = 'PASSED'; result.checkedTables = before.records.length; result.migrations = files.length;
  result.recordAndSchemaDigest = digest(before); result.auditIntegrity = 'VERIFIED';
  result.immutableAuditProtection = 'VERIFIED'; result.genealogySelfLinkProtection = 'VERIFIED'; result.retainedRetrySchedule = 'VERIFIED';
}

(async () => {
  try { await run(); }
  catch (error) { result.status = 'FAILED'; result.failedStage = stage; result.errorCode = /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : 'REHEARSAL_FAILED'; process.exitCode = 1; }
  finally {
    result.cleanup = 'PASSED';
    for (const pool of [source, target]) if (pool) { try { await pool.end(); } catch { result.cleanup = 'FAILED'; } }
    for (const name of created.reverse()) {
      try {
        if (!/^kashyap_iso_restore_(source|target)_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe cleanup target');
        await admin.query(`DROP DATABASE ${identifier(name)}`);
      } catch { result.cleanup = 'FAILED'; }
    }
    if (admin) { try { await admin.end(); } catch { result.cleanup = 'FAILED'; } }
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    if (result.cleanup !== 'PASSED') { result.status = 'FAILED'; process.exitCode = 1; }
    result.finishedAt = new Date().toISOString();
    const report = path.join(__dirname, '../test-results/disposable-restore.json'); fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify(result, null, 2), { mode: 0o600 });
    if (result.status === 'FAILED') console.log(JSON.stringify({ failedStage: result.failedStage, errorCode: result.errorCode, schemaDifferences: result.schemaDifferences }));
    console.log(`${result.status}: disposable fictional restore; production acceptance remains open; report: test-results/disposable-restore.json`);
  }
})();
