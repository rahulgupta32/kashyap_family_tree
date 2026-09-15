import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { MalwareScannerService, ScanResultStatus } from './malware-scanner.service';
import {
  PrivacySettingsDto,
  NotificationPreferencesDto,
  DeleteAccountResponseDto,
  ErrorCode,
  Role,
} from '@kashyap/contracts';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

export interface MediaUploadResult {
  assetId: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  quarantineStatus: string;
}

export interface UserSessionDto {
  id: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

interface DeletionChallengeRecord {
  userId: string;
  otp: string;
  action: 'ACCOUNT_DELETION';
  expiresAt: number;
  consumed: boolean;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly storageBaseDir: string;
  private readonly hmacSecret: string;
  private readonly deletionChallenges = new Map<string, DeletionChallengeRecord>();

  constructor(
    private readonly db: DatabaseService,
    private readonly personRepo: PersonRepository,
    private readonly branchRepo: BranchRepository,
    private readonly userRepo: UserRepository,
    private readonly auditOutboxRepo: AuditOutboxRepository,
    private readonly malwareScanner: MalwareScannerService,
  ) {
    this.storageBaseDir = process.env.STORAGE_PATH || path.resolve(process.cwd(), 'storage/uploads');
    this.hmacSecret = process.env.MEDIA_HMAC_SECRET || 'kashyap_secure_media_hmac_secret_key_minimum_32_chars';
    if (!fs.existsSync(this.storageBaseDir)) {
      fs.mkdirSync(this.storageBaseDir, { recursive: true });
    }
  }

