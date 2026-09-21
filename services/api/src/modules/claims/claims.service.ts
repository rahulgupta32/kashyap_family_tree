import * as fs from 'fs';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  SubmitClaimDto,
  ClaimDetailDto,
  Tier1ReviewClaimDto,
  Tier2ReviewClaimDto,
  RequestClaimCorrectionDto,
  ResubmitClaimDto,
  FileClaimDisputeDto,
  ClaimDisputeDetailDto,
  ClaimStatus,
  DisputeStatus,
  ErrorCode,
  Role,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DatabaseService } from '../../database/database.service';
import { ClaimRepository, ClaimRecord, ClaimDisputeRecord } from '../../database/repositories/claim.repository';
import { PersonRepository } from '../../database/repositories/person.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import * as crypto from 'crypto';

@Injectable()
export class ClaimsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly claimRepo: ClaimRepository,
    private readonly personRepo: PersonRepository,
    private readonly branchRepo: BranchRepository,
    private readonly userRepo: UserRepository,
    private readonly auditOutboxRepo: AuditOutboxRepository,
  ) {}

  private generatePresignedUrl(mediaAssetId: string, claimantUserId?: string): string {
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
    const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_minimum_32_chars_long_12345';
    const payload = claimantUserId ? `${mediaAssetId}:${claimantUserId}:${expiresAt}` : `${mediaAssetId}:${expiresAt}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const userParam = claimantUserId ? `&user=${claimantUserId}` : '';
    return `/api/v1/claims/evidence/${mediaAssetId}?expires=${expiresAt}${userParam}&sig=${sig}`;
  }

  private async validateEvidenceAttachments(
    client: PoolClient,
    uploaderUserId: string,
    attachments?: Array<{ mediaAssetId: string; documentType: any; description?: string }>,
  ): Promise<void> {
    if (!attachments || attachments.length === 0) return;
    for (const att of attachments) {
      const res = await client.query(
        'SELECT id, uploader_user_id, quarantine_status, retention_status FROM media_assets WHERE id = $1',
        [att.mediaAssetId],
      );
      const asset = res.rows[0];
      if (!asset) {
        throw new NotFoundException({
          errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
          message: `Evidence media asset not found: ${att.mediaAssetId}`,
        });
      }
      if (asset.uploader_user_id !== uploaderUserId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message: `Evidence media asset does not belong to the submitting user: ${att.mediaAssetId}`,
        });
      }
      if (asset.quarantine_status !== 'CLEAN') {
        throw new BadRequestException({
          errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
          message: `Evidence media asset is quarantined or has not passed malware scan (status: ${asset.quarantine_status})`,
        });
      }
      if (asset.retention_status === 'DELETED' || asset.retention_status === 'PURGED') {
        throw new BadRequestException({
          errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
          message: 'Evidence media asset has been deleted or purged',
        });
      }
    }
  }

  async getEvidenceMediaAsset(
    assetId: string,
    viewer?: AuthenticatedUser,
    queryUser?: string,
    queryExpires?: string,
    querySig?: string,
  ): Promise<{ filePath: string; fileName: string; mimeType: string; byteSize: number }> {
    if (!viewer || !viewer.id) {
      throw new UnauthorizedException('Authentication required to access evidence asset');
    }

    const assetRes = await this.db.query('SELECT * FROM media_assets WHERE id = $1', [assetId]);
    const asset = assetRes.rows[0];
    if (!asset) {
      throw new NotFoundException('Evidence media asset not found');
    }

    if (asset.quarantine_status !== 'CLEAN') {
      throw new ForbiddenException('Media asset failed malware scan and has been quarantined');
    }

    if (asset.retention_status === 'DELETED' || asset.retention_status === 'PURGED') {
      throw new NotFoundException('Media asset has been permanently deleted');
    }

    if (queryUser || queryExpires || querySig) {
      if (!queryUser || !queryExpires || !querySig) {
        throw new UnauthorizedException('Incomplete evidence URL signature parameters');
      }
      if (!/^[a-f0-9]{64}$/i.test(querySig)) {
        throw new UnauthorizedException('Invalid evidence URL signature');
      }
      const exp = parseInt(queryExpires, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(exp) || exp < now) {
        throw new UnauthorizedException('Expired evidence URL signature');
      }
      if (queryUser !== viewer.id) {
        throw new ForbiddenException('Signed URL user mismatch: signature was issued for another user account');
      }
      const secret = process.env.JWT_SECRET || 'test_jwt_secret_key_minimum_32_chars_long_12345';
      const payloadsToCheck = [
        `${assetId}:${queryUser}:${exp}`,
        `${assetId}:${exp}`,
      ];
      let validSig = false;
      for (const p of payloadsToCheck) {
        const expectedSig = crypto.createHmac('sha256', secret).update(p).digest('hex');
        if (
          expectedSig.length === querySig.length &&
          crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(querySig, 'hex'))
        ) {
          validSig = true;
          break;
        }
      }
      if (!validSig) {
        throw new UnauthorizedException('Invalid evidence URL signature');
      }
    }

    let isAuthorized = false;

    if (viewer.roles?.includes(Role.SUPER_ADMIN)) {
      isAuthorized = true;
    } else if (asset.uploader_user_id === viewer.id) {
      isAuthorized = true;
    } else {
      const claimEvidenceRes = await this.db.query(
        `SELECT pc.target_person_id, p.branch_id
           FROM claim_evidence_attachments cea
           JOIN profile_claims pc ON pc.id = cea.claim_id
           JOIN persons p ON p.id = pc.target_person_id
           WHERE cea.media_asset_id = $1
           LIMIT 1`,
        [assetId],
      );
      const branchId = claimEvidenceRes.rows[0]?.branch_id;
      if (branchId) {
        const hasBranchRole = (viewer.roleAssignments || []).some(
          (ra) => (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) && ra.branchId === branchId,
        );
        if (hasBranchRole) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to access or stream this evidence asset');
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

  async submitClaim(claimantUserId: string, dto: SubmitClaimDto): Promise<ClaimDetailDto> {
    if (!dto.statementOfTruth) {
      throw new BadRequestException({
        errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        message: 'Must agree to statement of truth',
      });
    }

    return this.db.transaction(async (client) => {
      // 1. Check if claimant account is already linked
      const userRes = await client.query('SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE', [claimantUserId]);
      const user = userRes.rows[0];
      if (!user) {
        throw new NotFoundException({
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'Claimant user account not found',
        });
      }
      if (user.person_id) {
        throw new ConflictException({
          errorCode: ErrorCode.PERSON_ALREADY_LINKED,
          message: 'Claimant account is already linked to a person in the tree',
        });
      }

      // 2. Lock and check target person
      const personRes = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [dto.targetPersonId]);
      const person = personRes.rows[0];
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Target person record not found: ${dto.targetPersonId}`,
        });
      }
      if (person.is_claimed || person.claimed_user_id) {
        throw new ConflictException({
          errorCode: ErrorCode.PERSON_ALREADY_CLAIMED,
          message: 'Target person profile has already been claimed and verified by a user',
        });
      }

      // 3. Check if active claim exists on target person
      const activeClaimRes = await client.query(
        `SELECT * FROM profile_claims 
         WHERE target_person_id = $1 
           AND status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED', 'DISPUTED')
         LIMIT 1`,
        [dto.targetPersonId],
      );
      if (activeClaimRes.rows.length > 0) {
        throw new ConflictException({
          errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
          message: 'An active verification claim already exists for this person',
        });
      }

      // 4. Check if claimant already has an active claim
      const userActiveClaimRes = await client.query(
        `SELECT * FROM profile_claims 
         WHERE claimant_user_id = $1 
           AND status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED')
         LIMIT 1`,
        [claimantUserId],
      );
      if (userActiveClaimRes.rows.length > 0) {
        throw new ConflictException({
          errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
          message: 'Claimant already has a pending verification claim in review',
        });
      }

      // 5. Insert claim record
      const insertClaimRes = await client.query<ClaimRecord>(
        `INSERT INTO profile_claims (
          target_person_id, claimant_user_id, status, relationship_description, 
          known_family_members, statement_of_truth, version
        ) VALUES ($1, $2, 'PENDING_TIER1', $3, $4, $5, 1) RETURNING *`,
        [
          dto.targetPersonId,
          claimantUserId,
          dto.relationshipDescription,
          JSON.stringify(dto.knownFamilyMembers || []),
          dto.statementOfTruth,
        ],
      );
      const claim = insertClaimRes.rows[0];

      // 5.5 Validate evidence ownership and clean quarantine status
      await this.validateEvidenceAttachments(client, claimantUserId, dto.evidenceAttachments);

      // 6. Insert evidence attachments
      if (dto.evidenceAttachments && dto.evidenceAttachments.length > 0) {
        await this.validateEvidenceAttachments(client, claimantUserId, dto.evidenceAttachments);
        for (const att of dto.evidenceAttachments) {
          await client.query(
            `INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, description)
             VALUES ($1, $2, $3, $4)`,
            [claim.id, att.mediaAssetId, att.documentType, att.description || null],
          );
        }
      }

      // 7. Record immutable workflow state transition
      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, 'DRAFT', 'PENDING_TIER1', $2, $3)`,
        [claim.id, claimantUserId, 'Initial claim submission'],
      );

      // 8. Record audit intent
      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CLAIM_SUBMITTED',
          entityType: 'PROFILE_CLAIM',
          entityId: claim.id,
          actorId: claimantUserId,
          actorRole: 'MEMBER',
          oldValue: null,
          newValue: {
            claimId: claim.id,
            targetPersonId: claim.target_person_id,
            claimantUserId,
            status: 'PENDING_TIER1',
          },
        },
        client,
      );

      return this.mapToDetailDto(claim, client);
    });
  }

  async requestCorrection(
    claimId: string,
    actor: AuthenticatedUser,
    dto: RequestClaimCorrectionDto,
  ): Promise<ClaimDetailDto> {
    if (!dto.notes || !dto.notes.trim()) {
      throw new BadRequestException({
        errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        message: 'Correction request notes are required',
      });
    }

    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      if (claim.claimant_user_id === actor.id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
          message: 'Reviewers cannot request corrections on their own claims',
        });
      }

      await this.validateBranchAuthority(client, actor, claim.target_person_id);
      await this.validateFamilyRecusal(client, actor, claim);

      if (claim.status !== ClaimStatus.PENDING_TIER1 && claim.status !== ClaimStatus.PENDING_TIER2 && claim.status !== ClaimStatus.RESUBMITTED) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: `Cannot request corrections for claim in state ${claim.status}`,
        });
      }

      const updatedRes = await client.query<ClaimRecord>(
        `UPDATE profile_claims 
         SET status = 'CORRECTION_REQUESTED', correction_request_notes = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [dto.notes, claimId],
      );
      const updatedClaim = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, $2, 'CORRECTION_REQUESTED', $3, $4)`,
        [claimId, claim.status, actor.id, dto.notes],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CLAIM_CORRECTION_REQUESTED',
          entityType: 'PROFILE_CLAIM',
          entityId: claimId,
          actorId: actor.id,
          actorRole: actor.roles[0] || 'BRANCH_VERIFIER',
          oldValue: { status: claim.status },
          newValue: { status: 'CORRECTION_REQUESTED', notes: dto.notes },
        },
        client,
      );

      return this.mapToDetailDto(updatedClaim, client);
    });
  }

  async resubmit(
    claimId: string,
    claimantUserId: string,
    dto: ResubmitClaimDto,
  ): Promise<ClaimDetailDto> {
    if (!dto.statementOfTruth) {
      throw new BadRequestException({
        errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        message: 'Must agree to statement of truth',
      });
    }

    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      if (claim.claimant_user_id !== claimantUserId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message: 'Only the original claimant can resubmit this claim',
        });
      }

      if (claim.status !== ClaimStatus.CORRECTION_REQUESTED) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: 'Claim is not in CORRECTION_REQUESTED status',
        });
      }

      // Hardening: Reset both Tier 1 and Tier 2 decisions upon resubmission
      const updatedRes = await client.query<ClaimRecord>(
        `UPDATE profile_claims 
         SET status = 'PENDING_TIER1',
             relationship_description = COALESCE($1, relationship_description),
             known_family_members = COALESCE($2, known_family_members),
             resubmission_count = resubmission_count + 1,
             tier1_reviewed_by = NULL,
             tier1_reviewed_at = NULL,
             tier1_decision = NULL,
             tier1_notes = NULL,
             tier2_reviewed_by = NULL,
             tier2_reviewed_at = NULL,
             tier2_decision = NULL,
             tier2_notes = NULL,
             correction_request_notes = NULL,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [
          dto.relationshipDescription || null,
          dto.knownFamilyMembers ? JSON.stringify(dto.knownFamilyMembers) : null,
          claimId,
        ],
      );
      const updatedClaim = updatedRes.rows[0];

      if (dto.evidenceAttachments && dto.evidenceAttachments.length > 0) {
        await this.validateEvidenceAttachments(client, claimantUserId, dto.evidenceAttachments);
        for (const att of dto.evidenceAttachments) {
          await client.query(
            `INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, description)
             VALUES ($1, $2, $3, $4)`,
            [claimId, att.mediaAssetId, att.documentType, att.description || null],
          );
        }
      }

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, 'CORRECTION_REQUESTED', 'PENDING_TIER1', $2, $3)`,
        [claimId, claimantUserId, 'Claimant resubmitted amended evidence'],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CLAIM_RESUBMITTED',
          entityType: 'PROFILE_CLAIM',
          entityId: claimId,
          actorId: claimantUserId,
          actorRole: 'MEMBER',
          oldValue: { status: 'CORRECTION_REQUESTED', resubmission_count: claim.resubmission_count },
          newValue: { status: 'PENDING_TIER1', resubmission_count: updatedClaim.resubmission_count },
        },
        client,
      );

      return this.mapToDetailDto(updatedClaim, client);
    });
  }

  async tier1Review(
    claimId: string,
    actor: AuthenticatedUser,
    dto: Tier1ReviewClaimDto,
  ): Promise<ClaimDetailDto> {
    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      await this.validateBranchAuthority(client, actor, claim.target_person_id);
      await this.validateFamilyRecusal(client, actor, claim);

      if (claim.claimant_user_id === actor.id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
          message: 'Reviewers cannot review their own claims',
        });
      }

      if (claim.status !== ClaimStatus.PENDING_TIER1 && claim.status !== ClaimStatus.RESUBMITTED) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: `Cannot perform Tier 1 review on claim in status ${claim.status}`,
        });
      }

      let newStatus: ClaimStatus;
      if (dto.decision === 'VOUCHED') {
        newStatus = ClaimStatus.PENDING_TIER2;
      } else if (dto.decision === 'REJECTED') {
        newStatus = ClaimStatus.REJECTED;
      } else if (dto.decision === 'CORRECTION_REQUESTED') {
        newStatus = ClaimStatus.CORRECTION_REQUESTED;
      } else if (dto.decision === 'ESCALATED') {
        newStatus = ClaimStatus.ESCALATED;
      } else {
        throw new BadRequestException('Invalid Tier 1 review decision');
      }

      const correctionNotes = dto.decision === 'CORRECTION_REQUESTED' ? dto.notes : null;
      const updatedRes = await client.query<ClaimRecord>(
        `UPDATE profile_claims 
         SET status = $1,
             tier1_reviewed_by = $2,
             tier1_reviewed_at = NOW(),
             tier1_decision = $3,
             tier1_notes = $4,
             correction_request_notes = COALESCE($5, correction_request_notes),
             version = version + 1,
             updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [newStatus, actor.id, dto.decision, dto.notes, correctionNotes, claimId],
      );
      const updatedClaim = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, $2, $3, $4, $5)`,
        [claimId, claim.status, newStatus, actor.id, dto.notes],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: `CLAIM_TIER1_${dto.decision}`,
          entityType: 'PROFILE_CLAIM',
          entityId: claimId,
          actorId: actor.id,
          actorRole: actor.roles[0] || 'BRANCH_VERIFIER',
          oldValue: { status: claim.status },
          newValue: { status: newStatus, decision: dto.decision, notes: dto.notes },
        },
        client,
      );

      return this.mapToDetailDto(updatedClaim, client);
    });
  }

  async escalate(
    claimId: string,
    actor: AuthenticatedUser,
    notes: string,
  ): Promise<ClaimDetailDto> {
    return this.tier1Review(claimId, actor, {
      decision: 'ESCALATED',
      notes,
    });
  }

  async tier2Review(
    claimId: string,
    actor: AuthenticatedUser,
    dto: Tier2ReviewClaimDto,
  ): Promise<{ claim: ClaimDetailDto; alreadyApproved: boolean }> {
    if (!actor.roles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Tier 2 final approval requires Super Admin authority',
      });
    }

    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      if (claim.claimant_user_id === actor.id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
          message: 'Super Admin cannot verify their own profile claim',
        });
      }

      await this.validateFamilyRecusal(client, actor, claim);

      if (claim.tier1_reviewed_by && claim.tier1_reviewed_by === actor.id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
          message: 'Separation of duties violation: Tier 2 approver cannot be the same person as Tier 1 reviewer',
        });
      }

      const uId = claim.claimant_user_id;
      const pId = claim.target_person_id;
      let claimantUser: any;
      let targetPerson: any;

      if (uId < pId) {
        const uRes = await client.query('SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE', [uId]);
        claimantUser = uRes.rows[0];
        const pRes = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [pId]);
        targetPerson = pRes.rows[0];
      } else {
        const pRes = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [pId]);
        targetPerson = pRes.rows[0];
        const uRes = await client.query('SELECT * FROM user_accounts WHERE id = $1 FOR UPDATE', [uId]);
        claimantUser = uRes.rows[0];
      }

      // GENUINE IDEMPOTENCY CHECK
      if (
        claim.status === ClaimStatus.APPROVED &&
        claimantUser.person_id === targetPerson.id &&
        targetPerson.claimed_user_id === claimantUser.id
      ) {
        const mapped = await this.mapToDetailDto(claim);
        return { claim: mapped, alreadyApproved: true };
      }

      if (claim.status !== ClaimStatus.PENDING_TIER2 && claim.status !== ClaimStatus.ESCALATED) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: `Cannot perform Tier 2 review on claim in status ${claim.status}`,
        });
      }

      if (dto.decision === 'APPROVED') {
        if (claimantUser.person_id && claimantUser.person_id !== targetPerson.id) {
          throw new ConflictException({
            errorCode: ErrorCode.PERSON_ALREADY_LINKED,
            message: 'Claimant account is already linked to another person record',
          });
        }
        if (targetPerson.claimed_user_id && targetPerson.claimed_user_id !== claimantUser.id) {
          throw new ConflictException({
            errorCode: ErrorCode.PERSON_ALREADY_CLAIMED,
            message: 'Target person is already claimed by another user account',
          });
        }

        await client.query(
          'UPDATE user_accounts SET person_id = $1, updated_at = NOW() WHERE id = $2',
          [targetPerson.id, claimantUser.id],
        );
        await client.query(
          'UPDATE persons SET claimed_user_id = $1, is_claimed = TRUE, version = version + 1, updated_at = NOW() WHERE id = $2',
          [claimantUser.id, targetPerson.id],
        );

        const updatedRes = await client.query<ClaimRecord>(
          `UPDATE profile_claims 
           SET status = 'APPROVED',
               tier2_reviewed_by = $1,
               tier2_reviewed_at = NOW(),
               tier2_decision = 'APPROVED',
               tier2_notes = $2,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [actor.id, dto.notes, claimId],
        );
        const updatedClaim = updatedRes.rows[0];

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('PROFILE_CLAIM', $1, $2, 'APPROVED', $3, $4)`,
          [claimId, claim.status, actor.id, dto.notes],
        );

        await this.auditOutboxRepo.recordAuditIntent(
          {
            action: 'CLAIM_APPROVED_AND_LINKED',
            entityType: 'PROFILE_CLAIM',
            entityId: claimId,
            actorId: actor.id,
            actorRole: Role.SUPER_ADMIN,
            oldValue: { status: claim.status, is_claimed: targetPerson.is_claimed },
            newValue: {
              status: 'APPROVED',
              is_claimed: true,
              linkedPersonId: targetPerson.id,
              linkedUserId: claimantUser.id,
              notes: dto.notes,
            },
          },
          client,
        );

        const mapped = await this.mapToDetailDto(updatedClaim, client);
        return { claim: mapped, alreadyApproved: false };
      } else if (dto.decision === 'REJECTED') {
        const updatedRes = await client.query<ClaimRecord>(
          `UPDATE profile_claims 
           SET status = 'REJECTED',
               tier2_reviewed_by = $1,
               tier2_reviewed_at = NOW(),
               tier2_decision = 'REJECTED',
               tier2_notes = $2,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [actor.id, dto.notes, claimId],
        );
        const updatedClaim = updatedRes.rows[0];

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('PROFILE_CLAIM', $1, $2, 'REJECTED', $3, $4)`,
          [claimId, claim.status, actor.id, dto.notes],
        );

        await this.auditOutboxRepo.recordAuditIntent(
          {
            action: 'CLAIM_TIER2_REJECTED',
            entityType: 'PROFILE_CLAIM',
            entityId: claimId,
            actorId: actor.id,
            actorRole: Role.SUPER_ADMIN,
            oldValue: { status: claim.status },
            newValue: { status: 'REJECTED', notes: dto.notes },
          },
          client,
        );

        const mapped = await this.mapToDetailDto(updatedClaim, client);
        return { claim: mapped, alreadyApproved: false };
      } else if (dto.decision === 'CORRECTION_REQUESTED') {
        const updatedRes = await client.query<ClaimRecord>(
          `UPDATE profile_claims 
           SET status = 'CORRECTION_REQUESTED',
               correction_request_notes = $1,
               tier2_reviewed_by = $2,
               tier2_reviewed_at = NOW(),
               tier2_decision = 'CORRECTION_REQUESTED',
               tier2_notes = $1,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [dto.notes, actor.id, claimId],
        );
        const updatedClaim = updatedRes.rows[0];

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('PROFILE_CLAIM', $1, $2, 'CORRECTION_REQUESTED', $3, $4)`,
          [claimId, claim.status, actor.id, dto.notes],
        );

        const mapped = await this.mapToDetailDto(updatedClaim, client);
        return { claim: mapped, alreadyApproved: false };
      } else {
        throw new BadRequestException('Invalid Tier 2 decision');
      }
    });
  }

  async fileDispute(
    claimId: string,
    disputantUserId: string,
    dto: FileClaimDisputeDto,
  ): Promise<ClaimDisputeDetailDto> {
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Dispute reason is required');
    }

    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      if (claim.status !== ClaimStatus.APPROVED) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: 'Disputes can only be filed against APPROVED claims',
        });
      }

      if (claim.claimant_user_id === disputantUserId) {
        throw new BadRequestException('Claimant cannot dispute their own approved claim');
      }

      const disputeRes = await client.query<ClaimDisputeRecord>(
        `INSERT INTO claim_disputes (claim_id, disputant_user_id, reason, status)
         VALUES ($1, $2, $3, 'OPEN') RETURNING *`,
        [claimId, disputantUserId, dto.reason],
      );
      const dispute = disputeRes.rows[0];

      await client.query(
        `UPDATE profile_claims SET status = 'DISPUTED', version = version + 1, updated_at = NOW() WHERE id = $1`,
        [claimId],
      );

      if (dto.evidenceAttachments && dto.evidenceAttachments.length > 0) {
        await this.validateEvidenceAttachments(client, disputantUserId, dto.evidenceAttachments);
        for (const att of dto.evidenceAttachments) {
          await client.query(
            `INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, description, dispute_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [claimId, att.mediaAssetId, att.documentType, att.description || null, dispute.id],
          );
        }
      }

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, 'APPROVED', 'DISPUTED', $2, $3)`,
        [claimId, disputantUserId, dto.reason],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CLAIM_DISPUTED',
          entityType: 'CLAIM_DISPUTE',
          entityId: dispute.id,
          actorId: disputantUserId,
          actorRole: 'MEMBER',
          oldValue: { claimStatus: 'APPROVED' },
          newValue: { claimStatus: 'DISPUTED', disputeId: dispute.id, reason: dto.reason },
        },
        client,
      );

      return {
        id: dispute.id,
        claimId: dispute.claim_id,
        disputantUserId: dispute.disputant_user_id,
        reason: dispute.reason,
        status: dispute.status,
        resolutionNotes: dispute.resolution_notes || undefined,
        resolvedByUserId: dispute.resolved_by || undefined,
        resolvedAt: dispute.resolved_at || undefined,
        createdAt: dispute.created_at,
        updatedAt: dispute.updated_at,
      };
    });
  }

  async resolveDispute(
    disputeId: string,
    actor: AuthenticatedUser,
    dto: { decision: 'DISMISSED' | 'RESOLVED'; notes: string },
  ): Promise<ClaimDisputeDetailDto> {
    if (!actor.roles.includes(Role.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can resolve claim disputes');
    }

    return this.db.transaction(async (client) => {
      const dispRes = await client.query<ClaimDisputeRecord>('SELECT * FROM claim_disputes WHERE id = $1 FOR UPDATE', [disputeId]);
      const dispute = dispRes.rows[0];
      if (!dispute) {
        throw new NotFoundException('Dispute record not found');
      }

      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [dispute.claim_id]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Associated claim record not found');
      }

      // Recusal check: disputant or claimant cannot adjudicate their own dispute
      if (actor.id === dispute.disputant_user_id || actor.id === claim.claimant_user_id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
          message: 'Disputant or claimant cannot adjudicate their own dispute due to conflict of interest',
        });
      }

      // Check authorization and family recusal BEFORE returning any idempotent response
      await this.validateFamilyRecusal(client, actor, claim);

      // Idempotency: if already terminal, return existing state
      if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.DISMISSED) {
        return {
          id: dispute.id,
          claimId: dispute.claim_id,
          disputantUserId: dispute.disputant_user_id,
          reason: dispute.reason,
          status: dispute.status,
          resolutionNotes: dispute.resolution_notes || undefined,
          resolvedByUserId: dispute.resolved_by || undefined,
          resolvedAt: dispute.resolved_at || undefined,
          createdAt: dispute.created_at,
          updatedAt: dispute.updated_at,
        };
      }

      const newDisputeStatus = dto.decision === 'DISMISSED' ? DisputeStatus.DISMISSED : DisputeStatus.RESOLVED;

      await client.query(
        `UPDATE claim_disputes 
         SET status = $1, resolution_notes = $2, resolved_by = $3, resolved_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [newDisputeStatus, dto.notes, actor.id, disputeId],
      );

      if (dto.decision === 'DISMISSED') {
        await client.query(
          `UPDATE profile_claims SET status = 'APPROVED', version = version + 1, updated_at = NOW() WHERE id = $1`,
          [claim.id],
        );
        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('PROFILE_CLAIM', $1, 'DISPUTED', 'APPROVED', $2, $3)`,
          [claim.id, actor.id, `Dispute dismissed: ${dto.notes}`],
        );
      } else {
        await client.query(
          `UPDATE profile_claims SET status = 'SUPERSEDED', version = version + 1, updated_at = NOW() WHERE id = $1`,
          [claim.id],
        );

        // Safe unlinking: ONLY unlink if the claimant user is currently linked to THIS target person
        await client.query(
          'UPDATE user_accounts SET person_id = NULL, updated_at = NOW() WHERE id = $1 AND person_id = $2',
          [claim.claimant_user_id, claim.target_person_id],
        );

        // ONLY clear person claimed_user_id if currently claimed by this specific claimant
        await client.query(
          'UPDATE persons SET claimed_user_id = NULL, is_claimed = FALSE, version = version + 1, updated_at = NOW() WHERE id = $1 AND claimed_user_id = $2',
          [claim.target_person_id, claim.claimant_user_id],
        );

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('PROFILE_CLAIM', $1, 'DISPUTED', 'SUPERSEDED', $2, $3)`,
          [claim.id, actor.id, `Dispute upheld: ${dto.notes}`],
        );
      }

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: `DISPUTE_${dto.decision}`,
          entityType: 'CLAIM_DISPUTE',
          entityId: disputeId,
          actorId: actor.id,
          actorRole: Role.SUPER_ADMIN,
          oldValue: { disputeStatus: dispute.status, claimStatus: claim.status },
          newValue: { disputeStatus: newDisputeStatus, resolutionNotes: dto.notes },
        },
        client,
      );

      return {
        id: dispute.id,
        claimId: dispute.claim_id,
        disputantUserId: dispute.disputant_user_id,
        reason: dispute.reason,
        status: newDisputeStatus,
        resolutionNotes: dto.notes,
        resolvedByUserId: actor.id,
        resolvedAt: new Date().toISOString(),
        createdAt: dispute.created_at,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async withdrawClaim(claimId: string, claimantUserId: string): Promise<ClaimDetailDto> {
    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1 FOR UPDATE', [claimId]);
      const claim = claimRes.rows[0];
      if (!claim) {
        throw new NotFoundException('Claim record not found');
      }

      if (claim.claimant_user_id !== claimantUserId) {
        throw new ForbiddenException('Only the claimant can withdraw their claim');
      }

      const terminalOrDisputed = [
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.SUPERSEDED,
        ClaimStatus.DISPUTED,
        ClaimStatus.WITHDRAWN,
      ];
      if (terminalOrDisputed.includes(claim.status)) {
        throw new BadRequestException({
          errorCode: ErrorCode.INVALID_CLAIM_STATE,
          message: `Cannot withdraw claim in status ${claim.status}`,
        });
      }

      const updatedRes = await client.query<ClaimRecord>(
        `UPDATE profile_claims SET status = 'WITHDRAWN', version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [claimId],
      );
      const updatedClaim = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('PROFILE_CLAIM', $1, $2, 'WITHDRAWN', $3, 'Withdrawn by claimant')`,
        [claimId, claim.status, claimantUserId],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CLAIM_WITHDRAWN',
          entityType: 'PROFILE_CLAIM',
          entityId: claimId,
          actorId: claimantUserId,
          actorRole: 'MEMBER',
          oldValue: { status: claim.status },
          newValue: { status: 'WITHDRAWN' },
        },
        client,
      );

      return this.mapToDetailDto(updatedClaim);
    });
  }

  async getClaimById(claimId: string, actor?: AuthenticatedUser): Promise<ClaimDetailDto> {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    // Authorization: claimant, branch reviewer/admin, or Super Admin
    if (actor && !actor.roles?.includes(Role.SUPER_ADMIN) && claim.claimant_user_id !== actor.id) {
      const person = await this.personRepo.findById(claim.target_person_id);
      const targetBranchId = person?.branch_id;

      const hasAuthority = (actor.roleAssignments || []).some(
        (ra) =>
          (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) &&
          ra.branchId === targetBranchId,
      );

      if (!hasAuthority) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message: 'You are not authorized to view this claim',
        });
      }
    }

    return this.mapToDetailDto(claim, undefined, actor);
  }

  async listClaims(
    actor?: AuthenticatedUser,
    options?: { status?: ClaimStatus; claimantUserId?: string; branchId?: string },
  ): Promise<ClaimDetailDto[]> {
    const isReviewer = actor
      ? (actor.roles?.includes(Role.SUPER_ADMIN) ||
        (actor.roleAssignments || []).some(
          (ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER,
        ))
      : true;

    let claimantFilter = options?.claimantUserId;
    let branchFilter = options?.branchId;

    if (actor && !isReviewer) {
      // Regular members can only view their own claims
      claimantFilter = actor.id;
    } else if (actor && !actor.roles?.includes(Role.SUPER_ADMIN)) {
      const branchAssignments = (actor.roleAssignments || [])
        .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
        .map((ra) => ra.branchId)
        .filter((b): b is string => b !== null);
      if (branchAssignments.length > 0 && !branchFilter) {
        branchFilter = branchAssignments[0];
      }
    }

    const records = await this.claimRepo.listAll({
      status: options?.status,
      claimantUserId: claimantFilter,
      branchId: branchFilter,
    });

    return Promise.all(records.map((r) => this.mapToDetailDto(r, undefined, actor)));
  }

  private async mapToDetailDto(claim: ClaimRecord, client?: PoolClient, viewer?: AuthenticatedUser): Promise<ClaimDetailDto> {
    let targetPersonNameNepali = 'अज्ञात';
    let targetPersonNameEnglish = 'Unknown';
    let branchId = 'b-001';
    let branchName = 'कास्की शाखा';
    let gender = 'MALE' as any;
    let livingStatus = 'LIVING' as any;
    let generation = 1;
    let isClaimed = false;

    const person = await this.personRepo.findById(claim.target_person_id);
    if (person) {
      branchId = person.branch_id || branchId;
      gender = person.gender;
      livingStatus = person.living_status;
      generation = person.generation;
      isClaimed = person.is_claimed;

      const names = await this.personRepo.findNamesByPersonId(person.id);
      const neName = names.find((n) => n.language === 'ne');
      const enName = names.find((n) => n.language === 'en');
      if (neName) targetPersonNameNepali = neName.full_name;
      if (enName) targetPersonNameEnglish = enName.full_name;

      if (person.branch_id) {
        const branch = await this.branchRepo.findById(person.branch_id);
        if (branch) branchName = branch.name_nepali;
      }
    }

    let claimantPhone = '9841000001';
    const user = await this.userRepo.findById(claim.claimant_user_id);
    if (user) {
      claimantPhone = user.phone_number;
    }

    // Phone and evidence redaction if viewer is not claimant and not reviewer
    let canViewEvidence = true;
    if (viewer && !viewer.roles?.includes(Role.SUPER_ADMIN) && viewer.id !== claim.claimant_user_id) {
      const isReviewer = (viewer.roleAssignments || []).some(
        (ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER,
      );
      if (!isReviewer) {
        claimantPhone = claimantPhone.substring(0, 4) + '****' + claimantPhone.slice(-2);
        canViewEvidence = false;
      }
    }

    const rawEvidence = canViewEvidence ? await this.claimRepo.findEvidenceByClaimId(claim.id, client) : [];
    const evidenceAttachments = rawEvidence.map((e) => ({
      id: e.id,
      mediaAssetId: e.media_asset_id,
      mediaUrl: this.generatePresignedUrl(e.media_asset_id, claim.claimant_user_id),
      documentType: e.document_type,
      description: e.description || undefined,
      disputeId: e.dispute_id || undefined,
      createdAt: e.created_at,
    }));

    return {
      id: claim.id,
      targetPersonId: claim.target_person_id,
      targetPerson: {
        id: claim.target_person_id,
        primaryNameNepali: targetPersonNameNepali,
        primaryNameEnglish: targetPersonNameEnglish,
        branchId,
        branchName: branchName,
        gender,
        livingStatus,
        generation,
        isClaimed,
      },
      claimantUserId: claim.claimant_user_id,
      claimantPhoneNumber: claimantPhone,
      status: claim.status,
      relationshipDescription: claim.relationship_description,
      knownFamilyMembers: claim.known_family_members,
      statementOfTruth: claim.statement_of_truth,
      tier1ReviewedBy: claim.tier1_reviewed_by || undefined,
      tier1ReviewedAt: claim.tier1_reviewed_at || undefined,
      tier1Decision: claim.tier1_decision || undefined,
      tier1Notes: claim.tier1_notes || undefined,
      tier2ReviewedBy: claim.tier2_reviewed_by || undefined,
      tier2ReviewedAt: claim.tier2_reviewed_at || undefined,
      tier2Decision: claim.tier2_decision || undefined,
      tier2Notes: claim.tier2_notes || undefined,
      correctionRequestNotes: claim.correction_request_notes || undefined,
      resubmissionCount: claim.resubmission_count || 0,
      evidenceAttachments,
      version: claim.version || 1,
      createdAt: claim.created_at,
      updatedAt: claim.updated_at,
    };
  }

  private async validateBranchAuthority(client: any, actor: AuthenticatedUser, targetPersonId: string) {
    if (actor.roles.includes(Role.SUPER_ADMIN)) return;

    const personRes = await client.query('SELECT branch_id FROM persons WHERE id = $1', [targetPersonId]);
    const targetBranchId = personRes.rows[0]?.branch_id;

    const hasAuthority = (actor.roleAssignments || []).some(
      (ra) =>
        (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) &&
        ra.branchId === targetBranchId,
    );

    if (!hasAuthority) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: `Branch mismatch: You do not possess administrative authority for branch ${targetBranchId}`,
        messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
      });
    }
  }

  private async validateFamilyRecusal(client: any, actor: AuthenticatedUser, claim: ClaimRecord) {
    const actorUserRes = await client.query('SELECT person_id FROM user_accounts WHERE id = $1', [actor.id]);
    const actorPersonId = actorUserRes.rows[0]?.person_id;
    if (!actorPersonId) return;

    if (actorPersonId === claim.target_person_id) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Family recusal: Reviewer cannot verify claims for their own person record',
      });
    }

    const relRes = await client.query(
      `SELECT 1 FROM parent_links 
       WHERE (parent_id = $1 AND child_id = $2)
          OR (parent_id = $2 AND child_id = $1)
       UNION
       SELECT 1 FROM spouse_links 
       WHERE (person_id = $1 AND spouse_id = $2)
          OR (person_id = $2 AND spouse_id = $1)
       UNION
       SELECT 1 FROM parent_links p1 JOIN parent_links p2 ON p1.parent_id = p2.parent_id WHERE p1.child_id = $1 AND p2.child_id = $2`,
      [actorPersonId, claim.target_person_id],
    );

    if (relRes.rows.length > 0) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Family recusal: Reviewer cannot verify claims for immediate family members (parent, child, spouse, sibling)',
      });
    }
  }
}
