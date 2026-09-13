import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { ProfileService } from '../src/modules/profile/profile.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { EventAudienceScope } from '@kashyap/contracts';

describe('Milestone 4: Profile Self-Service, Privacy, Deletion & Calendar Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let profileService: ProfileService;
  let calendarService: CalendarService;

  let testUserId: string;
  let testPersonId: string;

  beforeAll(async () => {
    process.env.USE_REAL_POSTGRES = 'true';
    delete process.env.USE_PG_MEM;
    process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
    process.env.DB_PORT = process.env.DB_PORT || '5434';
    process.env.DB_USER = process.env.DB_USER || 'kashyap_user';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kashyap_secure_dev_password';
    process.env.DB_NAME = process.env.DB_NAME || 'kashyap_db';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    profileService = moduleRef.get<ProfileService>(ProfileService);
    calendarService = moduleRef.get<CalendarService>(CalendarService);

    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    // Seed test person & user
    const pRes = await db.query(
      "INSERT INTO persons (gender, living_status, generation, version) VALUES ('MALE', 'LIVING', 4, 1) RETURNING id",
    );
    testPersonId = pRes.rows[0].id;

    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'विकास', 'अधिकारी', 'विकास अधिकारी', 'ne', TRUE)",
      [testPersonId],
    );

    const uRes = await db.query(
      `INSERT INTO user_accounts (phone_number, is_phone_verified, person_id) VALUES ('${randPhone()}', TRUE, $1) RETURNING id`,
      [testPersonId],
    );
    testUserId = uRes.rows[0].id;

    await db.query(
      'UPDATE persons SET claimed_user_id = $1, is_claimed = TRUE WHERE id = $2',
      [testUserId, testPersonId],
    );

    await db.query(
      "INSERT INTO user_sessions (user_id, refresh_token_hash, device_platform, device_name, expires_at) VALUES ($1, 'hash_01', 'android', 'Test Phone', NOW() + INTERVAL '7 days')",
      [testUserId],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM event_invitations WHERE invited_user_id = $1;', [testUserId]);
      await db.query('DELETE FROM calendar_events WHERE host_user_id = $1;', [testUserId]);
      await db.query('DELETE FROM notification_preferences WHERE user_id = $1;', [testUserId]);
      await db.query('DELETE FROM user_sessions WHERE user_id = $1;', [testUserId]);
      await db.query('UPDATE persons SET claimed_user_id = NULL WHERE id = $1;', [testPersonId]);
      await db.query('UPDATE user_accounts SET person_id = NULL, is_active = FALSE WHERE id = $1;', [testUserId]);
      await db.query('DELETE FROM person_names WHERE person_id = $1;', [testPersonId]);
      await db.query('DELETE FROM persons WHERE id = $1;', [testPersonId]);
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('Profile Self-Service & Privacy (PROF-FR-001..008)', () => {
    it('1. should retrieve profile with claimed person details and notification preferences', async () => {
      const me = await profileService.getMe(testUserId);
      expect(me.id).toBe(testUserId);
      expect(me.personId).toBe(testPersonId);
      expect(me.person?.primaryNameNepali).toBe('विकास अधिकारी');
      expect(me.preferences).toBeDefined();
    });

    it('2. should update notification preferences', async () => {
      const updated = await profileService.updatePreferences(testUserId, {
        pushEnabled: false,
        smsEnabled: true,
        emailEnabled: false,
        familyEventsEnabled: true,
        juthoAlertsEnabled: true,
        communityPostsEnabled: false,
      });

      expect(updated.pushEnabled).toBe(false);

      const prefRow = await db.query('SELECT * FROM notification_preferences WHERE user_id = $1', [testUserId]);
      expect(prefRow.rows[0].push_enabled).toBe(false);
      expect(prefRow.rows[0].sms_enabled).toBe(true);
    });

    it('3. should list active user sessions and allow revocation', async () => {
      const sessions = await profileService.getSessions(testUserId);
      expect(sessions.length).toBeGreaterThan(0);

      const revokeRes = await profileService.revokeSession(testUserId, sessions[0].id);
      expect(revokeRes.success).toBe(true);

      const remaining = await profileService.getSessions(testUserId);
      expect(remaining.length).toBe(sessions.length - 1);
    });
  });

  describe('Calendar & Event Management (CAL-FR-001..013)', () => {
    it('4. should create and retrieve calendar event within BS 2000-2090 range', async () => {
      const event = await calendarService.createEvent(testUserId, {
        title: 'कुल पूजा २०८३',
        description: 'वार्षिक कुल पूजा कार्यक्रम',
        eventType: 'KUL_PUJA',
        audienceScope: EventAudienceScope.COMMUNITY,
        tithiYearBs: 2083,
        tithiMonthBs: 8,
        tithiPaksha: 'SHUKLA',
        tithiNumber: 11,
      });

      expect(event.id).toBeDefined();
      expect(event.title).toBe('कुल पूजा २०८३');
      expect(event.audienceScope).toBe(EventAudienceScope.COMMUNITY);
    });

    it('5. should reject event with BS year outside 2000-2090 range', async () => {
      await expect(
        calendarService.createEvent(testUserId, {
          title: 'Invalid Year Event',
          eventType: 'GENERAL_EVENT',
          audienceScope: EventAudienceScope.PUBLIC,
          tithiYearBs: 1999, // Outside range
        }),
      ).rejects.toThrow('outside supported range');
    });
  });

  describe('Governed Account Deletion & Lineage Preservation (PROF-FR-010/011)', () => {
    it('6. should anonymize user account, revoke sessions, de-link person and PRESERVE lineage graph', async () => {
      const delResult = await profileService.deleteAccount(testUserId);
      expect(delResult.success).toBe(true);
      expect(delResult.genealogyPreserved).toBe(true);

      // 1. User account phone number anonymized (length <= 20)
      const userRow = await db.query('SELECT phone_number, is_active, person_id, deleted_at FROM user_accounts WHERE id = $1', [testUserId]);
      expect(userRow.rows[0].is_active).toBe(false);
      expect(userRow.rows[0].person_id).toBeNull();
      expect(userRow.rows[0].phone_number).toMatch(/^\+DEL_/);
      expect(userRow.rows[0].phone_number.length).toBeLessThanOrEqual(20);
      expect(userRow.rows[0].deleted_at).toBeDefined();

      // 2. Person record PRESERVED intact in database
      const personRow = await db.query('SELECT id, is_claimed, claimed_user_id FROM persons WHERE id = $1', [testPersonId]);
      expect(personRow.rows.length).toBe(1);
      expect(personRow.rows[0].is_claimed).toBe(false);
      expect(personRow.rows[0].claimed_user_id).toBeNull();

      // 3. Person names preserved intact
      const names = await db.query('SELECT full_name FROM person_names WHERE person_id = $1', [testPersonId]);
      expect(names.rows.length).toBe(1);
      expect(names.rows[0].full_name).toBe('विकास अधिकारी');

      // 4. Audit outbox recorded deletion with genealogy preservation flag
      const auditRes = await db.query(
        "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED'",
        [testUserId],
      );
      expect(auditRes.rows.length).toBe(1);
    });
  });
});
