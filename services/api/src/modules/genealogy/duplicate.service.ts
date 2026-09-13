import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PersonRepository } from '../../database/repositories/person.repository';
import { GenealogyLinkRepository } from '../../database/repositories/genealogy-link.repository';
import { DuplicateRepository } from '../../database/repositories/duplicate.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { PrivacyEngineService, ViewerContext } from './privacy/privacy-engine.service';
import {
  ErrorCode,
  Role,
  DuplicateCandidateStatus,
  DuplicateCandidateDto,
  DuplicateCandidateQueryDto,
  DuplicateCompareDto,
  ResolveDuplicateCandidateDto,
  MergePersonsDto,
  MergeResultDto,
  EvaluatePersonDto,
  PersonSummaryDto,
  PersonDetailDto,
} from '@kashyap/contracts';
import { PoolClient } from 'pg';

@Injectable()
export class DuplicateService {
  private readonly logger = new Logger(DuplicateService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly personRepo: PersonRepository,
    private readonly linkRepo: GenealogyLinkRepository,
    private readonly duplicateRepo: DuplicateRepository,
    private readonly auditOutboxRepo: AuditOutboxRepository,
    private readonly privacyEngine: PrivacyEngineService,
  ) {}

  /**
   * Pre-creation duplicate evaluation before committing a proposed Person (DUP-FR-001)
   */
  async evaluateProposedPerson(
    dto: EvaluatePersonDto,
    viewer?: ViewerContext,
    client?: PoolClient,
  ): Promise<Array<{ person: PersonSummaryDto; score: number; signals: any }>> {
    const primaryName = dto.names.find((n) => n.isPrimary) || dto.names[0];
    if (!primaryName || !primaryName.fullName.trim()) {
      return [];
    }

    const matches = await this.duplicateRepo.findPotentialDuplicateMatches(
      primaryName.fullName,
      dto.branchId,
      dto.birthYearBs,
      undefined,
      client,
    );

    const results = await Promise.all(
      matches.map(async (m) => {
        const person = await this.personRepo.findById(m.person_id);
        if (!person) return null;
        const [names, branchRes] = await Promise.all([
          this.personRepo.findNamesByPersonId(m.person_id),
          person.branch_id
            ? this.db.query('SELECT name_nepali FROM branches WHERE id = $1', [person.branch_id])
            : Promise.resolve({ rows: [] }),
        ]);
        const nameNe = names.find((n) => n.language === 'ne')?.full_name || names[0]?.full_name || 'अज्ञात';
        const nameEn = names.find((n) => n.language === 'en')?.full_name || names[0]?.full_name || 'Unknown';

        const summary: PersonSummaryDto = {
          id: person.id,
          primaryNameNepali: nameNe,
          primaryNameEnglish: nameEn,
          gender: person.gender,
          livingStatus: person.living_status,
          generation: person.generation,
          branchId: person.branch_id || undefined,
          branchName: branchRes.rows[0]?.name_nepali || undefined,
          birthYearBs: person.birth_year_bs,
          deathYearBs: person.death_year_bs,
          isClaimed: person.is_claimed,
          version: person.version,
        };

        return {
          person: this.privacyEngine.filterPersonSummary(summary, viewer),
          score: m.score,
          signals: m.signals,
        };
      }),
    );

    return results.filter((r): r is { person: PersonSummaryDto; score: number; signals: any } => r !== null);
  }

  /**
   * Scans and inserts duplicate candidates for a newly created or updated person record
   */
  async scanAndRecordCandidates(personId: string, client?: PoolClient): Promise<void> {
    const person = await this.personRepo.findById(personId, false, client);
    if (!person) return;

    const names = await this.personRepo.findNamesByPersonId(personId, client);
    for (const name of names) {
      const matches = await this.duplicateRepo.findPotentialDuplicateMatches(
        name.full_name,
        person.branch_id,
        person.birth_year_bs,
        person.id,
        client,
      );

      for (const match of matches) {
        await this.duplicateRepo.createOrUpdateCandidate(
          person.id,
          match.person_id,
          match.score,
          match.signals,
          client,
        );
      }
    }
  }

