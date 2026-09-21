import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Migration 006 & 007 Upgrade & Rollback Isolation Test (Disposable PostgreSQL)', () => {
  let isoDb: DisposableDatabase;
  const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

  beforeAll(async () => {
    // 1. Create a strictly isolated, disposable database with migrations up to 005
    isoDb = await createDisposableDatabase('mig006_007', '005');

    // 2. Exact match identity verification: must match isoDb.dbName exactly
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    console.log(`[DISPOSABLE DB TARGET] Migration isolation test verified running exclusively against target: ${isoDb.dbName}`);

    // 3. Seed representative pre-006 legacy records into 005 schema
    await isoDb.client.query(`
      INSERT INTO user_accounts (id, phone_number, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', '+9779841000099', TRUE);

      INSERT INTO persons (id, generation, gender, living_status, version)
      VALUES ('22222222-2222-2222-2222-222222222222', 3, 'MALE', 'LIVING', 1);

      INSERT INTO persons (id, generation, gender, living_status, version)
      VALUES ('33333333-3333-3333-3333-333333333333', 3, 'FEMALE', 'LIVING', 1);

      INSERT INTO spouse_links (id, person_id, spouse_id, status)
      VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'CURRENT');

      INSERT INTO cultural_articles (title_nepali, title_english, slug, category, content_nepali, author_id, is_published, published_at)
      VALUES ('लेख १', 'Article 1', 'article-legacy-1', 'HISTORY', 'सामग्री १', '11111111-1111-1111-1111-111111111111', TRUE, NOW());
    `);

    // 4. Apply Migration 006
    const up006Path = path.resolve(__dirname, '../../../database/migrations/006_m4_workflow_and_governance_enhancements.sql');
    const up006Sql = fs.readFileSync(up006Path, 'utf8');
    const up006Checksum = crypto.createHash('sha256').update(up006Sql).digest('hex');

    await isoDb.client.query(up006Sql);
    await isoDb.client.query(
      'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4);',
      ['006', '006_m4_workflow_and_governance_enhancements.sql', up006Checksum, 15]
    );
  }, 45000);

  afterAll(async () => {
    if (isoDb) {
      // Clean up ONLY the disposable database created for this test run
      await isoDb.drop();
    }
  });

  it('should verify migration 006 is recorded in schema_migrations of disposable database', async () => {
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    const res = await isoDb.client.query("SELECT version, name FROM schema_migrations WHERE version = '006';");
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toContain('006_m4_workflow_and_governance_enhancements');
  });

  it('should verify permanent unique ownership indexes on user_accounts and persons', async () => {
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    const user1Res = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const user2Res = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u1 = user1Res.rows[0].id;
    const u2 = user2Res.rows[0].id;

    const p1Res = await isoDb.client.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (4, 'MALE', 'LIVING') RETURNING id;"
    );
    const p2Res = await isoDb.client.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (4, 'FEMALE', 'LIVING') RETURNING id;"
    );
    const p1 = p1Res.rows[0].id;
    const p2 = p2Res.rows[0].id;

    // Link user1 to p1
    await isoDb.client.query('UPDATE user_accounts SET person_id = $1 WHERE id = $2;', [p1, u1]);
    await isoDb.client.query('UPDATE persons SET claimed_user_id = $1, is_claimed = TRUE WHERE id = $2;', [u1, p1]);

    // Attempting to link user2 to the SAME person p1 must fail uniqueness constraint
    await expect(
      isoDb.client.query('UPDATE user_accounts SET person_id = $1 WHERE id = $2;', [p1, u2])
    ).rejects.toThrow();

    // Attempting to link person p2 to the SAME user u1 must fail uniqueness constraint
    await expect(
      isoDb.client.query('UPDATE persons SET claimed_user_id = $1 WHERE id = $2;', [u1, p2])
    ).rejects.toThrow();
  });

  it('should verify active claim reservation indexes prevent competing claims in flight', async () => {
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    const user1Res = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const user2Res = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const pRes = await isoDb.client.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (5, 'MALE', 'LIVING') RETURNING id;"
    );
    const u1 = user1Res.rows[0].id;
    const u2 = user2Res.rows[0].id;
    const targetP = pRes.rows[0].id;

    // u1 creates active claim for targetP
    await isoDb.client.query(
      `INSERT INTO profile_claims (claimant_user_id, target_person_id, status, relationship_description)
       VALUES ($1, $2, 'PENDING_TIER1', 'Self claim');`,
      [u1, targetP]
    );

    // u2 attempting to submit an active claim for the same targetP must fail index
    await expect(
      isoDb.client.query(
        `INSERT INTO profile_claims (claimant_user_id, target_person_id, status, relationship_description)
         VALUES ($1, $2, 'PENDING_TIER1', 'Competing claim');`,
        [u2, targetP]
      )
    ).rejects.toThrow();

    // u1 attempting a SECOND active claim must also fail
    const otherPRes = await isoDb.client.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (5, 'FEMALE', 'LIVING') RETURNING id;"
    );
    await expect(
      isoDb.client.query(
        `INSERT INTO profile_claims (claimant_user_id, target_person_id, status, relationship_description)
         VALUES ($1, $2, 'PENDING_TIER1', 'Second claim');`,
        [u1, otherPRes.rows[0].id]
      )
    ).rejects.toThrow();
  });

  it('should verify workflow_state_transitions trigger prevents UPDATE or DELETE', async () => {
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    const uRes = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u = uRes.rows[0].id;
    const dummyId = crypto.randomUUID();

    const transRes = await isoDb.client.query(
      `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
       VALUES ('PROFILE_CLAIM', $1, 'DRAFT', 'PENDING_TIER1', $2, 'Test submission') RETURNING id;`,
      [dummyId, u]
    );
    const transId = transRes.rows[0].id;

    // UPDATE must fail
    await expect(
      isoDb.client.query("UPDATE workflow_state_transitions SET to_state = 'APPROVED' WHERE id = $1;", [transId])
    ).rejects.toThrow(/workflow_state_transitions records are immutable/);

    // DELETE must fail
    await expect(
      isoDb.client.query('DELETE FROM workflow_state_transitions WHERE id = $1;', [transId])
    ).rejects.toThrow(/workflow_state_transitions records are immutable/);
  });

  it('should test upgrade, assertions, and rollback of migration 007 in disposable database', async () => {
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);

    const up007Path = path.resolve(__dirname, '../../../database/migrations/007_m4_governance_and_schema_corrections.sql');
    const down007Path = path.resolve(__dirname, '../../../database/migrations/007_m4_governance_and_schema_corrections.down.sql');

    const upSql = fs.readFileSync(up007Path, 'utf8');
    const downSql = fs.readFileSync(down007Path, 'utf8');
    const upChecksum = crypto.createHash('sha256').update(upSql).digest('hex');

    // Apply migration 007
    await isoDb.client.query(upSql);
    await isoDb.client.query(
      'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4);',
      ['007', '007_m4_governance_and_schema_corrections.sql', upChecksum, 10]
    );

    // 1. Verify calendar_events date_bs is nullable, tithi columns exist, and validity constraint is enforced
    const calColRes = await isoDb.client.query(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'date_bs';"
    );
    expect(calColRes.rows[0].is_nullable).toBe('YES');

    const uRes = await isoDb.client.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const hostId = uRes.rows[0].id;

    // Valid Tithi-only event succeeds
    const tithiEventRes = await isoDb.client.query(
      `INSERT INTO calendar_events (host_user_id, title, event_type, audience_scope, tithi_year_bs, tithi_month_bs, tithi_paksha, tithi_number, is_public)
       VALUES ($1, 'मातातीर्थ औंसी श्राद्ध', 'SHRADDHA', 'FAMILY', 2081, 1, 'KRISHNA', 15, FALSE)
       RETURNING id, date_bs, audience_scope, tithi_year_bs;`,
      [hostId]
    );
    expect(tithiEventRes.rows[0].date_bs).toBeNull();
    expect(tithiEventRes.rows[0].audience_scope).toBe('FAMILY');

    // Invalid calendar event (neither solar date nor complete valid Tithi) must fail constraint
    await expect(
      isoDb.client.query(
        `INSERT INTO calendar_events (host_user_id, title, event_type, audience_scope, tithi_year_bs, is_public)
         VALUES ($1, 'अपूर्ण श्राद्ध', 'SHRADDHA', 'FAMILY', 2081, FALSE);`,
        [hostId]
      )
    ).rejects.toThrow();

    // 2. Verify spouse_links confidence is UNVERIFIED for existing links (not automatically verified)
    const spouseRes = await isoDb.client.query(
      "SELECT confidence, provenance FROM spouse_links WHERE id = '44444444-4444-4444-4444-444444444444';"
    );
    expect(spouseRes.rows[0].confidence).toBe('UNVERIFIED');

    // 3. Verify cultural_articles author self-approval cleanup
    const artRes = await isoDb.client.query(
      "SELECT lifecycle_state, approved_by FROM cultural_articles WHERE slug = 'article-legacy-1';"
    );
    expect(artRes.rows[0].lifecycle_state).toBe('DRAFT');
    expect(artRes.rows[0].approved_by).toBeNull();

    // 4. Verify data_retention_records and independent notification_status exist
    const retCheck = await isoDb.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'data_retention_records';"
    );
    expect(retCheck.rows.length).toBe(1);

    const notifCheck = await isoDb.client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_outbox' AND column_name = 'notification_status';"
    );
    expect(notifCheck.rows.length).toBe(1);

    // 5. Test clean rollback of 007
    await isoDb.client.query('DELETE FROM calendar_events WHERE date_bs IS NULL;');
    await isoDb.client.query(downSql);
    await isoDb.client.query("DELETE FROM schema_migrations WHERE version = '007';");

    // Verify date_bs is NOT NULL again
    const calColBack = await isoDb.client.query(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'calendar_events' AND column_name = 'date_bs';"
    );
    expect(calColBack.rows[0].is_nullable).toBe('NO');

    // Re-apply 007
    await isoDb.client.query(upSql);
    await isoDb.client.query(
      'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4);',
      ['007', '007_m4_governance_and_schema_corrections.sql', upChecksum, 10]
    );
  });
});
