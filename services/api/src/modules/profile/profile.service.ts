import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { MalwareScannerService, ScanResultStatus } from './malware-scanner.service';
import { ISmsProvider, SMS_PROVIDER } from '../auth/sms/sms-provider.interface';
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
  scanEvidence?: any;
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

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly storageBaseDir: string;
  private readonly hmacSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly personRepo: PersonRepository,
    private readonly branchRepo: BranchRepository,
    private readonly userRepo: UserRepository,
    private readonly auditOutboxRepo: AuditOutboxRepository,
    private readonly malwareScanner: MalwareScannerService,
    @Optional() @Inject(SMS_PROVIDER) private readonly smsProvider?: ISmsProvider,
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
        const primaryNe = names.find((n) => n.language === 'ne' && n.is_primary)?.full_name || names[0]?.full_name;
        const primaryEn = names.find((n) => n.language === 'en' && n.is_primary)?.full_name || names[0]?.full_name;

        personDetail = {
          id: person.id,
          primaryNameNepali: primaryNe || 'अज्ञात',
          primaryNameEnglish: primaryEn || 'Unknown',
          gender: person.gender,
          generation: person.generation,
          livingStatus: person.living_status,
          branchId: person.branch_id,
          birthYearBs: person.birth_year_bs,
          birthDateBs: person.birth_date_bs,
          currentAddress: person.current_address,
          occupation: person.occupation,
          education: person.education,
          biography: person.biography,
        };
      }
    }

    const prefRes = await this.db.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    const rawPrefs = prefRes.rows[0] || {};
    const preferences: NotificationPreferencesDto = {
      pushEnabled: rawPrefs.push_enabled ?? true,
      smsEnabled: rawPrefs.sms_enabled ?? true,
      emailEnabled: rawPrefs.email_enabled ?? false,
      familyEventsEnabled: rawPrefs.family_events_enabled ?? true,
      juthoAlertsEnabled: rawPrefs.jutho_alerts_enabled ?? true,
      communityPostsEnabled: rawPrefs.community_posts_enabled ?? true,
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

  async updateProfile(userId: string, dto: { occupation?: string; education?: string; biography?: string; currentAddress?: string }) {
    const userRes = await this.db.query('SELECT * FROM user_accounts WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new NotFoundException('User not found');

    if (user.person_id) {
      await this.db.query(
        `UPDATE persons 
         SET occupation = COALESCE($1, occupation),
             education = COALESCE($2, education),
             biography = COALESCE($3, biography),
             current_address = COALESCE($4, current_address),
             version = version + 1,
             updated_at = NOW()
         WHERE id = $5`,
        [dto.occupation ?? null, dto.education ?? null, dto.biography ?? null, dto.currentAddress ?? null, user.person_id],
      );
    }
    return this.getMe(userId);
  }

  async updatePrivacySettings(userId: string, dto: PrivacySettingsDto & { dobVisibility?: string }): Promise<PrivacySettingsDto> {
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
               profile_visibility = $3,
               dob_visibility = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [
            dto.contactVisibility || 'IMMEDIATE_FAMILY',
            dto.addressVisibility || 'IMMEDIATE_FAMILY',
            dto.profileVisibility || 'VERIFIED_COMMUNITY',
            dto.dobVisibility || 'VERIFIED_COMMUNITY',
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

      return {
        profileVisibility: dto.profileVisibility,
        contactVisibility: dto.contactVisibility,
        addressVisibility: dto.addressVisibility,
      };
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

    if (mimeType === 'image/png' && !isPng) {
      throw new BadRequestException('File header does not match PNG format');
    }
    if (mimeType === 'image/jpeg' && !isJpeg) {
      throw new BadRequestException('File header does not match JPEG format');
    }
    if (mimeType === 'image/webp' && !isWebp) {
      throw new BadRequestException('File header does not match WebP format');
    }
    if (!isJpeg && !isPng && !isWebp) {
      throw new BadRequestException('File magic bytes do not match declared image format');
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const assetId = crypto.randomUUID();
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
    const fileName = `avatar_${assetId}.${ext}`;
    const storagePath = path.join(this.storageBaseDir, fileName);

    fs.writeFileSync(storagePath, buffer);

    const scanResult = await this.malwareScanner.scanFile(buffer, fileName);

    if (scanResult.status === ScanResultStatus.INFECTED) {
      await this.db.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status, storage_path, scan_evidence
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'QUARANTINED', 'ACTIVE', $8, $9)`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256, storagePath, JSON.stringify(scanResult.evidence)],
      );

      throw new BadRequestException(`File failed security scan and was quarantined: ${scanResult.threatName || 'Malware detected'}`);
    }

    if (scanResult.status === ScanResultStatus.SCANNER_FAILED) {
      await this.db.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status, storage_path, scan_evidence
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'SCANNER_FAILED', 'ACTIVE', $8, $9)`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256, storagePath, JSON.stringify(scanResult.evidence)],
      );

      throw new ServiceUnavailableException('Malware scanner engine is currently unavailable. File kept inaccessible in quarantine (fail-closed).');
    }

    const signedUrl = this.generateSignedMediaUrl(assetId, userId, 3600);

    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO media_assets (
          id, uploader_user_id, storage_key, bucket, file_name, mime_type,
          byte_size, sha256_checksum, is_private, quarantine_status, retention_status, storage_path, scan_evidence
        ) VALUES ($1, $2, $3, 'private-profiles', $4, $5, $6, $7, TRUE, 'CLEAN', 'ACTIVE', $8, $9)`,
        [assetId, userId, fileName, fileName, mimeType, buffer.length, sha256, storagePath, JSON.stringify(scanResult.evidence)],
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
      scanEvidence: scanResult.evidence,
    };
  }

  generateSignedMediaUrl(assetId: string, userId: string, expiresInSec: number = 3600): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
    const payload = `${assetId}:${userId}:${expiresAt}`;
    const hmac = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
    return `/api/v1/profile/media/${assetId}?expires=${expiresAt}&user=${userId}&sig=${hmac}`;
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

    if (asset.quarantine_status !== 'CLEAN') {
      if (asset.quarantine_status === 'SCANNER_FAILED') {
        throw new ForbiddenException('Media asset is inaccessible due to malware scanner failure (fail-closed policy)');
      }
      throw new ForbiddenException('Media asset failed malware scan and has been quarantined');
    }

    if (asset.retention_status === 'DELETED' || asset.retention_status === 'PURGED') {
      throw new NotFoundException('Media asset has been permanently deleted');
    }

    let isAuthorized = false;

    if (viewer) {
      if (viewer.roles.includes('SUPER_ADMIN') || viewer.roles.includes('CENTRAL_ADMIN')) {
        isAuthorized = true;
      } else if (asset.uploader_user_id === viewer.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && queryUser && queryExpires && querySig) {
      const exp = parseInt(queryExpires, 10);
      if (!isNaN(exp) && this.verifySignedMediaUrl(assetId, queryUser, exp, querySig)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to access or stream this media asset');
    }

    if (!asset.storage_path || !fs.existsSync(asset.storage_path)) {
      throw new NotFoundException('Physical media file not found on storage volume');
    }

    return {
      filePath: asset.storage_path,
      fileName: asset.file_name,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size,
    };
  }

  async requestAccountDeletionChallenge(userId: string): Promise<{ challengeId: string; expiresAt: string; cooldownSeconds: number; otp?: string }> {
    const userRes = await this.db.query('SELECT phone_number FROM user_accounts WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new NotFoundException('User account not found');

    const recentRes = await this.db.query(
      `SELECT created_at FROM auth_challenges 
       WHERE user_id = $1 AND action = 'ACCOUNT_DELETION' AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    if (recentRes.rows.length > 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.OTP_RESEND_COOLDOWN,
        message: 'Please wait 60 seconds before requesting a new account deletion challenge.',
      });
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = crypto.createHash('sha256').update(otpCode + salt).digest('hex');
    const challengeId = `del_chal_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const expiresAtDate = new Date(Date.now() + 5 * 60 * 1000);

    await this.db.query(
      `INSERT INTO auth_challenges (
        user_id, action, challenge_id, code_hash, salt, phone_number, attempts, max_attempts, expires_at
      ) VALUES ($1, 'ACCOUNT_DELETION', $2, $3, $4, $5, 0, 5, $6)`,
      [userId, challengeId, codeHash, salt, user.phone_number, expiresAtDate.toISOString()],
    );

    if (this.smsProvider) {
      try {
        await this.smsProvider.sendOtp(user.phone_number, otpCode);
      } catch (e: any) {
        this.logger.warn(`SMS dispatch failed for account deletion challenge: ${e.message}`);
      }
    }

    this.logger.log(`[DELETION CHALLENGE] Issued cryptographically secured reauthentication challenge for user ${userId}`);

    const resObj: any = {
      challengeId,
      expiresAt: expiresAtDate.toISOString(),
      cooldownSeconds: 60,
    };

    if (process.env.NODE_ENV === 'test') {
      resObj.otp = otpCode;
    }

    return resObj;
  }

  async deleteAccount(
    userId: string,
    reauthChallenge?: { challengeId?: string; otp?: string; password?: string },
  ): Promise<DeleteAccountResponseDto> {
    if (!reauthChallenge || !reauthChallenge.otp) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Explicit reauthentication challenge (OTP) is mandatory for account deletion',
      });
    }

    const result = await this.db.transaction(async (client) => {
      // 1. Lock challenge record for update inside transaction (prevents TOCTOU replay)
      const chalQuery = reauthChallenge.challengeId
        ? `SELECT * FROM auth_challenges WHERE user_id = $1 AND challenge_id = $2 AND action = 'ACCOUNT_DELETION' FOR UPDATE`
        : `SELECT * FROM auth_challenges WHERE user_id = $1 AND action = 'ACCOUNT_DELETION' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
      const chalParams = reauthChallenge.challengeId ? [userId, reauthChallenge.challengeId] : [userId];

      const chalRes = await client.query(chalQuery, chalParams);
      const challenge = chalRes.rows[0];

      if (!challenge) {
        throw new UnauthorizedException('No active account deletion challenge found. Request a challenge first.');
      }

      if (challenge.consumed_at) {
        throw new UnauthorizedException('Reauthentication challenge has already been consumed (single-use policy)');
      }

      if (new Date(challenge.expires_at).getTime() < Date.now()) {
        throw new UnauthorizedException('Reauthentication challenge has expired');
      }

      if (challenge.attempts >= challenge.max_attempts) {
        throw new UnauthorizedException('Maximum verification attempts exceeded for this challenge');
      }

      const computedHash = crypto.createHash('sha256').update(reauthChallenge.otp + challenge.salt).digest('hex');
      if (computedHash !== challenge.code_hash) {
        await client.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        throw new UnauthorizedException('Invalid reauthentication challenge OTP');
      }

      // Mark challenge consumed atomically inside transaction
      await client.query('UPDATE auth_challenges SET consumed_at = NOW() WHERE challenge_id = $1 OR id = $2', [challenge.challenge_id, challenge.id]);

      const userRes = await client.query('SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE', [userId]);
      const user = userRes.rows[0];
      if (!user) throw new NotFoundException('User not found');

      if (user.person_id) {
        await client.query(
          `UPDATE persons 
           SET is_claimed = FALSE, claimed_user_id = NULL, version = version + 1, updated_at = NOW() 
           WHERE id = $1`,
          [user.person_id],
        );
      }

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

        await client.query(
          `INSERT INTO data_retention_records (
            user_id, asset_id, holding_authority, legal_basis, retention_reason,
            release_conditions, retention_period_days, expires_at, review_scheduled_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 1095, NOW() + INTERVAL '1095 days', NOW() + INTERVAL '180 days')`,
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
        if (asset.storage_path) {
          await client.query(
            `INSERT INTO media_deletion_queue (asset_id, storage_path, status) VALUES ($1, $2, 'PENDING')`,
            [asset.id, asset.storage_path],
          );
        }
      }

      // Revoke all active sessions for the user atomically
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

      await client.query('DELETE FROM notification_preferences WHERE user_id = $1', [userId]);

      const anonPhone = `+DEL_${crypto.randomBytes(6).toString('hex').slice(0, 14)}`;
      await client.query(
        `UPDATE user_accounts 
         SET phone_number = $1, person_id = NULL, avatar_asset_id = NULL, is_active = FALSE,
             privacy_settings = '{"profileVisibility":"PRIVATE","contactVisibility":"PRIVATE","addressVisibility":"PRIVATE"}'::jsonb,
             deleted_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [anonPhone, userId],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED',
          entityType: 'USER_ACCOUNT',
          entityId: userId,
          actorId: userId,
          actorRole: 'MEMBER',
          oldValue: { phoneNumber: user.phone_number, personId: user.person_id },
          newValue: { isActive: false, genealogyPreserved: true },
        },
        client,
      );

      return {
        success: true,
        message: 'तपाईंको खाता सफलतापूर्वक हटाइयो। वंशवृक्ष तथ्याङ्क सुरक्षित राखिएको छ। (Account deleted, genealogy preserved)',
        genealogyPreserved: true,
        deletedAt: new Date().toISOString(),
      };
    });

    // Durable post-commit physical media cleanup (strictly outside database transaction)
    await this.processMediaDeletionQueue();

    return result;
  }

  async processMediaDeletionQueue(): Promise<number> {
    let processed = 0;
    try {
      const pendingRes = await this.db.query(
        `SELECT id, storage_path FROM media_deletion_queue WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED LIMIT 50`,
      );
      for (const row of pendingRes.rows) {
        try {
          if (row.storage_path && fs.existsSync(row.storage_path)) {
            fs.unlinkSync(row.storage_path);
          }
          await this.db.query(
            `UPDATE media_deletion_queue SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`,
            [row.id],
          );
          processed++;
        } catch (err: any) {
          await this.db.query(
            `UPDATE media_deletion_queue SET attempts = attempts + 1, error_message = $1 WHERE id = $2`,
            [err.message, row.id],
          );
        }
      }
    } catch (e: any) {
      this.logger.warn(`Media deletion queue processing encountered error: ${e.message}`);
    }
    return processed;
  }

  async reviewLegalHold(
    holdId: string,
    reviewerId: string,
    decision: 'MAINTAIN' | 'RELEASE',
    notes?: string,
  ) {
    const holdRes = await this.db.query('SELECT * FROM data_retention_records WHERE id = $1', [holdId]);
    const hold = holdRes.rows[0];
    if (!hold) throw new NotFoundException('Data retention record not found');

    if (decision === 'RELEASE') {
      await this.db.transaction(async (client) => {
        await client.query(
          `UPDATE data_retention_records 
           SET released_at = NOW(), released_by = $1, release_conditions = COALESCE($2, release_conditions)
           WHERE id = $3`,
          [reviewerId, notes, holdId],
        );

        if (hold.asset_id) {
          // Multi-hold protection: ensure no other active (unreleased) holds exist for this asset
          const otherHoldsRes = await client.query(
            `SELECT COUNT(*) as cnt FROM data_retention_records WHERE asset_id = $1 AND id != $2 AND released_at IS NULL`,
            [hold.asset_id, holdId],
          );
          const otherHoldsCount = parseInt(otherHoldsRes.rows[0]?.cnt || '0', 10);
          if (otherHoldsCount === 0) {
            await client.query(
              `UPDATE media_assets SET retention_status = 'PURGED' WHERE id = $1`,
              [hold.asset_id],
            );

            const assetRes = await client.query('SELECT storage_path FROM media_assets WHERE id = $1', [hold.asset_id]);
            if (assetRes.rows[0]?.storage_path) {
              await client.query(
                `INSERT INTO media_deletion_queue (asset_id, storage_path, status) VALUES ($1, $2, 'PENDING')`,
                [hold.asset_id, assetRes.rows[0].storage_path],
              );
            }
          }
        }
      });

      await this.processMediaDeletionQueue();
      return { success: true, status: 'RELEASED' };
    }

    await this.db.query(
      `UPDATE data_retention_records SET review_scheduled_at = NOW() + INTERVAL '180 days' WHERE id = $1`,
      [holdId],
    );
    return { success: true, status: 'MAINTAINED' };
  }

  async getPrivacy(userId: string): Promise<PrivacySettingsDto> {
    const me = await this.getMe(userId);
    return me.privacy;
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const me = await this.getMe(userId);
    return me.preferences;
  }

  async updateNotificationPreferences(
    userId: string,
    dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    await this.db.query(
      `INSERT INTO notification_preferences (
        user_id, push_enabled, sms_enabled, email_enabled, 
        family_events_enabled, jutho_alerts_enabled, community_posts_enabled, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        push_enabled = EXCLUDED.push_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        email_enabled = EXCLUDED.email_enabled,
        family_events_enabled = EXCLUDED.family_events_enabled,
        jutho_alerts_enabled = EXCLUDED.jutho_alerts_enabled,
        community_posts_enabled = EXCLUDED.community_posts_enabled,
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
      `SELECT * FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
      [userId],
    );
    return res.rows.map((s: any) => ({
      id: s.id,
      deviceName: s.device_name || 'Generic Client',
      ipAddress: s.ip_address || '127.0.0.1',
      userAgent: s.user_agent || 'Unknown Agent',
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at || s.created_at,
      isCurrent: false,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ success: boolean }> {
    const res = await this.db.query(
      'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
      [sessionId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Session not found or already revoked');
    }
    return { success: true };
  }
}