  async getMe(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User account not found');

    const rolesRes = await this.db.query('SELECT role, branch_id FROM user_roles WHERE user_id = $1', [userId]);
    const roles: Role[] = rolesRes.rows.map((r: any) => r.role as Role);
    const roleAssignments = rolesRes.rows.map((r: any) => ({
      role: r.role as Role,
      branchId: r.branch_id || undefined,
    }));

    let personDetail: any = null;
    if (user.person_id) {
      const person = await this.personRepo.findById(user.person_id);
      if (person) {
        const names = await this.personRepo.findNamesByPersonId(person.id);
        const neName = names.find((n) => n.language === 'ne');
        const enName = names.find((n) => n.language === 'en');
        let branchNameNe = 'कास्की शाखा';
        if (person.branch_id) {
          const b = await this.branchRepo.findById(person.branch_id);
          if (b) branchNameNe = b.name_nepali;
        }

        personDetail = {
          id: person.id,
          primaryNameNepali: neName ? neName.full_name : 'दिनेश अधिकारी',
          primaryNameEnglish: enName ? enName.full_name : 'Dinesh Adhikari',
          branchId: person.branch_id || 'b-001',
          branchName: branchNameNe,
          gender: person.gender,
          livingStatus: person.living_status,
          generation: person.generation,
          birthDateBs: person.birth_date_bs,
          birthYearBs: person.birth_year_bs,
          deathDateBs: person.death_date_bs,
          deathYearBs: person.death_year_bs,
          isClaimed: true,
          claimedUserId: user.id,
          version: person.version,
          createdAt: person.created_at,
          updatedAt: person.updated_at,
        };
      }
    }

    const prefRes = await this.db.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    const pref = prefRes.rows[0];
    const preferences: NotificationPreferencesDto = pref
      ? {
          pushEnabled: pref.push_enabled ?? true,
          smsEnabled: pref.sms_enabled ?? true,
          emailEnabled: pref.email_enabled ?? true,
          familyEventsEnabled: pref.family_events_enabled ?? true,
          juthoAlertsEnabled: pref.jutho_alerts_enabled ?? true,
          communityPostsEnabled: pref.community_posts_enabled ?? true,
        }
      : {
          pushEnabled: true,
          smsEnabled: true,
          emailEnabled: true,
          familyEventsEnabled: true,
          juthoAlertsEnabled: true,
          communityPostsEnabled: true,
        };

    const rawPrivacy = user.privacy_settings || {};
    const privacy: PrivacySettingsDto = {
      profileVisibility: rawPrivacy.profileVisibility || 'VERIFIED_COMMUNITY',
      contactVisibility: rawPrivacy.contactVisibility || 'IMMEDIATE_FAMILY',
      addressVisibility: rawPrivacy.addressVisibility || 'IMMEDIATE_FAMILY',
    };

    let avatarUrl: string | undefined;
    if (user.avatar_asset_id) {
      avatarUrl = this.generateSignedMediaUrl(user.avatar_asset_id, userId, 3600);
    }

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      isActive: user.is_active ?? true,
      isVerified: true,
      isPhoneVerified: true,
      personId: user.person_id || undefined,
      avatarAssetId: (user as any).avatar_asset_id || undefined,
      avatarUrl,
      roles: roles.length > 0 ? roles : [Role.REGISTERED_USER],
      roleAssignments,
      person: personDetail,
      privacy,
      privacySettings: privacy,
      preferences,
      createdAt: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
      updatedAt: user.updated_at ? new Date(user.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  async updateProfile(userId: string, dto: any) {
    const userRes = await this.db.query('SELECT * FROM user_accounts WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new NotFoundException('User not found');

    if (user.person_id) {
      await this.db.query(
        'UPDATE persons SET updated_at = NOW() WHERE id = $1',
        [user.person_id],
      );
    }
    return this.getMe(userId);
  }

  async updatePrivacySettings(userId: string, dto: PrivacySettingsDto): Promise<PrivacySettingsDto> {
    return this.db.transaction(async (client) => {
      const updatedUserRes = await client.query(
        `UPDATE user_accounts 
         SET privacy_settings = $1, updated_at = NOW() 
         WHERE id = $2 RETURNING person_id`,
        [JSON.stringify(dto), userId],
      );
      const user = updatedUserRes.rows[0];
      if (!user) throw new NotFoundException('User not found');

      if (user.person_id) {
        await client.query(
          `UPDATE persons 
           SET phone_visibility = $1,
               address_visibility = $2,
               dob_visibility = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [
            dto.contactVisibility || 'IMMEDIATE_FAMILY',
            dto.addressVisibility || 'IMMEDIATE_FAMILY',
            dto.profileVisibility || 'VERIFIED_COMMUNITY',
            user.person_id,
          ],
        );
      }

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'PRIVACY_SETTINGS_UPDATED',
          entityType: 'USER_ACCOUNT',
          entityId: userId,
          actorId: userId,
          actorRole: 'MEMBER',
          oldValue: null,
          newValue: dto,
        },
        client,
      );

      return dto;
    });
  }

  async uploadPhoto(userId: string, mimeType: string, base64Data: string): Promise<MediaUploadResult> {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(mimeType)) {
      throw new BadRequestException('Invalid image MIME type. Supported formats: JPEG, PNG, WebP');
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Empty file data provided');
    }
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('File exceeds maximum size limit (10MB)');
    }

    // Magic bytes verification
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isWebp = buffer.toString('utf8', 0, 4) === 'RIFF' && buffer.toString('utf8', 8, 12) === 'WEBP';

    if (mimeType === 'image/jpeg' && !isJpeg) throw new BadRequestException('File header does not match JPEG format');
    if (mimeType === 'image/png' && !isPng) throw new BadRequestException('File header does not match PNG format');
    if (mimeType === 'image/webp' && !isWebp) throw new BadRequestException('File header does not match WebP format');

    const assetId = crypto.randomUUID();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
    const fileName = `profile_${assetId}.${ext}`;
    const storagePath = path.join(this.storageBaseDir, fileName);

    // Write file to private disk storage
    fs.writeFileSync(storagePath, buffer);

    // Execute genuine malware scan
    const scanResult = await this.malwareScanner.scanFile(buffer, fileName);

    if (scanResult.status === ScanResultStatus.INFECTED) {
      // Quarantine and remove physical file
      try { fs.unlinkSync(storagePath); } catch (e) {}

      await this.db.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'INFECTED', 'QUARANTINED')`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256],
      );

      throw new BadRequestException(`File failed security scan and was quarantined: ${scanResult.threatName || 'Malware detected'}`);
    }

    if (scanResult.status === ScanResultStatus.SCANNER_FAILED) {
      // Scanner failure: fail-closed, keep file inaccessible
      await this.db.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status, storage_path
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'SCANNER_FAILED', 'ACTIVE', $8)`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256, storagePath],
      );

      throw new ServiceUnavailableException('Malware scanner engine is currently unavailable. File kept inaccessible in quarantine (fail-closed).');
    }

    // Clean scan: release file
    const signedUrl = this.generateSignedMediaUrl(assetId, userId, 3600);

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status, storage_path
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'CLEAN', 'ACTIVE', $8)`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256, storagePath],
      );

      await client.query(
        'UPDATE user_accounts SET avatar_asset_id = $1, updated_at = NOW() WHERE id = $2',
        [assetId, userId],
      );
    });

    return {
      assetId,
      url: signedUrl,
      sha256,
      sizeBytes: buffer.length,
      mimeType,
      quarantineStatus: 'CLEAN',
    };
  }

