import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { ProfileService } from '../src/modules/profile/profile.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { EventAudienceScope, Role, ErrorCode } from '@kashyap/contracts';
import { createDisposableDatabase, DisposableDatabase, assertDatabaseIsolation } from './helpers/disposable-db';
import * as fs from 'fs';

describe('Milestone 4: Profile Self-Service, Privacy, Deletion & Calendar Integration', () => {
  let moduleRef: TestingModule;
  let db: DatabaseService;
  let profileService: ProfileService;
  let calendarService: CalendarService;
  let isoDb: DisposableDatabase;

  let testUserId: string;
  let otherUserId: string;
  let testPersonId: string;
  let testBranchId: string;

  beforeAll(async () => {
    isoDb = await createDisposableDatabase('prof_cal');
    await assertDatabaseIsolation(isoDb.client, isoDb.dbName);
    process.env.DB_NAME = isoDb.dbName;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    db = moduleRef.get<DatabaseService>(DatabaseService);
    profileService = moduleRef.get<ProfileService>(ProfileService);
    calendarService = moduleRef.get<CalendarService>(CalendarService);
    await assertDatabaseIsolation(db, isoDb.dbName);

    const suffix = Math.floor(100000 + Math.random() * 900000);
    const randPhone = () => '+97798' + Math.floor(10000000 + Math.random() * 90000000);

    const bRes = await db.query(
      "INSERT INTO branches (code, name_nepali, name_english) VALUES ('B-PRF-" + suffix + "', 'कास्की परीक्षण शाखा', 'Kaski Test Branch') RETURNING id",
    );
    testBranchId = bRes.rows[0].id;

    // Seed test person & user
    const pRes = await db.query(
      "INSERT INTO persons (gender, living_status, generation, branch_id, version) VALUES ('MALE', 'LIVING', 4, $1, 1) RETURNING id",
      [testBranchId],
    );
    testPersonId = pRes.rows[0].id;

    await db.query(
      "INSERT INTO person_names (person_id, first_name, last_name, full_name, language, is_primary) VALUES ($1, 'विकास', 'अधिकारी', 'विकास अधिकारी', 'ne', TRUE)",
      [testPersonId],
    );

    const uRes = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified, person_id) VALUES ('" + randPhone() + "', TRUE, $1) RETURNING id",
      [testPersonId],
    );
    testUserId = uRes.rows[0].id;

    const u2Res = await db.query(
      "INSERT INTO user_accounts (phone_number, is_phone_verified) VALUES ('" + randPhone() + "', TRUE) RETURNING id",
    );
    otherUserId = u2Res.rows[0].id;

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
    if (moduleRef) {
      await moduleRef.close();
    }
    if (isoDb) {
      await isoDb.drop();
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

    it('1b. should update unlinked account profile metadata without creating synthetic person or altering claim links', async () => {
      const pCountBefore = await db.query('SELECT COUNT(*) FROM persons');
      const claimsBefore = await db.query('SELECT COUNT(*) FROM profile_claims');

      await profileService.updateProfile(otherUserId, {
        currentAddress: 'काठमाडौँ, बागमती प्रदेश',
        occupation: 'इन्जिनियर',
      });

      const pCountAfter = await db.query('SELECT COUNT(*) FROM persons');
      const claimsAfter = await db.query('SELECT COUNT(*) FROM profile_claims');

      expect(pCountAfter.rows[0].count).toBe(pCountBefore.rows[0].count);
      expect(claimsAfter.rows[0].count).toBe(claimsBefore.rows[0].count);

      const me = await profileService.getMe(otherUserId);
      expect(me.personId).toBeUndefined();
      expect(me.person?.currentAddress).toBe('काठमाडौँ, बागमती प्रदेश');
      expect(me.person?.occupation).toBe('इन्जिनियर');
    });

    it('2. should update notification preferences', async () => {
      const updated = await profileService.updateNotificationPreferences(testUserId, {
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

    it('3. should update privacy settings and authoritatively propagate to persons table', async () => {
      const privacy = await profileService.updatePrivacySettings(testUserId, {
        profileVisibility: 'VERIFIED_COMMUNITY',
        contactVisibility: 'IMMEDIATE_FAMILY',
        addressVisibility: 'PRIVATE',
      });

      expect(privacy.contactVisibility).toBe('IMMEDIATE_FAMILY');

      // Verify user_accounts.privacy_settings was persisted
      const uRow = await db.query('SELECT privacy_settings FROM user_accounts WHERE id = $1', [testUserId]);
      expect(uRow.rows[0].privacy_settings.contactVisibility).toBe('IMMEDIATE_FAMILY');

      // Verify authoritative mapping to persons table
      const pRow = await db.query('SELECT phone_visibility, address_visibility, dob_visibility FROM persons WHERE id = $1', [testPersonId]);
      expect(pRow.rows[0].phone_visibility).toBe('IMMEDIATE_FAMILY');
      expect(pRow.rows[0].address_visibility).toBe('PRIVATE');
      expect(pRow.rows[0].dob_visibility).toBe('VERIFIED_COMMUNITY');
    });

    it('4. should upload photo, verify magic bytes, release clean file, and verify HMAC signed access', async () => {
      // 1. Valid PNG buffer with correct magic bytes: 0x89 0x50 0x4E 0x47
      const validPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 0x20),
      ]);
      const uploadRes = await profileService.uploadPhoto(testUserId, 'image/png', validPng.toString('base64'));
      expect(uploadRes.assetId).toBeDefined();
      expect(uploadRes.quarantineStatus).toBe('CLEAN');
      expect(uploadRes.url).toContain('sig=');

      // 2. Reject mismatched magic bytes
      const fakePng = Buffer.from('NOT_A_PNG_FILE_CONTENT');
      await expect(
        profileService.uploadPhoto(testUserId, 'image/png', fakePng.toString('base64')),
      ).rejects.toThrow('File header does not match PNG format');
    });

    it('5. should quarantine infected files with malware scanner (EICAR / script / MZ header)', async () => {
      const eicarBuffer = Buffer.from('X5O!P%@AP[4' + String.fromCharCode(92) + 'PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      const eicarPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        eicarBuffer,
      ]);
      await expect(
        profileService.uploadPhoto(testUserId, 'image/png', eicarPng.toString('base64')),
      ).rejects.toThrow('quarantined: EICAR-Test-Signature.Trojan.Gen');

      // Script injection inside PNG container
      const maliciousScriptPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('<script>alert("xss")</script>'),
      ]);
      await expect(
        profileService.uploadPhoto(testUserId, 'image/png', maliciousScriptPng.toString('base64')),
      ).rejects.toThrow('quarantined: Exploit.WebShell.EmbeddedScript');
    });

    it('6. should reject upload fail-closed (503) when malware scanner fails and keep file inaccessible', async () => {
      process.env.SIMULATE_SCANNER_FAILURE = 'true';
      const validPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 0x20),
      ]);

      try {
        await expect(
          profileService.uploadPhoto(testUserId, 'image/png', validPng.toString('base64')),
        ).rejects.toThrow('Malware scanner engine is currently unavailable');

        // Verify recorded with SCANNER_FAILED
        const failAssets = await db.query(
          "SELECT * FROM media_assets WHERE uploader_user_id = $1 AND quarantine_status = 'SCANNER_FAILED'",
          [testUserId],
        );
        expect(failAssets.rows.length).toBeGreaterThan(0);
        const failedAsset = failAssets.rows[0];

        // Access attempt must be rejected fail-closed (Forbidden)
        await expect(
          profileService.getMediaAsset(failedAsset.id, { id: testUserId, roles: [] }),
        ).rejects.toThrow('inaccessible due to malware scanner failure (fail-closed policy)');
      } finally {
        delete process.env.SIMULATE_SCANNER_FAILURE;
      }
    });

    it('7. should list active user sessions and allow revocation', async () => {
      const sessions = await profileService.getSessions(testUserId);
      expect(sessions.length).toBeGreaterThan(0);

      const revokeRes = await profileService.revokeSession(testUserId, sessions[0].id);
      expect(revokeRes.success).toBe(true);

      const remaining = await profileService.getSessions(testUserId);
      expect(remaining.length).toBe(sessions.length - 1);
    });
  });

  describe('Calendar & Event Management (CAL-FR-001..013)', () => {
    let createdEventId: string;

    it('8. should create and retrieve calendar event within BS 2000-2090 range (including Tithi-only event)', async () => {
      // Tithi-only event with complete valid Tithi metadata
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
      createdEventId = event.id;
      expect(event.title).toBe('कुल पूजा २०८३');
      expect(event.audienceScope).toBe(EventAudienceScope.COMMUNITY);
      expect(event.solarDate).toBeFalsy();
      expect(event.tithiYearBs).toBe(2083);
    });

    it('9. should reject event with BS year outside 2000-2090 range', async () => {
      await expect(
        calendarService.createEvent(testUserId, {
          title: 'Invalid Year Event',
          eventType: 'GENERAL_EVENT',
          audienceScope: EventAudienceScope.PUBLIC,
          tithiYearBs: 1999,
          tithiMonthBs: 1,
          tithiPaksha: 'SHUKLA',
          tithiNumber: 1,
        }),
      ).rejects.toThrow('outside supported range');
    });

    it('10. should reject Tithi-only event when Tithi metadata is incomplete or invalid', async () => {
      // Missing tithiNumber and tithiPaksha without solar date
      await expect(
        calendarService.createEvent(testUserId, {
          title: 'Incomplete Tithi Event',
          eventType: 'GENERAL_EVENT',
          audienceScope: EventAudienceScope.COMMUNITY,
          tithiYearBs: 2083,
          tithiMonthBs: 8,
        }),
      ).rejects.toThrow('Complete valid Tithi metadata');

      // Invalid paksha
      await expect(
        calendarService.createEvent(testUserId, {
          title: 'Invalid Paksha Event',
          eventType: 'GENERAL_EVENT',
          audienceScope: EventAudienceScope.COMMUNITY,
          tithiYearBs: 2083,
          tithiMonthBs: 8,
          tithiPaksha: 'INVALID',
          tithiNumber: 5,
        }),
      ).rejects.toThrow('Must be SHUKLA or KRISHNA');

      // Invalid tithi number > 15
      await expect(
        calendarService.createEvent(testUserId, {
          title: 'Invalid Tithi Number Event',
          eventType: 'GENERAL_EVENT',
          audienceScope: EventAudienceScope.COMMUNITY,
          tithiYearBs: 2083,
          tithiMonthBs: 8,
          tithiPaksha: 'SHUKLA',
          tithiNumber: 16,
        }),
      ).rejects.toThrow('Must be between 1 and 15');
    });

    it('11. should enforce audience scope permissions on calendar event reads and private RSVP', async () => {
      // Create PRIVATE event owned by testUserId
      const privateEvent = await calendarService.createEvent(testUserId, {
        title: 'निजी पारिवारिक पूजा',
        eventType: 'GENERAL_EVENT',
        audienceScope: EventAudienceScope.PRIVATE,
        solarDate: '2083-05-15',
      });

      const hostActor = { id: testUserId, roles: [Role.REGISTERED_USER], roleAssignments: [] } as any;
      const otherActor = { id: otherUserId, roles: [Role.REGISTERED_USER], roleAssignments: [] } as any;

      // Host can read private event
      const readByHost = await calendarService.getEventById(privateEvent.id, hostActor);
      expect(readByHost.id).toBe(privateEvent.id);

      // Uninvited non-host cannot read private event
      await expect(
        calendarService.getEventById(privateEvent.id, otherActor),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.FORBIDDEN,
        },
      });

      // Uninvited user cannot RSVP to private event
      await expect(
        calendarService.rsvpEvent(privateEvent.id, otherUserId, { response: 'GOING' }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.FORBIDDEN,
        },
      });
    });

    it('12. should allow host/admin to update event but strictly forbid invitees or audience from editing', async () => {
      const hostActor = { id: testUserId, roles: [Role.REGISTERED_USER], roleAssignments: [] } as any;
      const otherActor = { id: otherUserId, roles: [Role.REGISTERED_USER], roleAssignments: [] } as any;

      // Host can successfully update event
      const updated = await calendarService.updateEvent(createdEventId, hostActor, {
        title: 'कुल पूजा २०८३ - परिमार्जित',
      });
      expect(updated.title).toBe('कुल पूजा २०८३ - परिमार्जित');

      // Non-host invitee/audience is strictly forbidden from editing
      await expect(
        calendarService.updateEvent(createdEventId, otherActor, {
          title: 'Unauthorized Edit Attempt',
        }),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.FORBIDDEN,
        },
      });
    });
  });

  describe('Governed Account Deletion & Lineage Preservation (PROF-FR-010/011)', () => {
    let deletionChallenge: { challengeId: string; expiresAt: string; cooldownSeconds: number; otp?: string };
    let heldAssetId: string;
    let nonHeldAssetId: string;

    it('13. should require reauthentication challenge (OTP) for account deletion and reject unauthenticated requests', async () => {
      await expect(
        profileService.deleteAccount(testUserId),
      ).rejects.toMatchObject({
        response: {
          errorCode: ErrorCode.UNAUTHORIZED,
        },
      });
    });

    it('14. should issue single-use time-bound account deletion challenge', async () => {
      deletionChallenge = await profileService.requestAccountDeletionChallenge(testUserId);
      expect(deletionChallenge.otp).toBeDefined();
      expect(deletionChallenge.otp.length).toBe(6);
      expect(deletionChallenge.expiresAt).toBeDefined();
    });

    it('15. should delete account with single-use challenge, put contested evidence on LEGAL_HOLD with retention records, purge non-held assets, and PRESERVE lineage', async () => {
      // Setup contested evidence attached to a DISPUTED claim
      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 0x20),
      ]);
      const upload1 = await profileService.uploadPhoto(testUserId, 'image/png', pngBuffer.toString('base64'));
      heldAssetId = upload1.assetId;

      const upload2 = await profileService.uploadPhoto(testUserId, 'image/png', pngBuffer.toString('base64'));
      nonHeldAssetId = upload2.assetId;

      // Create DISPUTED claim referencing upload1
      const claimRes = await db.query(
        `INSERT INTO profile_claims (
          claimant_user_id, target_person_id, relationship_description, status, statement_of_truth
        ) VALUES ($1, $2, 'नाति', 'DISPUTED', TRUE) RETURNING id`,
        [testUserId, testPersonId],
      );
      const claimId = claimRes.rows[0].id;

      await db.query(
        `INSERT INTO claim_evidence_attachments (
          claim_id, media_asset_id, document_type, sha256_hash, description
        ) VALUES ($1, $2, 'citizenship', $3, 'Dispute evidence')`,
        [claimId, heldAssetId, upload1.sha256],
      );

      // Execute account deletion using valid single-use OTP
      const delResult = await profileService.deleteAccount(testUserId, { otp: deletionChallenge.otp });
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

      // 4. Precise retention: held asset marked LEGAL_HOLD and recorded in data_retention_records
      const heldAssetRow = await db.query('SELECT retention_status FROM media_assets WHERE id = $1', [heldAssetId]);
      expect(heldAssetRow.rows[0].retention_status).toBe('LEGAL_HOLD');

      const retentionRecord = await db.query('SELECT * FROM data_retention_records WHERE asset_id = $1', [heldAssetId]);
      expect(retentionRecord.rows.length).toBe(1);
      expect(retentionRecord.rows[0].user_id).toBe(testUserId);
      expect(retentionRecord.rows[0].holding_authority).toBe('GOVERNING_BOARD_CENTRAL_GENEALOGY_AUTHORITY');
      expect(retentionRecord.rows[0].legal_basis).toBe('STATUTORY_DISPUTE_RESOLUTION_EVIDENCE');
      expect(retentionRecord.rows[0].retention_period_days).toBe(1095);

      // 5. Non-held private asset marked DELETED and unlinked
      const nonHeldRow = await db.query('SELECT retention_status, storage_path FROM media_assets WHERE id = $1', [nonHeldAssetId]);
      expect(nonHeldRow.rows[0].retention_status).toBe('DELETED');
      if (nonHeldRow.rows[0].storage_path) {
        expect(fs.existsSync(nonHeldRow.rows[0].storage_path)).toBe(false);
      }

      // 6. Audit outbox recorded deletion with genealogy preservation flag
      const auditRes = await db.query(
        "SELECT * FROM audit_outbox WHERE entity_id = $1 AND action = 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED'",
        [testUserId],
      );
      expect(auditRes.rows.length).toBe(1);
    });

    it('16. should reject reuse of already consumed account deletion challenge (single-use enforcement)', async () => {
      await expect(
        profileService.deleteAccount(testUserId, { otp: deletionChallenge.otp }),
      ).rejects.toThrow('already been consumed (single-use policy)');
    });

    it('17. should reject anonymous media streaming requests without an authenticated viewer', async () => {
      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64, 0x20),
      ]);
      const photo = await profileService.uploadPhoto(testUserId, 'image/png', pngBuffer.toString('base64'));

      await expect(
        profileService.getMediaAsset(photo.assetId, undefined),
      ).rejects.toThrow('Authentication required');
    });

    it('18. should update unlinked user account profile without creating genealogy records', async () => {
      const pCountBeforeRes = await db.query('SELECT COUNT(*)::int as count FROM persons');
      const pCountBefore = pCountBeforeRes.rows[0].count;

      const profile = await profileService.updateProfile(otherUserId, {
        preferences: { pushEnabled: false, smsEnabled: true, emailEnabled: true },
      });

      expect(profile.id).toBe(otherUserId);
      expect(profile.personId).toBeUndefined();

      const pCountAfterRes = await db.query('SELECT COUNT(*)::int as count FROM persons');
      const pCountAfter = pCountAfterRes.rows[0].count;
      expect(pCountAfter).toBe(pCountBefore);
    });

    it('19. should safely handle concurrent OTP verifications under atomic SELECT FOR UPDATE locks', async () => {
      const newChal = await profileService.requestAccountDeletionChallenge(otherUserId);
      expect(newChal.otp).toBeDefined();

      // Launch 2 overlapping deleteAccount attempts concurrently
      const results = await Promise.allSettled([
        profileService.deleteAccount(otherUserId, { otp: newChal.otp }),
        profileService.deleteAccount(otherUserId, { otp: newChal.otp }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 1 attempt should succeed and 1 should fail with single-use error
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });
});
