import { DatabaseService } from '../src/database/database.service';
import { MigrationService } from '../src/database/migration.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Migration 006 Upgrade & Rollback Isolation Test (Real PostgreSQL)', () => {
  let db: DatabaseService;
  let migrationService: MigrationService;

  const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

  beforeAll(async () => {
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    db = new DatabaseService();
    await db.onModuleInit();

    migrationService = new MigrationService(db);
    await migrationService.onModuleInit();
  }, 30000);

  afterAll(async () => {
    if (db) {
      await db.onModuleDestroy();
    }
  });

  it('should verify migration 006 is applied in schema_migrations', async () => {
    const res = await db.query("SELECT version, name FROM schema_migrations WHERE version = '006';");
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toContain('006_m4_workflow_and_governance_enhancements');
  });

  it('should verify permanent unique ownership indexes on user_accounts and persons', async () => {
    const user1Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const user2Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u1 = user1Res.rows[0].id;
    const u2 = user2Res.rows[0].id;

    const p1Res = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (4, 'MALE', 'LIVING') RETURNING id;"
    );
    const p2Res = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (4, 'FEMALE', 'LIVING') RETURNING id;"
    );
    const p1 = p1Res.rows[0].id;
    const p2 = p2Res.rows[0].id;

    // Link user1 to p1
    await db.query('UPDATE user_accounts SET person_id = $1 WHERE id = $2;', [p1, u1]);
    await db.query('UPDATE persons SET claimed_user_id = $1, is_claimed = TRUE WHERE id = $2;', [u1, p1]);

    // Attempting to link user2 to the SAME person p1 must fail uniqueness constraint
    await expect(
      db.query('UPDATE user_accounts SET person_id = $1 WHERE id = $2;', [p1, u2])
    ).rejects.toThrow();

    // Attempting to link person p2 to the SAME user u1 must fail uniqueness constraint
    await expect(
      db.query('UPDATE persons SET claimed_user_id = $1 WHERE id = $2;', [u1, p2])
    ).rejects.toThrow();

    // Cleanup
    await db.query('UPDATE user_accounts SET person_id = NULL WHERE id IN ($1, $2);', [u1, u2]);
    await db.query('DELETE FROM persons WHERE id IN ($1, $2);', [p1, p2]);
    await db.query('DELETE FROM user_accounts WHERE id IN ($1, $2);', [u1, u2]);
  });

  it('should verify active claim reservation indexes prevent competing claims in flight', async () => {
    const user1Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const user2Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const pRes = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (5, 'MALE', 'LIVING') RETURNING id;"
    );
    const u1 = user1Res.rows[0].id;
    const u2 = user2Res.rows[0].id;
    const p = pRes.rows[0].id;

    // First claim on person p by u1
    await db.query(
      "INSERT INTO profile_claims (target_person_id, claimant_user_id, status, relationship_description) VALUES ($1, $2, 'PENDING_TIER1', 'Claim by u1');",
      [p, u1]
    );

    // Second competing claim on the SAME person p by u2 must fail due to idx_profile_claims_active_target
    await expect(
      db.query(
        "INSERT INTO profile_claims (target_person_id, claimant_user_id, status, relationship_description) VALUES ($1, $2, 'PENDING_TIER1', 'Claim by u2');",
        [p, u2]
      )
    ).rejects.toThrow();

    // Second claim by user u1 on another person p2 must fail due to idx_profile_claims_active_user
    const p2Res = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (5, 'FEMALE', 'LIVING') RETURNING id;"
    );
    const p2 = p2Res.rows[0].id;

    await expect(
      db.query(
        "INSERT INTO profile_claims (target_person_id, claimant_user_id, status, relationship_description) VALUES ($1, $2, 'PENDING_TIER1', 'Another claim by u1');",
        [p2, u1]
      )
    ).rejects.toThrow();

    // Cleanup
    await db.query('DELETE FROM profile_claims WHERE claimant_user_id IN ($1, $2);', [u1, u2]);
    await db.query('DELETE FROM persons WHERE id IN ($1, $2);', [p, p2]);
    await db.query('DELETE FROM user_accounts WHERE id IN ($1, $2);', [u1, u2]);
  });

  it('should verify dispute attachment claim validation trigger', async () => {
    const uRes = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const pRes = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (6, 'MALE', 'LIVING') RETURNING id;"
    );
    const u = uRes.rows[0].id;
    const p = pRes.rows[0].id;

    const claim1Res = await db.query(
      "INSERT INTO profile_claims (target_person_id, claimant_user_id, status, relationship_description) VALUES ($1, $2, 'PENDING_TIER1', 'Claim 1') RETURNING id;",
      [p, u]
    );
    const claim1 = claim1Res.rows[0].id;

    const dispute1Res = await db.query(
      "INSERT INTO claim_disputes (claim_id, disputant_user_id, reason, status) VALUES ($1, $2, 'Dispute reason', 'OPEN') RETURNING id;",
      [claim1, u]
    );
    const dispute1 = dispute1Res.rows[0].id;

    // Attach evidence with matching claim_id and dispute_id -> SUCCESS
    const mediaId = 'a0000000-0000-0000-0000-000000000001';
    await db.query(
      "INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, dispute_id) VALUES ($1, $2, 'family_photo', $3);",
      [claim1, mediaId, dispute1]
    );

    // Create claim 2
    const p2Res = await db.query(
      "INSERT INTO persons (generation, gender, living_status) VALUES (6, 'FEMALE', 'LIVING') RETURNING id;"
    );
    const p2 = p2Res.rows[0].id;
    const u2Res = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u2 = u2Res.rows[0].id;

    const claim2Res = await db.query(
      "INSERT INTO profile_claims (target_person_id, claimant_user_id, status, relationship_description) VALUES ($1, $2, 'PENDING_TIER1', 'Claim 2') RETURNING id;",
      [p2, u2]
    );
    const claim2 = claim2Res.rows[0].id;

    // Attempting to attach evidence to claim2 with dispute1 (which belongs to claim1) MUST FAIL trigger validation
    await expect(
      db.query(
        "INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, dispute_id) VALUES ($1, $2, 'family_photo', $3);",
        [claim2, mediaId, dispute1]
      )
    ).rejects.toThrow(/does not match attachment claim/);

    // Cleanup
    await db.query('DELETE FROM claim_evidence_attachments WHERE claim_id IN ($1, $2);', [claim1, claim2]);
    await db.query('DELETE FROM claim_disputes WHERE id = $1;', [dispute1]);
    await db.query('DELETE FROM profile_claims WHERE id IN ($1, $2);', [claim1, claim2]);
    await db.query('DELETE FROM persons WHERE id IN ($1, $2);', [p, p2]);
    await db.query('DELETE FROM user_accounts WHERE id IN ($1, $2);', [u, u2]);
  });

  it('should verify workflow_state_transitions immutability trigger', async () => {
    const uRes = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u = uRes.rows[0].id;
    const dummyId = 'b0000000-0000-0000-0000-000000000001';

    const transRes = await db.query(
      "INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes) VALUES ('PROFILE_CLAIM', $1, 'PENDING_TIER1', 'PENDING_TIER2', $2, 'Tier 1 vouch') RETURNING id;",
      [dummyId, u]
    );
    const transId = transRes.rows[0].id;

    // Attempting UPDATE on workflow_state_transitions must fail
    await expect(
      db.query("UPDATE workflow_state_transitions SET to_state = 'APPROVED' WHERE id = $1;", [transId])
    ).rejects.toThrow(/workflow_state_transitions records are immutable/);

    // Attempting DELETE on workflow_state_transitions must fail
    await expect(
      db.query('DELETE FROM workflow_state_transitions WHERE id = $1;', [transId])
    ).rejects.toThrow(/workflow_state_transitions records are immutable/);

    // User account deactivation (governed model) succeeds
    await db.query('UPDATE user_accounts SET is_active = FALSE WHERE id = $1;', [u]);
  });

  it('should verify privacy preservation on calendar events audience scope', async () => {
    const uRes = await db.query(
      `INSERT INTO user_accounts (phone_number, is_active) VALUES ('${randPhone()}', TRUE) RETURNING id;`
    );
    const u = uRes.rows[0].id;

    // Insert private event (is_public = FALSE)
    const privRes = await db.query(
      "INSERT INTO calendar_events (title, event_type, date_bs, host_user_id, is_public) VALUES ('Private Family Event', 'GENERAL_EVENT', '2081-05-15', $1, FALSE) RETURNING id, audience_scope;",
      [u]
    );
    expect(privRes.rows[0].audience_scope).toBe('PRIVATE');

    // Insert public event (is_public = TRUE)
    const pubRes = await db.query(
      "INSERT INTO calendar_events (title, event_type, date_bs, host_user_id, is_public, audience_scope) VALUES ('Public Festival', 'GENERAL_EVENT', '2081-05-20', $1, TRUE, 'PUBLIC') RETURNING id, audience_scope;",
      [u]
    );
    expect(pubRes.rows[0].audience_scope).toBe('PUBLIC');

    // Cleanup
    await db.query('DELETE FROM calendar_events WHERE host_user_id = $1;', [u]);
    await db.query('DELETE FROM user_accounts WHERE id = $1;', [u]);
  });

  it('should test clean rollback and re-apply of migration 006', async () => {
    const downPath = path.resolve(__dirname, '../../../database/migrations/006_m4_workflow_and_governance_enhancements.down.sql');
    const upPath = path.resolve(__dirname, '../../../database/migrations/006_m4_workflow_and_governance_enhancements.sql');

    const downSql = fs.readFileSync(downPath, 'utf8');
    const upSql = fs.readFileSync(upPath, 'utf8');
    const upChecksum = crypto.createHash('sha256').update(upSql).digest('hex');

    // Clean up test data from M4 tables/indexes before rolling down
    await db.query("DELETE FROM claim_evidence_attachments;");
    await db.query("DELETE FROM claim_disputes;");
    await db.query("DELETE FROM change_request_evidence_attachments;");
    await db.query("DELETE FROM profile_claims;");
    await db.query("UPDATE persons SET claimed_user_id = NULL, is_claimed = FALSE;");
    await db.query("UPDATE user_accounts SET person_id = NULL;");

    // Execute down migration
    await db.query(downSql);
    await db.query("DELETE FROM schema_migrations WHERE version = '006';");

    // Verify table workflow_state_transitions does not exist
    const checkTable = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_state_transitions';"
    );
    expect(checkTable.rows.length).toBe(0);

    // Re-execute up migration
    await db.query(upSql);
    await db.query(
      'INSERT INTO schema_migrations (version, name, checksum, execution_time_ms) VALUES ($1, $2, $3, $4);',
      ['006', '006_m4_workflow_and_governance_enhancements.sql', upChecksum, 10]
    );

    // Verify re-applied successfully
    const checkTableAgain = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_state_transitions';"
    );
    expect(checkTableAgain.rows.length).toBe(1);
  });
});
