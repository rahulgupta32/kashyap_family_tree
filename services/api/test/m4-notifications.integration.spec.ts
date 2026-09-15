import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';

describe('Milestone 4: Durable Notification Outbox Dispatcher Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let dispatcherService: NotificationDispatcherService;
  let isoDb: DisposableDatabase;

  let testUserId: string;
  let claimantUserId: string;
  let disputantUserId: string;
  let testBranchId: string;
  let testPersonId: string;

  beforeAll(async () => {
    isoDb = await createDisposableDatabase('notif');
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    process.env.DB_NAME = isoDb.dbName;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    dispatcherService = moduleRef.get<NotificationDispatcherService>(NotificationDispatcherService);
    await assertDatabaseIsolation(db, isoDb.dbName);

    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    const uRes = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    testUserId = uRes.rows[0].id;

    const u2Res = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    claimantUserId = u2Res.rows[0].id;

    const u3Res = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    disputantUserId = u3Res.rows[0].id;

    await db.query(
      "INSERT INTO notification_preferences (user_id, push_enabled, sms_enabled, email_enabled) VALUES ($1, TRUE, FALSE, FALSE)",
      [testUserId],
    );

    await db.query(
      "INSERT INTO notification_preferences (user_id, push_enabled, sms_enabled, email_enabled) VALUES ($1, TRUE, TRUE, FALSE)",
      [claimantUserId],
    );

    // Create branch & person for claim tests
    const bRes = await db.query(
      "INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-NOTIF-1', 'तनहुँ शाखा', 'Tanahun Branch') RETURNING id",
    );
    testBranchId = bRes.rows[0].id;

    const pRes = await db.query(
      "INSERT INTO persons (gender, living_status, generation, branch_id, version) VALUES ('MALE', 'LIVING', 3, $1, 1) RETURNING id",
      [testBranchId],
    );
    testPersonId = pRes.rows[0].id;
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
    if (isoDb) {
      await isoDb.drop();
    }
  });

  it('1. should process pending outbox events, create deduplicated dispatches and respect preferences', async () => {
    // 1. Insert audit outbox entry for CLAIM_APPROVED_AND_LINKED
    const outboxRes = await db.query(
      `INSERT INTO audit_outbox (
        action, entity_type, entity_id, actor_id, status, notification_status
      ) VALUES ('CLAIM_APPROVED_AND_LINKED', 'PROFILE_CLAIM', '00000000-0000-0000-0000-000000000001', $1, 'PENDING', 'PENDING')
      RETURNING id`,
      [testUserId],
    );
    const outboxId = outboxRes.rows[0].id;

    // 2. Process batch
    const results = await dispatcherService.processOutboxBatch(10);
    expect(results.length).toBe(1);
    expect(results[0].channel).toBe('PUSH'); // Since sms_enabled = false
    expect(results[0].status).toBe('SENT');

    // 3. Verify audit_outbox independent notification_status was marked PROCESSED
    const checkOutbox = await db.query('SELECT notification_status, notification_processed_at FROM audit_outbox WHERE id = $1', [outboxId]);
    expect(checkOutbox.rows[0].notification_status).toBe('PROCESSED');
    expect(checkOutbox.rows[0].notification_processed_at).toBeDefined();

    // 4. Verify notification_dispatches record was created
    const dispatches = await db.query('SELECT * FROM notification_dispatches WHERE outbox_id = $1', [outboxId]);
    expect(dispatches.rows.length).toBe(1);
    expect(dispatches.rows[0].recipient_user_id).toBe(testUserId);
    expect(dispatches.rows[0].channel).toBe('PUSH');
    expect(dispatches.rows[0].delivery_status).toBe('SENT');
  });

  it('2. should be strictly idempotent on reprocessing same record', async () => {
    const outboxRow = await db.query("SELECT * FROM audit_outbox WHERE notification_status = 'PROCESSED' LIMIT 1");
    expect(outboxRow.rows.length).toBe(1);

    // Call processRecord directly on the already-dispatched outbox row
    const retryResults = await dispatcherService.processRecord(outboxRow.rows[0]);
    expect(retryResults.length).toBe(1);
    expect(retryResults[0].status).toBe('SKIPPED');

    // Verify still exactly 1 record in notification_dispatches
    const dispatches = await db.query('SELECT * FROM notification_dispatches WHERE outbox_id = $1', [outboxRow.rows[0].id]);
    expect(dispatches.rows.length).toBe(1);
  });

  it('3. should process CLAIM_DISPUTED action and notify claimant across enabled channels', async () => {
    // 1. Create a claim
    const claimRes = await db.query(
      `INSERT INTO profile_claims (
        claimant_user_id, target_person_id, relationship_description, status, statement_of_truth
      ) VALUES ($1, $2, 'छोरा', 'DISPUTED', TRUE) RETURNING id`,
      [claimantUserId, testPersonId],
    );
    const claimId = claimRes.rows[0].id;

    // 2. Insert audit_outbox for CLAIM_DISPUTED
    const outboxRes = await db.query(
      `INSERT INTO audit_outbox (
        action, entity_type, entity_id, actor_id, status, notification_status
      ) VALUES ('CLAIM_DISPUTED', 'PROFILE_CLAIM', $1, $2, 'PENDING', 'PENDING')
      RETURNING id`,
      [claimId, disputantUserId],
    );
    const outboxId = outboxRes.rows[0].id;

    // 3. Process batch
    const results = await dispatcherService.processOutboxBatch(10);
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify dispatches created for claimantUserId (PUSH and SMS as per prefs)
    const claimantDispatches = await db.query(
      'SELECT * FROM notification_dispatches WHERE outbox_id = $1 AND recipient_user_id = $2',
      [outboxId, claimantUserId],
    );
    expect(claimantDispatches.rows.length).toBe(2);
    const channels = claimantDispatches.rows.map((r: any) => r.channel);
    expect(channels).toContain('PUSH');
    expect(channels).toContain('SMS');

    // Verify notification_status updated to PROCESSED
    const outboxCheck = await db.query('SELECT notification_status FROM audit_outbox WHERE id = $1', [outboxId]);
    expect(outboxCheck.rows[0].notification_status).toBe('PROCESSED');
  });

  it('4. should enforce database uniqueness constraint uq_notification_dispatches_outbox_user_channel', async () => {
    const outboxRow = await db.query("SELECT * FROM audit_outbox WHERE notification_status = 'PROCESSED' LIMIT 1");
    const outboxId = outboxRow.rows[0].id;

    // Attempting direct duplicate insert must fail with unique constraint violation (23505)
    await expect(
      db.query(
        `INSERT INTO notification_dispatches (
          outbox_id, recipient_user_id, channel, event_type, payload, delivery_status
        ) VALUES ($1, $2, 'PUSH', 'CLAIM_APPROVED_AND_LINKED', '{}', 'SENT')`,
        [outboxId, testUserId],
      ),
    ).rejects.toThrow();
  });
});