  /**
   * List duplicate candidate review queue (DUP-FR-003)
   */
  async listCandidates(
    query: DuplicateCandidateQueryDto,
    viewer?: ViewerContext,
  ): Promise<{ items: DuplicateCandidateDto[]; total: number }> {
    const { items, total } = await this.duplicateRepo.listCandidates(query);

    const candidates = await Promise.all(
      items.map(async (rec) => {
        const [personA, personB] = await Promise.all([
          this.loadSummary(rec.person_a_id, viewer),
          this.loadSummary(rec.person_b_id, viewer),
        ]);

        if (!personA || !personB) return null;

        const candidateDto: DuplicateCandidateDto = {
          id: rec.id,
          personAId: rec.person_a_id,
          personBId: rec.person_b_id,
          personA,
          personB,
          confidenceScore: parseFloat(rec.confidence_score.toString()),
          detectionSignals: rec.detection_signals,
          status: rec.status,
          reviewNotes: rec.review_notes,
          reviewedBy: rec.reviewed_by,
          reviewedAt: rec.reviewed_at,
          createdAt: rec.created_at,
        };
        return candidateDto;
      }),
    );

    return {
      items: candidates.filter((c): c is DuplicateCandidateDto => c !== null),
      total,
    };
  }

  /**
   * Side-by-side comparison for duplicate review (ADM-UI-011)
   */
  async comparePersons(
    personAId: string,
    personBId: string,
    candidateId?: string,
    viewer?: ViewerContext,
  ): Promise<DuplicateCompareDto> {
    const [personA, personB] = await Promise.all([
      this.loadDetail(personAId, viewer),
      this.loadDetail(personBId, viewer),
    ]);

    if (!personA || !personB) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'One or both person records not found for comparison',
      });
    }

    let candidateRecord = null;
    if (candidateId) {
      candidateRecord = await this.duplicateRepo.getCandidateById(candidateId);
    }
    if (!candidateRecord) {
      candidateRecord = await this.duplicateRepo.findCandidate(personAId, personBId);
    }

    // Build field difference matrix
    const fieldsToCompare = [
      { key: 'primaryNameNepali', labelNe: 'नेपाली नाम', labelEn: 'Nepali Name' },
      { key: 'primaryNameEnglish', labelNe: 'अंग्रेजी नाम', labelEn: 'English Name' },
      { key: 'gender', labelNe: 'लिंग', labelEn: 'Gender' },
      { key: 'livingStatus', labelNe: 'स्थिति', labelEn: 'Living Status' },
      { key: 'generation', labelNe: 'पुस्ता', labelEn: 'Generation' },
      { key: 'birthYearBs', labelNe: 'जन्म वर्ष (वि.सं.)', labelEn: 'Birth Year (BS)' },
      { key: 'birthDateBs', labelNe: 'जन्म मिति (वि.सं.)', labelEn: 'Birth Date (BS)' },
      { key: 'birthPlace', labelNe: 'जन्मस्थान', labelEn: 'Birth Place' },
      { key: 'deathYearBs', labelNe: 'मृत्यु वर्ष (वि.सं.)', labelEn: 'Death Year (BS)' },
      { key: 'deathPlace', labelNe: 'मृत्युस्थान', labelEn: 'Death Place' },
      { key: 'gotra', labelNe: 'गोत्र', labelEn: 'Gotra' },
      { key: 'moolGhar', labelNe: 'मूल घर', labelEn: 'Mool Ghar' },
      { key: 'currentAddress', labelNe: 'हालको ठेगाना', labelEn: 'Current Address' },
      { key: 'occupation', labelNe: 'पेशा', labelEn: 'Occupation' },
      { key: 'isClaimed', labelNe: 'दाबी गरिएको', labelEn: 'Is Claimed' },
    ];

    const fieldDifferences = fieldsToCompare.map((f) => {
      const valA = (personA as any)[f.key];
      const valB = (personB as any)[f.key];
      const hasConflict = valA !== undefined && valB !== undefined && valA !== null && valB !== null && String(valA) !== String(valB);
      return {
        field: f.key,
        labelNepali: f.labelNe,
        labelEnglish: f.labelEn,
        valueA: valA,
        valueB: valB,
        hasConflict,
      };
    });

    // Relationship overlaps
    const parentsA = personA.parents || [];
    const parentsB = personB.parents || [];
    const sharedParents = parentsA.map((pA) => {
      const match = parentsB.find((pB) => pB.personId === pA.personId);
      return {
        idA: pA.personId,
        idB: match?.personId,
        person: pA.person,
        matched: Boolean(match),
      };
    });

    const spousesA = personA.spouses || [];
    const spousesB = personB.spouses || [];
    const sharedSpouses = spousesA.map((sA) => {
      const match = spousesB.find((sB) => sB.spousePersonId === sA.spousePersonId);
      return {
        idA: sA.spousePersonId,
        idB: match?.spousePersonId,
        person: sA.person,
        matched: Boolean(match),
      };
    });

    const childrenA = personA.children || [];
    const childrenB = personB.children || [];
    const sharedChildren = childrenA.map((cA) => {
      const match = childrenB.find((cB) => cB.personId === cA.personId);
      return {
        idA: cA.personId,
        idB: match?.personId,
        person: cA.person,
        matched: Boolean(match),
      };
    });

    // Dual-branch authorization check for duplicate comparison: must possess authority over BOTH records
    const isSuper = viewer?.roles?.some((r) => r === Role.SUPER_ADMIN || r === Role.CENTRAL_ADMIN);
    if (!isSuper) {
      const allowedA = this.privacyEngine.isAuthorizedAdmin(viewer, personA.branchId);
      const allowedB = this.privacyEngine.isAuthorizedAdmin(viewer, personB.branchId);
      if (!allowedA || !allowedB) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'You must possess administrative authority across both branches for duplicate comparison',
        });
      }
    }

    const rawSignals = candidateRecord?.detection_signals || {
      nameSimilarity: 0.8,
      matchingNames: [personA.primaryNameNepali],
      sameBranch: personA.branchId === personB.branchId,
      sharedParentsCount: sharedParents.filter((p) => p.matched).length,
      reasons: ['Direct comparison requested'],
    };

    const sanitizedSignals = this.privacyEngine.filterDuplicateSignals(rawSignals, viewer);

    return {
      candidateId: candidateRecord?.id,
      personA,
      personB,
      confidenceScore: candidateRecord ? parseFloat(candidateRecord.confidence_score.toString()) : 0.75,
      detectionSignals: sanitizedSignals,
      fieldDifferences,
      sharedRelationships: {
        parents: sharedParents,
        spouses: sharedSpouses,
        children: sharedChildren,
      },
    };
  }

  /**
   * Mark candidate as NOT_A_DUPLICATE or CONFIRMED_DUPLICATE (DUP-FR-004)
   * Enforces dual-branch authority and atomic audit outbox persistence inside transaction.
   */
  async resolveCandidate(
    candidateId: string,
    dto: ResolveDuplicateCandidateDto,
    actor: { id: string; roles: Role[]; branchId?: string; branchIds?: string[]; ipAddress?: string; userAgent?: string },
  ): Promise<DuplicateCandidateDto> {
    const candidate = await this.duplicateRepo.getCandidateById(candidateId);
    if (!candidate) {
      throw new NotFoundException({
        errorCode: ErrorCode.DUPLICATE_CANDIDATE_NOT_FOUND,
        message: 'Duplicate candidate not found',
      });
    }

    const [personA, personB] = await Promise.all([
      this.personRepo.findById(candidate.person_a_id),
      this.personRepo.findById(candidate.person_b_id),
    ]);

    if (!personA || !personB) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'One or both candidate person records not found',
      });
    }

    // Dual-branch authorization check for candidate resolution
    const allowedA = this.privacyEngine.isAuthorizedAdmin(actor, personA.branch_id);
    const allowedB = this.privacyEngine.isAuthorizedAdmin(actor, personB.branch_id);
    if (!allowedA || !allowedB) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: 'Branch Administrators must possess authority across both candidates branches to resolve duplicates',
      });
    }

    return this.db.transaction(async (client: PoolClient) => {
      // Recheck candidate record and branch authorization inside transaction
      const txCandidate = await this.duplicateRepo.getCandidateById(candidateId, client);
      if (!txCandidate) {
        throw new NotFoundException({
          errorCode: ErrorCode.DUPLICATE_CANDIDATE_NOT_FOUND,
          message: 'Duplicate candidate not found',
        });
      }

      const [txPersonA, txPersonB] = await Promise.all([
        this.personRepo.findById(txCandidate.person_a_id, false, client),
        this.personRepo.findById(txCandidate.person_b_id, false, client),
      ]);

      if (!txPersonA || !txPersonB) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'One or both candidate person records not found',
        });
      }

      const allowedTxA = this.privacyEngine.isAuthorizedAdmin(actor, txPersonA.branch_id);
      const allowedTxB = this.privacyEngine.isAuthorizedAdmin(actor, txPersonB.branch_id);
      if (!allowedTxA || !allowedTxB) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch Administrators must possess authority across both candidates branches to resolve duplicates',
        });
      }

      const updated = await this.duplicateRepo.updateCandidateStatus(
        candidateId,
        dto.status,
        dto.notes,
        actor.id,
        client,
      );

      if (!updated) {
        throw new NotFoundException('Failed to update duplicate candidate');
      }

      await this.auditOutboxRepo.recordAuditIntent(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
          ipAddress: actor.ipAddress || '127.0.0.1',
          userAgent: actor.userAgent || 'system',
          action: 'GENEALOGY_RESOLVE_DUPLICATE_CANDIDATE',
          entityType: 'duplicate_candidate',
          entityId: candidateId,
          oldValue: { status: txCandidate.status },
          newValue: { status: dto.status, notes: dto.notes, reviewedBy: actor.id },
        },
        client,
      );

      const [summaryA, summaryB] = await Promise.all([
        this.loadSummary(updated.person_a_id),
        this.loadSummary(updated.person_b_id),
      ]);

      return {
        id: updated.id,
        personAId: updated.person_a_id,
        personBId: updated.person_b_id,
        personA: summaryA!,
        personB: summaryB!,
        confidenceScore: parseFloat(updated.confidence_score.toString()),
        detectionSignals: updated.detection_signals,
        status: updated.status,
        reviewNotes: updated.review_notes,
        reviewedBy: updated.reviewed_by,
        reviewedAt: updated.reviewed_at,
        createdAt: updated.created_at,
      };
    });
  }

  /**
   * Governed Atomic Merge of two Person records (DUP-FR-005..009)
   */
  async mergePersons(
    dto: MergePersonsDto,
    actor: { id: string; roles: Role[]; branchId?: string; branchIds?: string[]; ipAddress?: string; userAgent?: string },
  ): Promise<MergeResultDto> {
    const { survivingPersonId, mergedPersonId, fieldResolutions, justificationReason } = dto;

    if (!justificationReason || !justificationReason.trim()) {
      throw new BadRequestException({
        errorCode: ErrorCode.JUSTIFICATION_REQUIRED,
        message: 'A detailed justification reason is mandatory for genealogy merge operations',
      });
    }

    if (survivingPersonId === mergedPersonId) {
      throw new BadRequestException({
        errorCode: ErrorCode.CANNOT_MERGE_SAME_PERSON,
        message: 'Cannot merge a person into themselves',
      });
    }

    if (dto.survivingPersonVersion === undefined || dto.survivingPersonVersion === null ||
        dto.mergedPersonVersion === undefined || dto.mergedPersonVersion === null) {
      throw new BadRequestException({
        errorCode: ErrorCode.STALE_UPDATE_DETECTED,
        message: 'Both survivingPersonVersion and mergedPersonVersion are required for merge operations',
      });
    }

    // Validate fieldResolutions: reject unsupported resolution fields
    const allowedUpdates = [
      'generation', 'gender', 'living_status', 'birth_year_bs', 'birth_date_bs', 'birth_date_ad', 'birth_place',
      'death_year_bs', 'death_date_bs', 'death_date_ad', 'death_place', 'gotra', 'kuldevata', 'mool_ghar',
      'current_address', 'occupation', 'education', 'biography', 'phone_visibility', 'address_visibility', 'dob_visibility',
    ];
    if (fieldResolutions) {
      for (const k of Object.keys(fieldResolutions)) {
        if (!allowedUpdates.includes(k)) {
          throw new BadRequestException({
            errorCode: ErrorCode.MERGE_CONFLICT_UNRESOLVED,
            message: `Unsupported field resolution: '${k}' is not a permitted merge resolution attribute`,
          });
        }
      }
    }

    // Permission check: Super Admin or Branch Admin with authority over both records
    const isSuperAdmin = actor.roles.includes(Role.SUPER_ADMIN) || actor.roles.includes(Role.CENTRAL_ADMIN);

    return this.db.transaction(async (client: PoolClient) => {
      // 1. Acquire transaction graph mutation lock
      await this.linkRepo.acquireGraphMutationLock(client);

      // 2. Lock both records in deterministic ID order to prevent deadlocks
      const [firstId, secondId] = [survivingPersonId, mergedPersonId].sort();
      const lockRes = await client.query(
        'SELECT * FROM persons WHERE id IN ($1, $2) ORDER BY id FOR UPDATE',
        [firstId, secondId],
      );

      if (lockRes.rows.length < 2) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'One or both person records to merge could not be found',
        });
      }

      const survivingRecord = lockRes.rows.find((r) => r.id === survivingPersonId);
      const mergedRecord = lockRes.rows.find((r) => r.id === mergedPersonId);

      if (!survivingRecord || !mergedRecord) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'One or both person records not found',
        });
      }

      if (survivingRecord.is_archived || mergedRecord.is_archived) {
        throw new BadRequestException({
          errorCode: ErrorCode.CANNOT_MODIFY_PROCESSED_REQUEST,
          message: 'Cannot merge already archived or previously merged person records',
        });
      }

      // Dual-branch authorization check
      const allowedA = this.privacyEngine.isAuthorizedAdmin(actor, survivingRecord.branch_id);
      const allowedB = this.privacyEngine.isAuthorizedAdmin(actor, mergedRecord.branch_id);
      if (!allowedA || !allowedB) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch Administrators can only merge records within their assigned branch scope',
        });
      }

      // 3. Stale-write / Optimistic concurrency protection
      if (survivingRecord.version !== dto.survivingPersonVersion) {
        throw new BadRequestException({
          errorCode: ErrorCode.STALE_UPDATE_DETECTED,
          message: `Surviving person record was modified (expected version ${dto.survivingPersonVersion}, current ${survivingRecord.version})`,
        });
      }
      if (mergedRecord.version !== dto.mergedPersonVersion) {
        throw new BadRequestException({
          errorCode: ErrorCode.STALE_UPDATE_DETECTED,
          message: `Merged person record was modified (expected version ${dto.mergedPersonVersion}, current ${mergedRecord.version})`,
        });
      }

      // Material conflict check: if both records have conflicting non-null fields and no resolution is provided
      const materialConflictFields = [
        'generation', 'gender', 'living_status', 'birth_year_bs', 'birth_place',
        'death_year_bs', 'death_place', 'gotra', 'mool_ghar'
      ];
      for (const field of materialConflictFields) {
        const valA = survivingRecord[field];
        const valB = mergedRecord[field];
        if (valA !== null && valA !== undefined && valB !== null && valB !== undefined && String(valA) !== String(valB)) {
          if (!fieldResolutions || fieldResolutions[field] === undefined) {
            throw new BadRequestException({
              errorCode: ErrorCode.MERGE_CONFLICT_UNRESOLVED,
              message: `Unresolved material field conflict on '${field}'. Explicit field resolution is required.`,
            });
          }
        }
      }

      // 4. Check Claim Invariants (DUP-FR-005 / DUP_5005) & validate actual user_accounts ownership under transaction
      const userAccountsRes = await client.query(
        'SELECT id, person_id FROM user_accounts WHERE person_id IN ($1, $2)',
        [survivingPersonId, mergedPersonId],
      );
      const userSurviving = userAccountsRes.rows.find((u) => u.person_id === survivingPersonId);
      const userMerged = userAccountsRes.rows.find((u) => u.person_id === mergedPersonId);
      if (userSurviving && userMerged && userSurviving.id !== userMerged.id) {
        throw new BadRequestException({
          errorCode: ErrorCode.CANNOT_MERGE_CLAIMED_PERSONS,
          message: 'Cannot merge two persons claimed by distinct user accounts (DUP_5005)',
        });
      }
      if (survivingRecord.is_claimed && mergedRecord.is_claimed) {
        if (survivingRecord.claimed_user_id && mergedRecord.claimed_user_id && survivingRecord.claimed_user_id !== mergedRecord.claimed_user_id) {
          throw new BadRequestException({
            errorCode: ErrorCode.CANNOT_MERGE_CLAIMED_PERSONS,
            message: 'Cannot merge two persons claimed by two distinct user accounts (DUP_5005)',
          });
        }
      }

      // 5. Pre-merge snapshots for immutable audit record
      const [namesA, namesB] = await Promise.all([
        this.personRepo.findNamesByPersonId(survivingPersonId, client),
        this.personRepo.findNamesByPersonId(mergedPersonId, client),
      ]);

      const auditSnapshot = {
        action: 'DUPLICATE_MERGE',
        justificationReason,
        survivingPersonBefore: { ...survivingRecord, names: namesA },
        mergedPersonBefore: { ...mergedRecord, names: namesB },
        fieldResolutions: fieldResolutions || {},
        mergedAt: new Date().toISOString(),
      };

      // 6. Apply field resolutions to surviving person
      const resolvedFields: Record<string, any> = {};
      if (fieldResolutions) {
        for (const [k, v] of Object.entries(fieldResolutions)) {
          if (allowedUpdates.includes(k) && v !== undefined) {
            resolvedFields[k] = v;
          }
        }
      }

      // If merged was claimed and surviving was not, transfer claim
      if (!survivingRecord.is_claimed && mergedRecord.is_claimed) {
        resolvedFields.is_claimed = true;
        resolvedFields.claimed_user_id = mergedRecord.claimed_user_id;
      }

      // Update surviving record
      await this.personRepo.updatePerson(survivingPersonId, resolvedFields, undefined, survivingRecord.version, client);

      // Transfer account linkage in user_accounts table
      await client.query('UPDATE user_accounts SET person_id = $1 WHERE person_id = $2', [survivingPersonId, mergedPersonId]);

      // 7. Migrate relationships (parents, children, spouses)
      const linkMigration = await this.linkRepo.migrateLinksForMerge(mergedPersonId, survivingPersonId, client);

      // 8. Re-verify graph acyclicity
      const survivingParents = await this.linkRepo.getParentsByChildId(survivingPersonId, client);
      for (const sp of survivingParents) {
        const isCycle = await this.linkRepo.checkWouldCreateCycle(sp.parent_id, survivingPersonId, client);
        if (isCycle) {
          throw new BadRequestException({
            errorCode: ErrorCode.DUPLICATE_MERGE_CYCLE,
            message: 'Merge operation aborted: resulting graph contains an ancestry cycle (DUP_5003)',
          });
        }
      }

      // 9. Preserve merged person names as non-primary aliases on surviving person (migration 005)
      for (const name of namesB) {
        const existsExact = namesA.some((nA) => nA.language === name.language && nA.full_name === name.full_name);
        if (!existsExact) {
          await client.query(
            `INSERT INTO person_names (person_id, language, first_name, middle_name, last_name, full_name, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
            [survivingPersonId, name.language, name.first_name, name.middle_name || null, name.last_name, name.full_name],
          );
        }
      }

      // 10. Transfer profile claims and change requests
      const claimsRes = await client.query(
        'UPDATE profile_claims SET target_person_id = $1 WHERE target_person_id = $2 RETURNING id',
        [survivingPersonId, mergedPersonId],
      );
      const reqsRes = await client.query(
        'UPDATE genealogy_change_requests SET target_person_id = $1 WHERE target_person_id = $2 RETURNING id',
        [survivingPersonId, mergedPersonId],
      );

      // 11. Soft-archive merged person record with canonical reference (GEN-FR-017, DUP-FR-008)
      await this.personRepo.archivePerson(mergedPersonId, `MERGED_INTO:${survivingPersonId}`, client);

      // Flatten existing canonical redirect chains pointing to mergedPersonId
      await client.query(
        "UPDATE persons SET archive_reason = $1 WHERE archive_reason = $2",
        [`MERGED_INTO:${survivingPersonId}`, `MERGED_INTO:${mergedPersonId}`],
      );

      // 12. Record merge entry in duplicate_merges table
      await this.duplicateRepo.recordMerge(
        survivingPersonId,
        mergedPersonId,
        auditSnapshot,
        actor.id,
        client,
      );

      // 13. Update candidate queue status to MERGED
      await this.duplicateRepo.markCandidatesAsMerged(mergedPersonId, client);

      // 14. Record durable audit outbox intent in same transaction
      await this.auditOutboxRepo.recordAuditIntent(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] || Role.SUPER_ADMIN,
          ipAddress: actor.ipAddress || '127.0.0.1',
          userAgent: actor.userAgent || 'system',
          action: 'GENEALOGY_MERGE_DUPLICATE',
          entityType: 'person',
          entityId: survivingPersonId,
          oldValue: { mergedPersonId, version: mergedRecord.version },
          newValue: { survivingPersonId, auditSnapshot },
        },
        client,
      );

      return {
        canonicalPersonId: survivingPersonId,
        mergedPersonId,
        migratedParentLinksCount: linkMigration.parentsMigrated,
        migratedChildLinksCount: linkMigration.childrenMigrated,
        migratedSpouseLinksCount: linkMigration.spousesMigrated,
        migratedClaimsCount: claimsRes.rowCount || 0,
        migratedRequestsCount: reqsRes.rowCount || 0,
        executedAt: new Date().toISOString(),
      };
    });
  }

  private async loadSummary(personId: string, viewer?: ViewerContext): Promise<PersonSummaryDto | null> {
    const person = await this.personRepo.findById(personId, true);
    if (!person) return null;
    const [names, branchRes] = await Promise.all([
      this.personRepo.findNamesByPersonId(personId),
      person.branch_id
        ? this.db.query('SELECT name_nepali FROM branches WHERE id = $1', [person.branch_id])
        : Promise.resolve({ rows: [] }),
    ]);
    const nameNe = names.find((n) => n.language === 'ne')?.full_name || names[0]?.full_name || 'अज्ञात';
    const nameEn = names.find((n) => n.language === 'en')?.full_name || names[0]?.full_name || 'Unknown';

    const summary: PersonSummaryDto = {
      id: person.id,
      primaryNameNepali: nameNe,
      primaryNameEnglish: nameEn,
      gender: person.gender,
      livingStatus: person.living_status,
      generation: person.generation,
      branchId: person.branch_id || undefined,
      branchName: branchRes.rows[0]?.name_nepali || undefined,
      birthYearBs: person.birth_year_bs,
      deathYearBs: person.death_year_bs,
      isClaimed: person.is_claimed,
      isArchived: person.is_archived,
      version: person.version,
    };

    return this.privacyEngine.filterPersonSummary(summary, viewer);
  }

  private async loadDetail(personId: string, viewer?: ViewerContext): Promise<PersonDetailDto | null> {
    const person = await this.personRepo.findById(personId, true);
    if (!person) return null;

    const [names, parentLinks, childLinks, spouseLinks, branchRes] = await Promise.all([
      this.personRepo.findNamesByPersonId(personId),
      this.linkRepo.getParentsByChildId(personId),
      this.linkRepo.getChildrenByParentId(personId),
      this.linkRepo.getSpousesByPersonId(personId),
      person.branch_id
        ? this.db.query('SELECT name_nepali FROM branches WHERE id = $1', [person.branch_id])
        : Promise.resolve({ rows: [] }),
    ]);

    const nameNe = names.find((n) => n.language === 'ne' && n.is_primary)?.full_name || names[0]?.full_name || 'अज्ञात';
    const nameEn = names.find((n) => n.language === 'en' && n.is_primary)?.full_name || names[0]?.full_name || 'Unknown';

    const parents = await Promise.all(
      parentLinks.map(async (pl) => ({
        id: pl.id,
        personId: pl.parent_id,
        parentType: pl.parent_type,
        person: (await this.loadSummary(pl.parent_id, viewer))!,
      })),
    );

    const children = await Promise.all(
      childLinks.map(async (cl) => ({
        id: cl.id,
        personId: cl.child_id,
        parentType: cl.parent_type,
        person: (await this.loadSummary(cl.child_id, viewer))!,
      })),
    );

    const spouses = await Promise.all(
      spouseLinks.map(async (sl) => ({
        id: sl.id,
        spousePersonId: sl.spouse_id,
        status: sl.status,
        marriageDateBs: sl.marriage_date_bs,
        person: (await this.loadSummary(sl.spouse_id, viewer))!,
      })),
    );

    const detail: PersonDetailDto = {
      id: person.id,
      primaryNameNepali: nameNe,
      primaryNameEnglish: nameEn,
      gender: person.gender,
      livingStatus: person.living_status,
      generation: person.generation,
      branchId: person.branch_id || undefined,
      branchName: branchRes.rows[0]?.name_nepali || undefined,
      birthYearBs: person.birth_year_bs,
      birthDateBs: person.birth_date_bs,
      birthDateAd: person.birth_date_ad,
      birthPlace: person.birth_place,
      deathYearBs: person.death_year_bs,
      deathDateBs: person.death_date_bs,
      deathDateAd: person.death_date_ad,
      deathPlace: person.death_place,
      gotra: person.gotra,
      kuldevata: person.kuldevata,
      moolGhar: person.mool_ghar,
      currentAddress: person.current_address,
      occupation: person.occupation,
      education: person.education,
      biography: person.biography,
      isClaimed: person.is_claimed,
      claimedByUserId: person.claimed_user_id,
      isArchived: person.is_archived,
      version: person.version,
      isMinorProtected: person.is_minor_protected,
      names: names.map((n) => ({
        language: n.language,
        firstName: n.first_name,
        middleName: n.middle_name,
        lastName: n.last_name,
        fullName: n.full_name,
        isPrimary: n.is_primary,
      })),
      privacy: {
        phoneVisibility: person.phone_visibility,
        addressVisibility: person.address_visibility,
        dobVisibility: person.dob_visibility,
      },
      parents: parents.filter((p) => p.person !== null),
      spouses: spouses.filter((s) => s.person !== null),
      children: children.filter((c) => c.person !== null),
    };

    return this.privacyEngine.filterPersonDetail(detail, viewer);
  }
}