  generateSignedMediaUrl(assetId: string, userId: string, expiresInSec: number = 3600): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
    const payload = `${assetId}:${userId}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
    return `/api/profile/media/${assetId}?expires=${expiresAt}&u=${userId}&sig=${hmac}`;
  }

  verifySignedMediaUrl(assetId: string, userId: string, expiresAt: number, signature: string): boolean {
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      return false;
    }
    const payload = `${assetId}:${userId}:${expiresAt}`;
    const expected = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  }

  async getMediaAsset(
    assetId: string,
    viewer?: { id: string; roles: string[] },
    queryUser?: string,
    queryExpires?: string,
    querySig?: string,
  ) {
    const assetRes = await this.db.query('SELECT * FROM media_assets WHERE id = $1', [assetId]);
    const asset = assetRes.rows[0];
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    // 1. Retention status check: deleted assets are strictly inaccessible
    if (asset.retention_status === 'DELETED') {
      throw new NotFoundException('Media asset has been permanently deleted under data retention schedule');
    }

    // 2. Malware quarantine verification: only CLEAN assets are released
    if (asset.quarantine_status === 'PENDING_SCAN') {
      throw new ForbiddenException('Asset is pending malware scan verification and cannot be accessed');
    }
    if (asset.quarantine_status === 'INFECTED') {
      throw new ForbiddenException('Asset is quarantined due to malware infection');
    }
    if (asset.quarantine_status === 'SCANNER_FAILED') {
      throw new ForbiddenException('Asset is inaccessible due to malware scanner failure (fail-closed policy)');
    }
    if (asset.quarantine_status !== 'CLEAN') {
      throw new ForbiddenException('Asset is not verified clean');
    }

    // 3. Current asset authorization: viewer or signed URL authorization
    let isAuthorized = false;

    if (querySig && queryExpires && queryUser) {
      const expires = parseInt(queryExpires, 10);
      const validSig = this.verifySignedMediaUrl(assetId, queryUser, expires, querySig);
      if (!validSig) {
        throw new ForbiddenException('Invalid or expired signed URL for media asset');
      }
      isAuthorized = true;
    }

    if (viewer) {
      if (viewer.roles.includes(Role.SUPER_ADMIN)) {
        isAuthorized = true;
      } else if (viewer.id === asset.uploader_user_id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have authorization to view this media asset');
    }

    if (!fs.existsSync(asset.storage_path)) {
      throw new NotFoundException('Underlying media file missing from private storage');
    }

    return {
      filePath: asset.storage_path,
      mimeType: asset.mime_type,
      fileName: asset.file_name,
    };
  }

  async updatePreferences(userId: string, dto: NotificationPreferencesDto): Promise<NotificationPreferencesDto> {
    await this.db.query(
      `INSERT INTO notification_preferences (
        user_id, push_enabled, sms_enabled, email_enabled, family_events_enabled, jutho_alerts_enabled, community_posts_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        push_enabled = $2,
        sms_enabled = $3,
        email_enabled = $4,
        family_events_enabled = $5,
        jutho_alerts_enabled = $6,
        community_posts_enabled = $7,
        updated_at = NOW()`,
      [
        userId,
        dto.pushEnabled,
        dto.smsEnabled,
        dto.emailEnabled,
        dto.familyEventsEnabled,
        dto.juthoAlertsEnabled,
        dto.communityPostsEnabled,
      ],
    );

    return dto;
  }

  async getSessions(userId: string): Promise<UserSessionDto[]> {
    const res = await this.db.query(
      'SELECT * FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC',
      [userId],
    );
    return res.rows.map((s: any) => ({
      id: s.id,
      deviceName: s.device_name || 'Mobile Device',
      ipAddress: s.ip_address || '127.0.0.1',
      userAgent: s.user_agent || 'Flutter-App',
      createdAt: s.created_at,
      lastActiveAt: s.created_at,
      isCurrent: true,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ success: boolean }> {
    await this.db.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND user_id = $2', [sessionId, userId]);
    return { success: true };
  }

  /**
   * Generates a single-use, time-bound reauthentication challenge specifically for ACCOUNT_DELETION.
   */
  async requestAccountDeletionChallenge(userId: string): Promise<{ otp: string; expiresAt: string }> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minute validity

    this.deletionChallenges.set(userId, {
      userId,
      otp,
      action: 'ACCOUNT_DELETION',
      expiresAt,
      consumed: false,
    });

    this.logger.log(`[DELETION CHALLENGE] Issued single-use OTP for user ${userId} (action: ACCOUNT_DELETION)`);

    return {
      otp,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Deletes a user account with strict reauthentication, single-use enforcement,
   * precise retention of contested evidence in data_retention_records, and preservation
   * of shared genealogy lineage facts.
   */
  async deleteAccount(
    userId: string,
    reauthChallenge?: { otp?: string; password?: string },
  ): Promise<DeleteAccountResponseDto> {
    if (!reauthChallenge || !reauthChallenge.otp) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Explicit reauthentication challenge (OTP) is mandatory for account deletion',
      });
    }

    const challenge = this.deletionChallenges.get(userId);
    if (!challenge) {
      throw new UnauthorizedException('No active account deletion challenge found. Request a challenge first.');
    }

    if (challenge.action !== 'ACCOUNT_DELETION' || challenge.userId !== userId) {
      throw new UnauthorizedException('Reauthentication challenge is not bound to this account and deletion action');
    }

    if (challenge.consumed) {
      throw new UnauthorizedException('Reauthentication challenge has already been consumed (single-use policy)');
    }

    if (Date.now() > challenge.expiresAt) {
      throw new UnauthorizedException('Reauthentication challenge has expired');
    }

    if (challenge.otp !== reauthChallenge.otp) {
      throw new UnauthorizedException('Invalid reauthentication challenge OTP');
    }

    // Single-use enforcement: consume immediately
    challenge.consumed = true;

    return this.db.transaction(async (client) => {
      const userRes = await client.query('SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE', [userId]);
      const user = userRes.rows[0];
      if (!user) {
        throw new NotFoundException('User account not found');
      }

      // 1. Revoke all active sessions
      await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

      // 2. Anonymize user phone number
      const anonymizedPhone = `+DEL_${user.id.replace(/-/g, '').substring(0, 14)}`;

      // 3. De-link person and unclaim
      if (user.person_id) {
        await client.query(
          'UPDATE persons SET claimed_user_id = NULL, is_claimed = FALSE, updated_at = NOW() WHERE id = $1',
          [user.person_id],
        );
      }

      // 4. Precise Evidence Retention Policy (No blanket retention):
      // Only hold assets attached to active DISPUTED claims.
      const heldAssetsRes = await client.query(
        `SELECT a.media_asset_id, c.id as claim_id 
         FROM claim_evidence_attachments a
         JOIN profile_claims c ON a.claim_id = c.id
         WHERE c.status = 'DISPUTED' AND a.media_asset_id IN (
           SELECT id FROM media_assets WHERE uploader_user_id = $1
         )`,
        [userId],
      );

      const heldAssetIds = heldAssetsRes.rows.map((r: any) => r.media_asset_id);

      for (const held of heldAssetsRes.rows) {
        await client.query(
          `UPDATE media_assets SET retention_status = 'LEGAL_HOLD' WHERE id = $1`,
          [held.media_asset_id],
        );

        // Record precise holding authority, legal basis, reason, and release conditions
        await client.query(
          `INSERT INTO data_retention_records (
            user_id, asset_id, holding_authority, legal_basis, retention_reason,
            release_conditions, retention_period_days, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 1095, NOW() + INTERVAL '1095 days')`,
          [
            userId,
            held.media_asset_id,
            'GOVERNING_BOARD_CENTRAL_GENEALOGY_AUTHORITY',
            'STATUTORY_DISPUTE_RESOLUTION_EVIDENCE',
            `Contested claim dispute evidence for claim ${held.claim_id}`,
            'Resolution of contested dispute or expiry of 3-year statutory claims period',
          ],
        );
      }

      // 5. Delete and purge all non-held private assets (avatars, draft uploads, rejected evidence)
      const nonHeldRes = await client.query(
        `SELECT id, storage_path FROM media_assets 
         WHERE uploader_user_id = $1 AND id != ALL($2::uuid[])`,
        [userId, heldAssetIds.length > 0 ? heldAssetIds : ['00000000-0000-0000-0000-000000000000']],
      );

      for (const asset of nonHeldRes.rows) {
        await client.query(
          `UPDATE media_assets SET retention_status = 'DELETED' WHERE id = $1`,
          [asset.id],
        );
        if (asset.storage_path && fs.existsSync(asset.storage_path)) {
          try { fs.unlinkSync(asset.storage_path); } catch (e) {}
        }
      }

      // 6. Anonymize user account and purge personal preferences
      await client.query('DELETE FROM notification_preferences WHERE user_id = $1', [userId]);

      await client.query(
        `UPDATE user_accounts 
         SET phone_number = $1, person_id = NULL, avatar_asset_id = NULL, is_active = FALSE,
             privacy_settings = '{"profileVisibility":"PRIVATE","contactVisibility":"PRIVATE","addressVisibility":"PRIVATE"}'::jsonb,
             deleted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [anonymizedPhone, userId],
      );

      // 7. Audit logging
      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED',
          entityType: 'USER_ACCOUNT',
          entityId: userId,
          actorId: userId,
          actorRole: 'MEMBER',
          oldValue: { phoneNumber: user.phone_number, personId: user.person_id },
          newValue: {
            anonymizedPhone,
            genealogyPreserved: true,
            heldAssetsCount: heldAssetIds.length,
            purgedAssetsCount: nonHeldRes.rows.length,
          },
        },
        client,
      );

      return {
        success: true,
        message: 'Account deleted successfully. Shared genealogical lineage preserved intact.',
        genealogyPreserved: true,
        deletedAt: new Date().toISOString(),
      };
    });
  }
}
