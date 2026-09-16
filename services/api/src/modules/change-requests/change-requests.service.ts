import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  SubmitChangeRequestDto,
  ChangeRequestDetailDto,
  ReviewChangeRequestDto,
  ResubmitChangeRequestDto,
  ChangeRequestType,
  ChangeRequestStatus,
  Role,
  ErrorCode,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
import { GenealogyLinkRepository } from '../../database/repositories/genealogy-link.repository';
import { DuplicateService } from '../genealogy/duplicate.service';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { DiffService } from './diff.service';

export interface ChangeRequestRecord {
  id: string;
  target_person_id?: string | null;
  requester_user_id: string;
  request_type?: any;
  type?: any;
  status: ChangeRequestStatus;
  base_version: number;
  version: number;
  proposed_changes: any;
  current_snapshot?: any;
  reason: string;
  correction_notes?: string | null;
  resubmission_count: number;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly personRepo: PersonRepository,
    private readonly branchRepo: BranchRepository,
    private readonly linkRepo: GenealogyLinkRepository,
    private readonly auditOutboxRepo: AuditOutboxRepository,
    private readonly diffService: DiffService,
    @Inject(forwardRef(() => DuplicateService))
    private readonly duplicateService: DuplicateService,
  ) {}

  async submitRequest(
    requesterUserId: string,
    dto: SubmitChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException({
        errorCode: ErrorCode.JUSTIFICATION_REQUIRED,
        message: 'A detailed justification reason is mandatory for change requests',
      });
    }

    return this.db.transaction(async (client) => {
      let baseVersion = 0;
      let snapshot: any = null;
      let branchId = dto.branchId || null;

      if (dto.targetPersonId) {
        const personRes = await client.query('SELECT * FROM persons WHERE id = $1', [dto.targetPersonId]);
        const person = personRes.rows[0];
        if (!person) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: `Target person record not found: ${dto.targetPersonId}`,
          });
        }
        baseVersion = person.version || 1;
        branchId = person.branch_id || branchId;

        const namesRes = await client.query('SELECT * FROM person_names WHERE person_id = $1', [person.id]);
        const neName = namesRes.rows.find((n: any) => n.language === 'ne')?.full_name;
        const enName = namesRes.rows.find((n: any) => n.language === 'en')?.full_name;

        snapshot = {
          id: person.id,
          primaryNameNepali: neName,
          primaryNameEnglish: enName,
          gender: person.gender,
          livingStatus: person.living_status,
          branchId: person.branch_id,
          generation: person.generation,
          birthDateBs: person.birth_date_bs,
          birthYearBs: person.birth_year_bs,
          deathDateBs: person.death_date_bs,
          deathYearBs: person.death_year_bs,
          version: person.version,
        };
      }

      const insertRes = await client.query<ChangeRequestRecord>(
        `INSERT INTO genealogy_change_requests (
          target_person_id, requester_user_id, request_type, status, base_version, version,
          proposed_changes, current_snapshot, reason, resubmission_count
        ) VALUES ($1, $2, $3, 'PENDING', $4, 1, $5, $6, $7, 0) RETURNING *`,
        [
          dto.targetPersonId || null,
          requesterUserId,
          dto.type,
          baseVersion,
          JSON.stringify(dto.proposedChanges || {}),
          snapshot ? JSON.stringify(snapshot) : null,
          dto.reason,
        ],
      );
      const req = insertRes.rows[0];

      if (dto.evidenceAssetIds && dto.evidenceAssetIds.length > 0) {
        for (const assetId of dto.evidenceAssetIds) {
          await client.query(
            `INSERT INTO change_request_evidence_attachments (change_request_id, media_asset_id, document_type, description) VALUES ($1, $2, 'supporting_document', 'Supporting evidence')`,
            [req.id, assetId],
          );
        }
      }

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, 'SUBMITTED', 'PENDING', $2, $3)`,
        [req.id, requesterUserId, dto.reason],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_SUBMITTED',
          entityType: 'CHANGE_REQUEST',
          entityId: req.id,
          actorId: requesterUserId,
          actorRole: 'MEMBER',
          oldValue: null,
          newValue: {
            requestId: req.id,
            targetPersonId: req.target_person_id,
            type: req.request_type || req.type,
            baseVersion,
          },
        },
        client,
      );

      return this.mapToDetailDto(req, branchId);
    });
  }

  async requestCorrection(
    id: string,
    actor: AuthenticatedUser,
    notes: string,
  ): Promise<ChangeRequestDetailDto> {
    if (!notes || !notes.trim()) {
      throw new BadRequestException('Correction notes are required');
    }

    return this.db.transaction(async (client) => {
      const gcrRes = await client.query<ChangeRequestRecord>('SELECT * FROM genealogy_change_requests WHERE id = $1 FOR UPDATE', [id]);
      const gcr = gcrRes.rows[0];
      if (!gcr) {
        throw new NotFoundException('Change request not found');
      }

      if (gcr.requester_user_id === actor.id) {
        throw new ForbiddenException('Reviewers cannot request corrections on their own proposals');
      }

      await this.validateBranchAuthority(client, actor, gcr.target_person_id);
      await this.validateFamilyRecusal(client, actor, gcr);

      const updatedRes = await client.query<ChangeRequestRecord>(
        `UPDATE genealogy_change_requests 
         SET status = 'CORRECTION_REQUESTED', correction_notes = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [notes, id],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, $2, 'CORRECTION_REQUESTED', $3, $4)`,
        [id, gcr.status, actor.id, notes],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_CORRECTION_REQUESTED',
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: actor.id,
          actorRole: actor.roles[0] || 'BRANCH_ADMIN',
          oldValue: { status: gcr.status },
          newValue: { status: 'CORRECTION_REQUESTED', notes },
        },
        client,
      );

      return this.mapToDetailDto(updated);
    });
  }

  async resubmit(
    id: string,
    requesterUserId: string,
    dto: ResubmitChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    return this.db.transaction(async (client) => {
      const gcrRes = await client.query<ChangeRequestRecord>('SELECT * FROM genealogy_change_requests WHERE id = $1 FOR UPDATE', [id]);
      const gcr = gcrRes.rows[0];
      if (!gcr) {
        throw new NotFoundException('Change request not found');
      }

      if (gcr.requester_user_id !== requesterUserId) {
        throw new ForbiddenException('Only the requester can resubmit this change request');
      }

      let refreshedBaseVersion = gcr.base_version;
      let snapshot = gcr.current_snapshot;
      if (gcr.target_person_id) {
        const pRes = await client.query('SELECT * FROM persons WHERE id = $1', [gcr.target_person_id]);
        const person = pRes.rows[0];
        if (person) {
          refreshedBaseVersion = person.version;
          const namesRes = await client.query('SELECT * FROM person_names WHERE person_id = $1', [person.id]);
          snapshot = {
            ...snapshot,
            version: person.version,
            primaryNameNepali: namesRes.rows.find((n: any) => n.language === 'ne')?.full_name,
            primaryNameEnglish: namesRes.rows.find((n: any) => n.language === 'en')?.full_name,
          };
        }
      }

      const updatedRes = await client.query<ChangeRequestRecord>(
        `UPDATE genealogy_change_requests 
         SET status = 'PENDING',
             proposed_changes = $1,
             current_snapshot = $2,
             base_version = $3,
             resubmission_count = resubmission_count + 1,
             version = version + 1,
             reason = COALESCE($4, reason),
             reviewed_by = NULL,
             reviewed_at = NULL,
             review_notes = NULL,
             correction_notes = NULL,
             updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [
          JSON.stringify(dto.proposedChanges || {}),
          JSON.stringify(snapshot),
          refreshedBaseVersion,
          dto.reason || null,
          id,
        ],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, $2, 'PENDING', $3, $4)`,
        [id, gcr.status, requesterUserId, 'Requester amended and resubmitted change request proposal'],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_RESUBMITTED',
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: requesterUserId,
          actorRole: 'MEMBER',
          oldValue: { status: gcr.status, baseVersion: gcr.base_version },
          newValue: { status: 'PENDING', baseVersion: refreshedBaseVersion },
        },
        client,
      );

      return this.mapToDetailDto(updated);
    });
  }

  async escalate(
    id: string,
    actor: AuthenticatedUser,
    notes: string,
  ): Promise<ChangeRequestDetailDto> {
    return this.db.transaction(async (client) => {
      const gcrRes = await client.query<ChangeRequestRecord>('SELECT * FROM genealogy_change_requests WHERE id = $1 FOR UPDATE', [id]);
      const gcr = gcrRes.rows[0];
      if (!gcr) {
        throw new NotFoundException('Change request not found');
      }

      await this.validateBranchAuthority(client, actor, gcr.target_person_id);
      await this.validateFamilyRecusal(client, actor, gcr);

      const updatedRes = await client.query<ChangeRequestRecord>(
        `UPDATE genealogy_change_requests 
         SET status = 'ESCALATED', review_notes = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [notes, id],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, $2, 'ESCALATED', $3, $4)`,
        [id, gcr.status, actor.id, notes],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_ESCALATED',
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: actor.id,
          actorRole: actor.roles[0] || 'BRANCH_ADMIN',
          oldValue: { status: gcr.status },
          newValue: { status: 'ESCALATED', notes },
        },
        client,
      );

      return this.mapToDetailDto(updated);
    });
  }

  async reviewRequest(
    id: string,
    reviewer: AuthenticatedUser,
    dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    const outcome = await this.db.transaction(async (client) => {
      // 1. Lineage graph advisory lock
      await client.query("SELECT pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))");

      // 2. Lock change request
      const gcrRes = await client.query<ChangeRequestRecord>('SELECT * FROM genealogy_change_requests WHERE id = $1 FOR UPDATE', [id]);
      const gcr = gcrRes.rows[0];
      if (!gcr) {
        throw new NotFoundException('Change request not found');
      }

      // Self-review restriction
      if (gcr.requester_user_id === reviewer.id) {
        throw new ForbiddenException({
          errorCode: ErrorCode.SELF_ELEVATION_PROHIBITED,
          message: 'Reviewers cannot review or approve their own change proposals',
        });
      }

      await this.validateBranchAuthority(client, reviewer, gcr.target_person_id);
      await this.validateFamilyRecusal(client, reviewer, gcr);

      // Genuine Idempotency check: authorized idempotent retry
      if (gcr.status === ChangeRequestStatus.APPROVED && dto.status === ChangeRequestStatus.APPROVED) {
        return { status: 'ALREADY_APPROVED', gcr };
      }

      // Check reviewable states: PENDING, RESUBMITTED, ESCALATED
      const reviewableStates = [
        ChangeRequestStatus.PENDING,
        ChangeRequestStatus.RESUBMITTED,
        ChangeRequestStatus.ESCALATED,
      ];
      if (!reviewableStates.includes(gcr.status)) {
        throw new BadRequestException({
          errorCode: ErrorCode.CANNOT_MODIFY_PROCESSED_REQUEST,
          message: `Cannot review change request in state ${gcr.status}. Only PENDING, RESUBMITTED, or ESCALATED requests can be reviewed.`,
        });
      }

      if (gcr.status === ChangeRequestStatus.ESCALATED) {
        if (!reviewer.roles.includes(Role.SUPER_ADMIN)) {
          throw new ForbiddenException({
            errorCode: ErrorCode.FORBIDDEN,
            message: 'Escalated change requests strictly require designated Super Admin adjudication',
          });
        }
      }

      if (dto.status === ChangeRequestStatus.REJECTED) {
        const updatedRes = await client.query<ChangeRequestRecord>(
          `UPDATE genealogy_change_requests 
           SET status = 'REJECTED', review_notes = $1, reviewed_by = $2, reviewed_at = NOW(), version = version + 1, updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [dto.reviewNotes || null, reviewer.id, id],
        );
        const updated = updatedRes.rows[0];

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('CHANGE_REQUEST', $1, $2, 'REJECTED', $3, $4)`,
          [id, gcr.status, reviewer.id, dto.reviewNotes || 'Rejected by reviewer'],
        );

        await this.auditOutboxRepo.recordAuditIntent(
          {
            action: 'CHANGE_REQUEST_REJECTED',
            entityType: 'CHANGE_REQUEST',
            entityId: id,
            actorId: reviewer.id,
            actorRole: reviewer.roles[0] || 'BRANCH_ADMIN',
            oldValue: { status: gcr.status },
            newValue: { status: 'REJECTED', reviewNotes: dto.reviewNotes },
          },
          client,
        );

        return { status: 'REJECTED', gcr: updated };
      }

      if (dto.status !== ChangeRequestStatus.APPROVED) {
        throw new BadRequestException(`Invalid review decision status: ${dto.status}`);
      }

      // APPROVAL FLOW with Concurrency Conflict & Graph Mutations
      const requestType = gcr.request_type || gcr.type;
      const changes = gcr.proposed_changes || {};

      let targetPerson: any = null;
      if (gcr.target_person_id) {
        const personRes = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [gcr.target_person_id]);
        targetPerson = personRes.rows[0];
        if (!targetPerson) {
          throw new NotFoundException(`Target person ${gcr.target_person_id} not found`);
        }

        // Stale base version check
        if (targetPerson.version !== gcr.base_version) {
          await client.query(
            `UPDATE genealogy_change_requests SET status = 'CONFLICT_DETECTED', version = version + 1, updated_at = NOW() WHERE id = $1`,
            [id],
          );

          await client.query(
            `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
             VALUES ('CHANGE_REQUEST', $1, $2, 'CONFLICT_DETECTED', $3, $4)`,
            [id, gcr.status, reviewer.id, 'Stale base version conflict detected during approval'],
          );

          await this.auditOutboxRepo.recordAuditIntent(
            {
              action: 'CHANGE_REQUEST_CONFLICT_DETECTED',
              entityType: 'CHANGE_REQUEST',
              entityId: id,
              actorId: reviewer.id,
              actorRole: reviewer.roles[0] || 'BRANCH_ADMIN',
              oldValue: { base_version: gcr.base_version, status: gcr.status },
              newValue: { status: 'CONFLICT_DETECTED', current_version: targetPerson.version },
            },
            client,
          );

          const refreshedDiff = this.diffService.computeVisualDiff(targetPerson, gcr.proposed_changes);

          return {
            status: 'CONFLICT_DETECTED',
            baseVersion: gcr.base_version,
            currentVersion: targetPerson.version,
            refreshedDiff,
          };
        }
      }

      // Explicit handlers for each supported request type
      if (requestType === 'NEW_PERSON') {
        const evalDto = {
          names: [
            { language: 'ne' as const, fullName: changes.primaryNameNepali || 'अज्ञात', isPrimary: true },
            { language: 'en' as const, fullName: changes.primaryNameEnglish || 'Unknown', isPrimary: false },
          ],
          gender: changes.gender || 'MALE',
          branchId: changes.branchId || null,
          birthYearBs: changes.birthYearBs,
        };
        const dupCandidates = await this.duplicateService.evaluateProposedPerson(evalDto as any, undefined, client);
        if (dupCandidates.length > 0 && dupCandidates.some((c) => c.score >= 0.95) && !changes.forceCreate) {
          throw new ConflictException({
            errorCode: ErrorCode.DUPLICATE_CANDIDATE_DETECTED,
            message: 'Potential duplicate candidate detected in tree graph during person creation',
          });
        }
        const newPersonRes = await client.query(
          `INSERT INTO persons (gender, living_status, branch_id, generation, version)
           VALUES ($1, $2, $3, $4, 1) RETURNING *`,
          [
            changes.gender || 'MALE',
            changes.livingStatus || 'LIVING',
            changes.branchId || null,
            changes.generation || 1,
          ],
        );
        const newPerson = newPersonRes.rows[0];

        if (changes.primaryNameNepali) {
          const parts = changes.primaryNameNepali.trim().split(/\s+/);
          const firstName = parts[0] || 'अज्ञात';
          const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'अधिकारी';
          await client.query(
            `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
             VALUES ($1, 'ne', $2, $3, $4, TRUE)`,
            [newPerson.id, firstName, lastName, changes.primaryNameNepali],
          );
        }
        if (changes.primaryNameEnglish) {
          const parts = changes.primaryNameEnglish.trim().split(/\s+/);
          const firstName = parts[0] || 'Unknown';
          const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Adhikari';
          await client.query(
            `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
             VALUES ($1, 'en', $2, $3, $4, TRUE)`,
            [newPerson.id, firstName, lastName, changes.primaryNameEnglish],
          );
        }
      } else if (requestType === 'EDIT_PERSON') {
        if (changes.primaryNameNepali) {
          const parts = changes.primaryNameNepali.trim().split(/\s+/);
          const firstName = parts[0] || 'अज्ञात';
          const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'अधिकारी';
          await client.query(
            `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
             VALUES ($1, 'ne', $2, $3, $4, TRUE)
             ON CONFLICT (person_id, language) WHERE is_primary = TRUE 
             DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
            [targetPerson.id, firstName, lastName, changes.primaryNameNepali],
          );
        }
        if (changes.primaryNameEnglish) {
          const parts = changes.primaryNameEnglish.trim().split(/\s+/);
          const firstName = parts[0] || 'Unknown';
          const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Adhikari';
          await client.query(
            `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
             VALUES ($1, 'en', $2, $3, $4, TRUE)
             ON CONFLICT (person_id, language) WHERE is_primary = TRUE 
             DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
            [targetPerson.id, firstName, lastName, changes.primaryNameEnglish],
          );
        }

        await client.query(
          `UPDATE persons 
           SET gender = COALESCE($1, gender),
               living_status = COALESCE($2, living_status),
               birth_date_bs = COALESCE($3, birth_date_bs),
               birth_year_bs = COALESCE($4, birth_year_bs),
               death_date_bs = COALESCE($5, death_date_bs),
               death_year_bs = COALESCE($6, death_year_bs),
               version = version + 1,
               updated_at = NOW()
           WHERE id = $7`,
          [
            changes.gender || null,
            changes.livingStatus || null,
            changes.birthDateBs || null,
            changes.birthYearBs || null,
            changes.deathDateBs || null,
            changes.deathYearBs || null,
            targetPerson.id,
          ],
        );
      } else if (requestType === 'RECORD_DEATH') {
        await client.query(
          `UPDATE persons 
           SET living_status = 'DECEASED',
               death_date_bs = COALESCE($1, death_date_bs),
               death_year_bs = COALESCE($2, death_year_bs),
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3`,
          [changes.deathDateBs || null, changes.deathYearBs || null, targetPerson.id],
        );
      } else if (requestType === 'ADD_CHILD' || (requestType === 'ADD_PARENT_LINK' && changes.isChild)) {
        let childId = changes.childPersonId;
        if (!childId) {
          // Create child person
          const newChildRes = await client.query(
            `INSERT INTO persons (gender, living_status, branch_id, generation, version)
             VALUES ($1, $2, $3, $4, 1) RETURNING *`,
            [
              changes.gender || 'MALE',
              changes.livingStatus || 'LIVING',
              targetPerson.branch_id,
              targetPerson.generation + 1,
            ],
          );
          const newChild = newChildRes.rows[0];
          childId = newChild.id;

          if (changes.primaryNameNepali) {
            const parts = changes.primaryNameNepali.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'ne', $2, $3, $4, TRUE)`,
              [childId, parts[0] || 'अज्ञात', parts.slice(1).join(' ') || 'अधिकारी', changes.primaryNameNepali],
            );
          }
          if (changes.primaryNameEnglish) {
            const parts = changes.primaryNameEnglish.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'en', $2, $3, $4, TRUE)`,
              [childId, parts[0] || 'Unknown', parts.slice(1).join(' ') || 'Adhikari', changes.primaryNameEnglish],
            );
          }
        }

        // Prevent self-link
        if (targetPerson.id === childId) {
          throw new BadRequestException({ errorCode: ErrorCode.SELF_LINK_PROHIBITED, message: 'Self-link prohibited' });
        }

        // Cycle detection check via M3 GenealogyLinkRepository
        const wouldCycle = await this.linkRepo.checkWouldCreateCycle(targetPerson.id, childId, client);
        if (wouldCycle) {
          throw new BadRequestException({
            errorCode: ErrorCode.CYCLE_DETECTED,
            message: 'Adding this parent-child link would create a directed cycle in the family tree graph',
          });
        }

        // Cross-branch link dual authority check
        const childBranchRes = await client.query('SELECT branch_id FROM persons WHERE id = $1', [childId]);
        const childBranchId = childBranchRes.rows[0]?.branch_id;
        if (targetPerson.branch_id && childBranchId && targetPerson.branch_id !== childBranchId) {
          if (!reviewer.roles.includes(Role.SUPER_ADMIN)) {
            const reviewerBranches = (reviewer.roleAssignments || [])
              .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
              .map((ra) => ra.branchId);
            if (!reviewerBranches.includes(targetPerson.branch_id) || !reviewerBranches.includes(childBranchId)) {
              throw new ForbiddenException({
                errorCode: ErrorCode.BRANCH_MISMATCH,
                message: 'Cross-branch relationship links require administrative authority for both branches',
              });
            }
          }
        }

        // Insert parent_links
        await client.query(
          `INSERT INTO parent_links (parent_id, child_id, parent_type, confidence, created_by)
           VALUES ($1, $2, 'BIOLOGICAL', 'VERIFIED', $3)
           ON CONFLICT (parent_id, child_id) DO NOTHING`,
          [targetPerson.id, childId, reviewer.id],
        );

        await client.query('UPDATE persons SET version = version + 1, updated_at = NOW() WHERE id = $1', [targetPerson.id]);
      } else if (requestType === 'ADD_PARENT' || requestType === 'ADD_PARENT_LINK') {
        let parentId = changes.parentPersonId || changes.parentId;
        if (!parentId) {
          // Create parent person
          const newParentRes = await client.query(
            `INSERT INTO persons (gender, living_status, branch_id, generation, version)
             VALUES ($1, $2, $3, $4, 1) RETURNING *`,
            [
              changes.gender || 'MALE',
              changes.livingStatus || 'LIVING',
              targetPerson.branch_id,
              Math.max(1, targetPerson.generation - 1),
            ],
          );
          const newParent = newParentRes.rows[0];
          parentId = newParent.id;

          if (changes.primaryNameNepali) {
            const parts = changes.primaryNameNepali.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'ne', $2, $3, $4, TRUE)`,
              [parentId, parts[0] || 'अज्ञात', parts.slice(1).join(' ') || 'अधिकारी', changes.primaryNameNepali],
            );
          }
          if (changes.primaryNameEnglish) {
            const parts = changes.primaryNameEnglish.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'en', $2, $3, $4, TRUE)`,
              [parentId, parts[0] || 'Unknown', parts.slice(1).join(' ') || 'Adhikari', changes.primaryNameEnglish],
            );
          }
        }

        if (targetPerson.id === parentId) {
          throw new BadRequestException({ errorCode: ErrorCode.SELF_LINK_PROHIBITED, message: 'Self-link prohibited' });
        }

        // Cycle detection check via M3 GenealogyLinkRepository
        const wouldCycleParent = await this.linkRepo.checkWouldCreateCycle(parentId, targetPerson.id, client);
        if (wouldCycleParent) {
          throw new BadRequestException({
            errorCode: ErrorCode.CYCLE_DETECTED,
            message: 'Adding this parent-child link would create a directed cycle in the family tree graph',
          });
        }

        // Cross-branch link dual authority check
        const parentBranchRes = await client.query('SELECT branch_id FROM persons WHERE id = $1', [parentId]);
        const parentBranchId = parentBranchRes.rows[0]?.branch_id;
        if (targetPerson.branch_id && parentBranchId && targetPerson.branch_id !== parentBranchId) {
          if (!reviewer.roles.includes(Role.SUPER_ADMIN)) {
            const reviewerBranches = (reviewer.roleAssignments || [])
              .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
              .map((ra) => ra.branchId);
            if (!reviewerBranches.includes(targetPerson.branch_id) || !reviewerBranches.includes(parentBranchId)) {
              throw new ForbiddenException({
                errorCode: ErrorCode.BRANCH_MISMATCH,
                message: 'Cross-branch relationship links require administrative authority for both branches',
              });
            }
          }
        }

        await client.query(
          `INSERT INTO parent_links (parent_id, child_id, parent_type, confidence, created_by)
           VALUES ($1, $2, 'BIOLOGICAL', 'VERIFIED', $3)
           ON CONFLICT (parent_id, child_id) DO NOTHING`,
          [parentId, targetPerson.id, reviewer.id],
        );

        await client.query('UPDATE persons SET version = version + 1, updated_at = NOW() WHERE id = $1', [targetPerson.id]);
      } else if (requestType === 'ADD_SPOUSE' || requestType === 'ADD_SPOUSE_LINK') {
        let spouseId = changes.spousePersonId || changes.spouseId;
        if (!spouseId) {
          const newSpouseRes = await client.query(
            `INSERT INTO persons (gender, living_status, branch_id, generation, version)
             VALUES ($1, $2, $3, $4, 1) RETURNING *`,
            [
              changes.gender || (targetPerson.gender === 'MALE' ? 'FEMALE' : 'MALE'),
              changes.livingStatus || 'LIVING',
              targetPerson.branch_id,
              targetPerson.generation,
            ],
          );
          const newSpouse = newSpouseRes.rows[0];
          spouseId = newSpouse.id;

          if (changes.primaryNameNepali) {
            const parts = changes.primaryNameNepali.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'ne', $2, $3, $4, TRUE)`,
              [spouseId, parts[0] || 'अज्ञात', parts.slice(1).join(' ') || 'अधिकारी', changes.primaryNameNepali],
            );
          }
          if (changes.primaryNameEnglish) {
            const parts = changes.primaryNameEnglish.trim().split(/\s+/);
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'en', $2, $3, $4, TRUE)`,
              [spouseId, parts[0] || 'Unknown', parts.slice(1).join(' ') || 'Adhikari', changes.primaryNameEnglish],
            );
          }
        }

        if (targetPerson.id === spouseId) {
          throw new BadRequestException({ errorCode: ErrorCode.SELF_LINK_PROHIBITED, message: 'Self-link prohibited' });
        }

        const spouseProvenance = {
          changeRequestId: id,
          approvedBy: reviewer.id,
          approvedAt: new Date().toISOString(),
          notes: dto.reviewNotes || 'Approved via governed genealogy change request',
        };

        await client.query(
          `INSERT INTO spouse_links (person_id, spouse_id, status, created_by, confidence, provenance)
           VALUES ($1, $2, 'CURRENT', $3, 'VERIFIED', $4)
           ON CONFLICT (person_id, spouse_id) DO UPDATE SET confidence = 'VERIFIED', provenance = EXCLUDED.provenance`,
          [targetPerson.id, spouseId, reviewer.id, JSON.stringify(spouseProvenance)],
        );

        await client.query('UPDATE persons SET version = version + 1, updated_at = NOW() WHERE id = $1', [targetPerson.id]);
      } else if (requestType === 'REMOVE_PARENT_LINK') {
        const parentId = changes.parentPersonId || changes.parentId;
        if (parentId) {
          await client.query('DELETE FROM parent_links WHERE parent_id = $1 AND child_id = $2', [parentId, targetPerson.id]);
          await client.query('UPDATE persons SET version = version + 1, updated_at = NOW() WHERE id = $1', [targetPerson.id]);
        }
      } else if (requestType === 'REMOVE_SPOUSE_LINK') {
        const spouseId = changes.spousePersonId || changes.spouseId;
        if (spouseId) {
          await client.query(
            'DELETE FROM spouse_links WHERE (person_id = $1 AND spouse_id = $2) OR (person_id = $2 AND spouse_id = $1)',
            [targetPerson.id, spouseId],
          );
          await client.query('UPDATE persons SET version = version + 1, updated_at = NOW() WHERE id = $1', [targetPerson.id]);
        }
      } else if (requestType === 'BRANCH_TRANSFER') {
        const destBranchId = changes.destinationBranchId || changes.branchId;
        if (!destBranchId) {
          throw new BadRequestException('Destination branch ID is required for branch transfer');
        }

        // Verify destination branch exists
        const bRes = await client.query('SELECT id FROM branches WHERE id = $1', [destBranchId]);
        if (bRes.rows.length === 0) {
          throw new NotFoundException(`Destination branch ${destBranchId} does not exist`);
        }

        // Require dual authorization: source AND destination branch authority (or Super Admin)
        if (!reviewer.roles.includes(Role.SUPER_ADMIN)) {
          const reviewerBranches = (reviewer.roleAssignments || [])
            .filter((ra) => ra.role === Role.BRANCH_ADMIN)
            .map((ra) => ra.branchId);

          const hasSource = reviewerBranches.includes(targetPerson.branch_id);
          const hasDest = reviewerBranches.includes(destBranchId);

          if (!hasSource || !hasDest) {
            throw new ForbiddenException({
              errorCode: ErrorCode.BRANCH_MISMATCH,
              message: 'Branch transfer requires administrative authority for both source and destination branches',
            });
          }
        }

        await client.query(
          'UPDATE persons SET branch_id = $1, version = version + 1, updated_at = NOW() WHERE id = $2',
          [destBranchId, targetPerson.id],
        );
      } else if (requestType === 'MERGE_PERSON') {
        const secondaryId = changes.secondaryPersonId || changes.mergedPersonId;
        if (secondaryId && secondaryId !== targetPerson.id) {
          const secRes = await client.query('SELECT * FROM persons WHERE id = $1', [secondaryId]);
          const secondaryPerson = secRes.rows[0];
          if (!secondaryPerson) {
            throw new NotFoundException(`Secondary person record not found: ${secondaryId}`);
          }
          if (secondaryPerson.is_claimed) {
            throw new ConflictException({
              errorCode: ErrorCode.CANNOT_MERGE_CLAIMED_PERSONS,
              message: 'Cannot merge claimed profile into another person',
            });
          }

          const actorContext = {
            id: reviewer.id,
            roles: reviewer.roles,
            roleAssignments: reviewer.roleAssignments,
            branchId: reviewer.branchIds?.[0],
            branchIds: reviewer.branchIds,
          };

          const mergeDto = {
            survivingPersonId: targetPerson.id,
            mergedPersonId: secondaryId,
            survivingPersonVersion: targetPerson.version,
            mergedPersonVersion: secondaryPerson.version,
            fieldResolutions: changes.fieldResolutions || {},
            notes: dto.reviewNotes || 'Merged via governed genealogy change request',
          };

          await this.duplicateService.mergePersons(mergeDto as any, actorContext as any);
        }
      }

      // Finalize Change Request Record
      const updatedRes = await client.query<ChangeRequestRecord>(
        `UPDATE genealogy_change_requests 
         SET status = 'APPROVED',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_notes = $2,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [reviewer.id, dto.reviewNotes || null, id],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, $2, 'APPROVED', $3, $4)`,
        [id, gcr.status, reviewer.id, dto.reviewNotes || 'Approved and merged into tree graph'],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_APPROVED_AND_MERGED',
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: reviewer.id,
          actorRole: reviewer.roles[0] || 'BRANCH_ADMIN',
          oldValue: { status: gcr.status, baseVersion: gcr.base_version },
          newValue: {
            status: 'APPROVED',
            requestType,
            targetPersonId: gcr.target_person_id,
            reviewNotes: dto.reviewNotes,
          },
        },
        client,
      );

      return { status: 'APPROVED', gcr: updated };
    });

    if (outcome.status === 'CONFLICT_DETECTED') {
      throw new ConflictException({
        errorCode: ErrorCode.STALE_UPDATE_DETECTED,
        message: 'Stale update detected: target person was modified after this request was created.',
        baseVersion: outcome.baseVersion,
        currentVersion: outcome.currentVersion,
        refreshedDiff: outcome.refreshedDiff,
      });
    }

    return this.mapToDetailDto(outcome.gcr);
  }

  async getRequestById(id: string, actor?: AuthenticatedUser): Promise<ChangeRequestDetailDto> {
    const res = await this.db.query<ChangeRequestRecord>('SELECT * FROM genealogy_change_requests WHERE id = $1', [id]);
    const req = res.rows[0];
    if (!req) {
      throw new NotFoundException('Change request not found');
    }

    // Actor authorization: requester, branch admin/verifier for the branch, or Super Admin
    if (actor && !actor.roles?.includes(Role.SUPER_ADMIN) && req.requester_user_id !== actor.id) {
      let targetBranchId: string | null = null;
      if (req.target_person_id) {
        const pRes = await this.db.query('SELECT branch_id FROM persons WHERE id = $1', [req.target_person_id]);
        targetBranchId = pRes.rows[0]?.branch_id;
      }

      const hasAuthority = (actor.roleAssignments || []).some(
        (ra) =>
          (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) &&
          ra.branchId === targetBranchId,
      );

      if (!hasAuthority) {
        throw new ForbiddenException({
          errorCode: ErrorCode.FORBIDDEN,
          message: 'You do not have authorization to view this change request',
        });
      }
    }

    return this.mapToDetailDto(req);
  }

  async listRequests(
    actor?: AuthenticatedUser,
    options?: { status?: ChangeRequestStatus; branchId?: string; requesterUserId?: string },
  ): Promise<ChangeRequestDetailDto[]> {
    let sql = `
      SELECT r.*, p.branch_id as person_branch_id
      FROM genealogy_change_requests r
      LEFT JOIN persons p ON r.target_person_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    // Regular members can only view their own requests
    const isReviewer = actor
      ? (actor.roles?.includes(Role.SUPER_ADMIN) ||
        (actor.roleAssignments || []).some(
          (ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER,
        ))
      : true;

    if (actor && !isReviewer) {
      sql += ` AND r.requester_user_id = $${pIdx++}`;
      params.push(actor.id);
    } else if (options?.requesterUserId) {
      sql += ` AND r.requester_user_id = $${pIdx++}`;
      params.push(options.requesterUserId);
    }

    if (options?.status) {
      sql += ` AND r.status = $${pIdx++}`;
      params.push(options.status);
    }

    sql += ' ORDER BY r.created_at DESC';
    const res = await this.db.query<any>(sql, params);

    let rows = res.rows;
    if (actor && isReviewer && !actor.roles?.includes(Role.SUPER_ADMIN)) {
      const authorizedBranches = (actor.roleAssignments || [])
        .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
        .map((ra) => ra.branchId)
        .filter((b): b is string => b !== null);

      rows = rows.filter((r: any) => !r.person_branch_id || authorizedBranches.includes(r.person_branch_id));
    }

    return Promise.all(rows.map((r: any) => this.mapToDetailDto(r, r.person_branch_id)));
  }

  private async mapToDetailDto(
    req: ChangeRequestRecord,
    branchId?: string | null,
  ): Promise<ChangeRequestDetailDto> {
    let resolvedBranchId = branchId;
    if (!resolvedBranchId && req.target_person_id) {
      const person = await this.personRepo.findById(req.target_person_id);
      if (person) resolvedBranchId = person.branch_id || null;
    }

    const visualDiff = this.diffService.computeVisualDiff(req.current_snapshot, req.proposed_changes || {});

    return {
      id: req.id,
      type: req.request_type || req.type,
      status: req.status,
      targetPersonId: req.target_person_id || undefined,
      branchId: resolvedBranchId,
      requesterUserId: req.requester_user_id,
      baseVersion: req.base_version || 0,
      version: req.version || 1,
      proposedChanges: req.proposed_changes || {},
      currentSnapshot: req.current_snapshot || undefined,
      visualDiff,
      reason: req.reason,
      correctionNotes: req.correction_notes || undefined,
      resubmissionCount: req.resubmission_count || 0,
      reviewNotes: req.review_notes || undefined,
      reviewedByUserId: req.reviewed_by || undefined,
      reviewedAt: req.reviewed_at || undefined,
      createdAt: req.created_at,
      updatedAt: req.updated_at,
    };
  }

  private async validateBranchAuthority(client: any, actor: AuthenticatedUser, targetPersonId?: string | null) {
    if (actor.roles.includes(Role.SUPER_ADMIN)) return;
    if (!targetPersonId) return;

    const personRes = await client.query('SELECT branch_id FROM persons WHERE id = $1', [targetPersonId]);
    const targetBranchId = personRes.rows[0]?.branch_id;
    if (!targetBranchId) return;

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

  private async validateFamilyRecusal(client: any, actor: AuthenticatedUser, req: ChangeRequestRecord) {
    if (!req.target_person_id) return;
    const actorUserRes = await client.query('SELECT person_id FROM user_accounts WHERE id = $1', [actor.id]);
    const actorPersonId = actorUserRes.rows[0]?.person_id;
    if (!actorPersonId) return;

    if (actorPersonId === req.target_person_id) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Family recusal: Reviewer cannot verify change proposals for their own person record',
      });
    }

    const relRes = await client.query(
      `SELECT 1 FROM parent_links 
       WHERE (parent_id = $1 AND child_id = $2) OR (parent_id = $2 AND child_id = $1)
       UNION
       SELECT 1 FROM spouse_links 
       WHERE (person_id = $1 AND spouse_id = $2) OR (person_id = $2 AND spouse_id = $1)`,
      [actorPersonId, req.target_person_id],
    );

    if (relRes.rows.length > 0) {
      throw new ForbiddenException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Family recusal: Reviewer cannot review change proposals for immediate family members (parent, child, spouse)',
      });
    }
  }
}
