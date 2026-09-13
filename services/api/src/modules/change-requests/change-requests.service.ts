import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  SubmitChangeRequestDto,
  ChangeRequestDetailDto,
  ReviewChangeRequestDto,
  ResubmitChangeRequestDto,
  ChangeRequestStatus,
  Role,
  ErrorCode,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
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
    private readonly auditOutboxRepo: AuditOutboxRepository,
    private readonly diffService: DiffService,
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
          JSON.stringify(dto.proposedChanges),
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
            type: req.type,
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
             updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [
          JSON.stringify(dto.proposedChanges),
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

      // Genuine Idempotency check
      if (gcr.status === ChangeRequestStatus.APPROVED && dto.status === ChangeRequestStatus.APPROVED) {
        return { status: 'ALREADY_APPROVED', gcr };
      }

      if (dto.status === ChangeRequestStatus.REJECTED) {
        const updatedRes = await client.query<ChangeRequestRecord>(
          `UPDATE genealogy_change_requests 
           SET status = 'REJECTED', review_notes = $1, reviewed_by = $2, reviewed_at = NOW(), version = version + 1, updated_at = NOW()
           WHERE id = $3 RETURNING *`,
          [dto.reviewNotes, reviewer.id, id],
        );
        const updated = updatedRes.rows[0];

        await client.query(
          `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
           VALUES ('CHANGE_REQUEST', $1, $2, 'REJECTED', $3, $4)`,
          [id, gcr.status, reviewer.id, dto.reviewNotes],
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

      // APPROVAL FLOW with Concurrency Conflict Isolation
      if (gcr.target_person_id) {
        const personRes = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [gcr.target_person_id]);
        const person = personRes.rows[0];
        if (!person) {
          throw new NotFoundException(`Target person ${gcr.target_person_id} not found`);
        }

        // STALE BASE VERSION CHECK
        if (person.version !== gcr.base_version) {
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
              newValue: { status: 'CONFLICT_DETECTED', current_version: person.version },
            },
            client,
          );

          const refreshedDiff = this.diffService.computeVisualDiff(person, gcr.proposed_changes);

          return {
            status: 'CONFLICT_DETECTED',
            baseVersion: gcr.base_version,
            currentVersion: person.version,
            refreshedDiff,
          };
        }

        // Apply mutations to person
        const changes = gcr.proposed_changes || {};
        if (changes.primaryNameNepali || changes.primaryNameEnglish) {
          if (changes.primaryNameNepali) {
            const parts = changes.primaryNameNepali.trim().split(/\s+/);
            const firstName = parts[0] || 'अज्ञात';
            const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'अधिकारी';
            await client.query(
              `INSERT INTO person_names (person_id, language, first_name, last_name, full_name, is_primary)
               VALUES ($1, 'ne', $2, $3, $4, TRUE)
               ON CONFLICT (person_id, language) WHERE is_primary = TRUE 
               DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
              [person.id, firstName, lastName, changes.primaryNameNepali],
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
              [person.id, firstName, lastName, changes.primaryNameEnglish],
            );
          }
        }

        await client.query(
          `UPDATE persons 
           SET gender = COALESCE($1, gender),
               living_status = COALESCE($2, living_status),
               branch_id = COALESCE($3, branch_id),
               birth_date_bs = COALESCE($4, birth_date_bs),
               birth_year_bs = COALESCE($5, birth_year_bs),
               death_date_bs = COALESCE($6, death_date_bs),
               death_year_bs = COALESCE($7, death_year_bs),
               version = version + 1,
               updated_at = NOW()
           WHERE id = $8`,
          [
            changes.gender || null,
            changes.livingStatus || null,
            changes.branchId || null,
            changes.birthDateBs || null,
            changes.birthYearBs || null,
            changes.deathDateBs || null,
            changes.deathYearBs || null,
            person.id,
          ],
        );
      } else {
        // Person creation proposal
        const changes = gcr.proposed_changes || {};
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
          await client.query(
            `INSERT INTO person_names (person_id, name_type, full_name, language, is_primary)
             VALUES ($1, 'LEGAL', $2, 'ne', TRUE)`,
            [newPerson.id, changes.primaryNameNepali],
          );
        }
        if (changes.primaryNameEnglish) {
          await client.query(
            `INSERT INTO person_names (person_id, name_type, full_name, language, is_primary)
             VALUES ($1, 'LEGAL', $2, 'en', TRUE)`,
            [newPerson.id, changes.primaryNameEnglish],
          );
        }
      }

      // Mark request approved
      const updatedRes = await client.query<ChangeRequestRecord>(
        `UPDATE genealogy_change_requests 
         SET status = 'APPROVED', review_notes = $1, reviewed_by = $2, reviewed_at = NOW(), version = version + 1, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [dto.reviewNotes, reviewer.id, id],
      );
      const updated = updatedRes.rows[0];

      await client.query(
        `INSERT INTO workflow_state_transitions (entity_type, entity_id, from_state, to_state, actor_user_id, reason_notes)
         VALUES ('CHANGE_REQUEST', $1, $2, 'APPROVED', $3, $4)`,
        [id, gcr.status, reviewer.id, dto.reviewNotes],
      );

      await this.auditOutboxRepo.recordAuditIntent(
        {
          action: 'CHANGE_REQUEST_APPROVED_AND_MERGED',
          entityType: 'CHANGE_REQUEST',
          entityId: id,
          actorId: reviewer.id,
          actorRole: reviewer.roles[0] || 'BRANCH_ADMIN',
          oldValue: { status: gcr.status },
          newValue: { status: 'APPROVED', reviewNotes: dto.reviewNotes },
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
    return this.mapToDetailDto(req);
  }

  async listRequests(
    actor?: AuthenticatedUser,
    options?: { status?: ChangeRequestStatus; branchId?: string },
  ): Promise<ChangeRequestDetailDto[]> {
    let sql = `
      SELECT r.*, p.branch_id as person_branch_id
      FROM genealogy_change_requests r
      LEFT JOIN persons p ON r.target_person_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (options?.status) {
      sql += ` AND r.status = $${pIdx++}`;
      params.push(options.status);
    }

    sql += ' ORDER BY r.created_at DESC';
    const res = await this.db.query<any>(sql, params);

    let rows = res.rows;
    if (actor && !actor.roles.includes(Role.SUPER_ADMIN)) {
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
}
