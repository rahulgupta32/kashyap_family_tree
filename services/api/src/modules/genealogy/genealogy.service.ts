import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import {
  PersonSummaryDto,
  PersonDetailDto,
  TreeNodeDto,
  TreeQueryDto,
  CreatePersonDto,
  AdminCreatePersonDto,
  AdminUpdatePersonDto,
  AdminArchivePersonDto,
  Gender,
  LivingStatus,
  ErrorCode,
  PrivacyVisibility,
  ParentType,
  SpouseStatus,
  Role,
  GenealogyExportQueryDto,
  GenealogyExportDto,
  EvaluatePersonDto,
} from '@kashyap/contracts';
import { mockPersons, mockBranches } from '@kashyap/test-fixtures';
import { PersonRepository } from '../../database/repositories/person.repository';
import { GenealogyLinkRepository } from '../../database/repositories/genealogy-link.repository';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { DatabaseService } from '../../database/database.service';
import { PrivacyEngineService, ViewerContext } from './privacy/privacy-engine.service';
import { DuplicateService } from './duplicate.service';
import { PoolClient } from 'pg';

export const GENEALOGY_TEST_FIXTURE_MODE = 'GENEALOGY_TEST_FIXTURE_MODE';

export interface ActorContext {
  id: string;
  roles: Role[];
  branchId?: string;
  branchIds?: string[];
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class GenealogyService {
  private readonly logger = new Logger(GenealogyService.name);

  // In-memory structures for isolated unit test configuration only (when explicit test fixtures mode is enabled)
  private persons = new Map<string, any>();
  private parentLinks = new Map<string, Set<string>>();
  private childLinks = new Map<string, Set<string>>();
  private spouseLinks = new Map<string, Set<{ spouseId: string; status: SpouseStatus; marriageDateBs?: string }>>();
  private isTestFixtureMode = false;

  /**
   * Create an instance with explicit test fixture mode.
   * This is the ONLY supported way to use in-memory fixtures.
   * Strictly restricted to NODE_ENV='test'.
   * Use this in unit tests instead of `new GenealogyService()`.
   */
  static createWithTestFixtures(): GenealogyService {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        `FATAL SECURITY CONFIGURATION: Test fixture mode is strictly prohibited when NODE_ENV is not 'test'. ` +
        `Current NODE_ENV='${process.env.NODE_ENV}'. Fixture creation rejected.`,
      );
    }
    const instance = new GenealogyService(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
    return instance;
  }

  constructor(
    @Optional() private readonly personRepo?: PersonRepository,
    @Optional() private readonly linkRepo?: GenealogyLinkRepository,
    @Optional() private readonly db?: DatabaseService,
    @Optional() private readonly auditOutboxRepo?: AuditOutboxRepository,
    @Optional() private readonly privacyEngine?: PrivacyEngineService,
    @Optional() private readonly duplicateService?: DuplicateService,
    @Optional() @Inject(GENEALOGY_TEST_FIXTURE_MODE) explicitTestFixtureMode?: boolean,
  ) {
    // Support legacy unit test constructor signature where 4th argument was boolean
    const isFixtureMode =
      explicitTestFixtureMode === true || (auditOutboxRepo as any) === true;

    if (isFixtureMode) {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(
          `FATAL SECURITY CONFIGURATION: Test fixture mode is strictly prohibited when NODE_ENV is not 'test'. ` +
          `Current NODE_ENV='${process.env.NODE_ENV}'. Direct constructor opt-in rejected.`,
        );
      }
      this.isTestFixtureMode = true;
      this.resetToFixtures();
      this.logger.warn('GenealogyService initialized in EXPLICIT TEST FIXTURE mode.');
      return;
    }

    if (!this.personRepo || !this.linkRepo || !this.db || !this.auditOutboxRepo || !this.privacyEngine || !this.duplicateService) {
      throw new Error(
        'FATAL CONFIGURATION: GenealogyService requires PersonRepository, GenealogyLinkRepository, DatabaseService, AuditOutboxRepository, PrivacyEngineService, and DuplicateService. ' +
        'Missing runtime dependencies must be resolved. For unit tests, use GenealogyService.createWithTestFixtures().',
      );
    }
  }

  private get isDatabaseAvailable(): boolean {
    return !this.isTestFixtureMode;
  }

  private checkBranchAuthority(actor?: ActorContext, branchId?: string): void {
    if (!actor) return;
    if (actor.roles.includes(Role.SUPER_ADMIN) || actor.roles.includes(Role.CENTRAL_ADMIN)) {
      return; // Global access
    }
    if (actor.roles.includes(Role.BRANCH_ADMIN) || actor.roles.includes(Role.BRANCH_VERIFIER)) {
      const actorBranches = actor.branchIds || (actor.branchId ? [actor.branchId] : []);
      if (branchId && !actorBranches.includes(branchId)) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch administrator cannot mutate records outside their assigned branch',
        });
      }
    }
  }

  private checkDualBranchAuthority(actor?: ActorContext, branchA?: string, branchB?: string): void {
    if (!actor) return;
    if (actor.roles.includes(Role.SUPER_ADMIN) || actor.roles.includes(Role.CENTRAL_ADMIN)) {
      return;
    }
    const actorBranches = actor.branchIds || (actor.branchId ? [actor.branchId] : []);
    if (branchA && !actorBranches.includes(branchA)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: `Branch administrator cannot link records outside their assigned branch (${branchA})`,
      });
    }
    if (branchB && !actorBranches.includes(branchB)) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: `Branch administrator cannot link records outside their assigned branch (${branchB})`,
      });
    }
  }

  public resetToFixtures() {
    this.persons.clear();
    this.parentLinks.clear();
    this.childLinks.clear();
    this.spouseLinks.clear();

    mockPersons.forEach((p) => this.persons.set(p.id, { ...p, version: 1 }));

    this.addParentChildLinkInternal('p-101', 'p-201');
    this.addParentChildLinkInternal('p-101', 'p-202');
    this.addParentChildLinkInternal('p-201', 'p-301');
    this.addParentChildLinkInternal('p-201', 'p-302');
    this.addParentChildLinkInternal('p-301', 'p-401');
    this.addParentChildLinkInternal('p-301', 'p-402');
  }

  private addParentChildLinkInternal(parentId: string, childId: string) {
    if (!this.parentLinks.has(parentId)) this.parentLinks.set(parentId, new Set());
    this.parentLinks.get(parentId)!.add(childId);

    if (!this.childLinks.has(childId)) this.childLinks.set(childId, new Set());
    this.childLinks.get(childId)!.add(parentId);
  }

  async addParentLink(
    parentId: string,
    childId: string,
    parentType: ParentType = ParentType.BIOLOGICAL,
    actor?: ActorContext,
  ): Promise<void> {
    if (parentId === childId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        message: 'A person cannot be linked as their own parent',
      });
    }

    if (this.isDatabaseAvailable) {
      return this.db!.transaction(async (client: PoolClient) => {
        // 1. Acquire transaction graph lock to ensure deterministic serialization
        await this.linkRepo!.acquireGraphMutationLock(client);

        const [parent, child] = await Promise.all([
          this.personRepo!.findById(parentId, false, client),
          this.personRepo!.findById(childId, false, client),
        ]);

        if (!parent || !child) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: 'Parent or Child person record not found',
          });
        }

        // Dual-branch check for both persons
        if (actor) {
          this.checkDualBranchAuthority(actor, parent.branch_id, child.branch_id);
        }

        const existingParents = await this.linkRepo!.getParentsByChildId(childId, client);
        if (existingParents.some((p) => p.parent_id === parentId)) {
          throw new BadRequestException({
            errorCode: ErrorCode.DUPLICATE_PARENT_LINK,
            message: 'Parent link already exists',
          });
        }

        // Check for directed ancestry loop (cycle)
        const wouldCycle = await this.linkRepo!.checkWouldCreateCycle(parentId, childId, client);
        if (wouldCycle) {
          throw new BadRequestException({
            errorCode: ErrorCode.CYCLE_DETECTED,
            message: 'Cannot link parent: this would create an impossible ancestry loop (cycle)',
          });
        }

        await this.linkRepo!.addParentLink(parentId, childId, parentType, client);

        if (this.auditOutboxRepo && actor) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_ADD_PARENT_LINK',
              entityType: 'parent_link',
              entityId: `${parentId}_${childId}`,
              oldValue: null,
              newValue: { parentId, childId, parentType },
            },
            client,
          );
        }
      });
    }

    // In-memory fallback
    if (!this.persons.has(parentId) || !this.persons.has(childId)) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'Parent or Child person record not found',
      });
    }

    if (this.parentLinks.get(parentId)?.has(childId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.DUPLICATE_PARENT_LINK,
        message: 'Parent link already exists',
      });
    }

    if (this.isDescendantOf(parentId, childId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.CYCLE_DETECTED,
        message: 'Cannot link parent: this would create an impossible ancestry loop (cycle)',
      });
    }

    this.addParentChildLinkInternal(parentId, childId);
  }

  async removeParentLink(parentId: string, childId: string, actor?: ActorContext): Promise<void> {
    if (this.isDatabaseAvailable) {
      return this.db!.transaction(async (client: PoolClient) => {
        await this.linkRepo!.acquireGraphMutationLock(client);
        const [parent, child] = await Promise.all([
          this.personRepo!.findById(parentId, false, client),
          this.personRepo!.findById(childId, false, client),
        ]);

        if (parent && child && actor) {
          this.checkDualBranchAuthority(actor, parent.branch_id, child.branch_id);
        }

        const removed = await this.linkRepo!.removeParentLink(parentId, childId, client);
        if (!removed) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: 'Parent link not found to remove',
          });
        }

        if (this.auditOutboxRepo && actor) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_REMOVE_PARENT_LINK',
              entityType: 'parent_link',
              entityId: `${parentId}_${childId}`,
              oldValue: { parentId, childId },
              newValue: null,
            },
            client,
          );
        }
      });
    }

    this.parentLinks.get(parentId)?.delete(childId);
    this.childLinks.get(childId)?.delete(parentId);
  }

  public isDescendantOf(candidateDescendantId: string, ancestorId: string): boolean {
    const visited = new Set<string>();
    const queue = [ancestorId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === candidateDescendantId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const children = this.parentLinks.get(current);
      if (children) {
        for (const child of children) {
          if (!visited.has(child)) queue.push(child);
        }
      }
    }
    return false;
  }

  async addSpouseLink(
    personId: string,
    spouseId: string,
    status: SpouseStatus = SpouseStatus.CURRENT,
    marriageDateBs?: string,
    actor?: ActorContext,
  ): Promise<void> {
    if (personId === spouseId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        message: 'A person cannot be linked as their own spouse',
      });
    }

    if (this.isDatabaseAvailable) {
      return this.db!.transaction(async (client: PoolClient) => {
        await this.linkRepo!.acquireGraphMutationLock(client);

        const [p1, p2] = await Promise.all([
          this.personRepo!.findById(personId, false, client),
          this.personRepo!.findById(spouseId, false, client),
        ]);

        if (!p1 || !p2) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: 'Person record not found',
          });
        }

        if (actor) {
          this.checkDualBranchAuthority(actor, p1.branch_id, p2.branch_id);
        }

        await this.linkRepo!.addSpouseLink(personId, spouseId, status, marriageDateBs, client);

        if (this.auditOutboxRepo && actor) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_ADD_SPOUSE_LINK',
              entityType: 'spouse_link',
              entityId: `${personId}_${spouseId}`,
              oldValue: null,
              newValue: { personId, spouseId, status, marriageDateBs },
            },
            client,
          );
        }
      });
    }

    // In-memory fallback
    if (!this.persons.has(personId) || !this.persons.has(spouseId)) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'Person record not found',
      });
    }

    if (!this.spouseLinks.has(personId)) this.spouseLinks.set(personId, new Set());
    if (!this.spouseLinks.has(spouseId)) this.spouseLinks.set(spouseId, new Set());

    this.spouseLinks.get(personId)!.add({ spouseId, status, marriageDateBs });
    this.spouseLinks.get(spouseId)!.add({ spouseId: personId, status, marriageDateBs });
  }

  async removeSpouseLink(personId: string, spouseId: string, actor?: ActorContext): Promise<void> {
    if (this.isDatabaseAvailable) {
      return this.db!.transaction(async (client: PoolClient) => {
        await this.linkRepo!.acquireGraphMutationLock(client);

        const [p1, p2] = await Promise.all([
          this.personRepo!.findById(personId, false, client),
          this.personRepo!.findById(spouseId, false, client),
        ]);

        if (p1 && p2 && actor) {
          this.checkDualBranchAuthority(actor, p1.branch_id, p2.branch_id);
        }

        const removed = await this.linkRepo!.removeSpouseLink(personId, spouseId, client);
        if (!removed) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: 'Spouse link not found to remove',
          });
        }

        if (this.auditOutboxRepo && actor) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_REMOVE_SPOUSE_LINK',
              entityType: 'spouse_link',
              entityId: `${personId}_${spouseId}`,
              oldValue: { personId, spouseId },
              newValue: null,
            },
            client,
          );
        }
      });
    }

    const set1 = this.spouseLinks.get(personId);
    if (set1) {
      for (const item of set1) {
        if (item.spouseId === spouseId) set1.delete(item);
      }
    }
    const set2 = this.spouseLinks.get(spouseId);
    if (set2) {
      for (const item of set2) {
        if (item.spouseId === personId) set2.delete(item);
      }
    }
  }

  async createPerson(dto: CreatePersonDto | AdminCreatePersonDto, actor?: ActorContext): Promise<PersonDetailDto> {
    // 1. Mandatory Justification Validation (non-empty, non-boilerplate)
    const justification = (dto as AdminCreatePersonDto).justificationReason?.trim();
    if (!justification || justification.length < 5 || /^(test|none|n\/a|asdf|created)$/i.test(justification)) {
      throw new BadRequestException({
        errorCode: ErrorCode.JUSTIFICATION_REQUIRED,
        message: 'A meaningful administrative justification reason is mandatory (minimum 5 characters, non-boilerplate)',
      });
    }

    if (this.isDatabaseAvailable) {
      if (!dto.branchId) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch identifier (branchId) is required for creating a person record',
        });
      }

      if (actor) {
        this.checkBranchAuthority(actor, dto.branchId);
      }

      const branchRes = await this.db!.query('SELECT id FROM branches WHERE id = $1', [dto.branchId]);
      if (branchRes.rows.length === 0) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch with ID ${dto.branchId} does not exist`,
        });
      }

      // 2. Pre-creation Duplicate Candidate Evaluation (DUP-FR-001)
      const primaryName = dto.names?.find((n) => n.isPrimary) || dto.names?.[0];
      if (primaryName && primaryName.fullName.trim() && this.duplicateService) {
        const matches = await this.duplicateService.evaluateProposedPerson(
          {
            names: dto.names,
            branchId: dto.branchId,
            birthYearBs: dto.birthYearBs,
          },
          actor ? { userId: actor.id, roles: actor.roles, branchId: actor.branchId, branchIds: actor.branchIds } : undefined,
        );

        const strongMatches = matches.filter((m) => m.score >= 0.70);
        if (strongMatches.length > 0 && !(dto as AdminCreatePersonDto).allowDuplicateOverride) {
          throw new BadRequestException({
            errorCode: ErrorCode.DUPLICATE_CANDIDATE_DETECTED,
            message: 'Potential duplicate candidate detected. Please review candidates or supply explicit override justification.',
            details: { candidateMatches: strongMatches },
          });
        }
      }

      const createdId = await this.db!.transaction(async (client: PoolClient) => {
        const created = await this.personRepo!.createPerson(
          {
            branch_id: dto.branchId,
            generation: dto.generation,
            gender: dto.gender,
            living_status: dto.livingStatus,
            birth_year_bs: dto.birthYearBs,
            birth_date_bs: dto.birthDateBs,
            birth_date_ad: dto.birthDateAd,
            birth_place: dto.birthPlace,
            death_year_bs: dto.deathYearBs,
            death_date_bs: dto.deathDateBs,
            death_date_ad: dto.deathDateAd,
            death_place: dto.deathPlace,
            gotra: dto.gotra || 'कश्यप',
            kuldevata: dto.kuldevata,
            mool_ghar: dto.moolGhar,
            current_address: dto.currentAddress,
            occupation: dto.occupation,
            education: dto.education,
            biography: dto.biography,
            phone_visibility: dto.phoneVisibility || PrivacyVisibility.VERIFIED_COMMUNITY,
            address_visibility: dto.addressVisibility || PrivacyVisibility.VERIFIED_COMMUNITY,
            dob_visibility: dto.dobVisibility || PrivacyVisibility.VERIFIED_COMMUNITY,
            is_minor_protected: dto.isMinorProtected ?? false,
          },
          dto.names.map((n) => ({
            language: n.language,
            first_name: n.firstName,
            middle_name: n.middleName,
            last_name: n.lastName,
            full_name: n.fullName,
            is_primary: n.isPrimary,
          })),
          client,
        );

        // Add parent links if provided
        if (dto.parentPersonIds && dto.parentPersonIds.length > 0) {
          for (const p of dto.parentPersonIds) {
            await this.linkRepo!.acquireGraphMutationLock(client);
            const wouldCycle = await this.linkRepo!.checkWouldCreateCycle(p.personId, created.id, client);
            if (wouldCycle) {
              throw new BadRequestException({
                errorCode: ErrorCode.CYCLE_DETECTED,
                message: 'Cannot link parent: creates cycle',
              });
            }
            await this.linkRepo!.addParentLink(p.personId, created.id, p.parentType, client);
          }
        }

        // Add spouse links if provided
        if (dto.spousePersonIds && dto.spousePersonIds.length > 0) {
          for (const s of dto.spousePersonIds) {
            await this.linkRepo!.acquireGraphMutationLock(client);
            await this.linkRepo!.addSpouseLink(created.id, s.personId, s.status, s.marriageDateBs, client);
          }
        }

        // Audit outbox recording
        if (this.auditOutboxRepo && actor) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_CREATE_PERSON',
              entityType: 'person',
              entityId: created.id,
              oldValue: null,
              newValue: {
                id: created.id,
                names: dto.names,
                branchId: dto.branchId,
                generation: dto.generation,
                justificationReason: justification,
              },
            },
            client,
          );
        }

        return created.id;
      });

      return (await this.getPersonById(createdId))!;
    }

    // In-memory fallback
    const id = `p_${Date.now()}`;
    const primaryName = dto.names.find((n) => n.isPrimary) || dto.names[0];
    const newPerson: any = {
      id,
      primaryNameNepali: primaryName?.fullName || 'नयाँ व्यक्ति',
      primaryNameEnglish: primaryName?.fullName || 'New Person',
      gender: dto.gender,
      livingStatus: dto.livingStatus,
      generation: dto.generation,
      branchId: dto.branchId,
      branchName: undefined,
      birthYearBs: dto.birthYearBs,
      birthDateBs: dto.birthDateBs,
      birthPlace: dto.birthPlace,
      names: dto.names,
      isClaimed: false,
      version: 1,
      privacy: {
        phoneVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
        addressVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
        dobVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
      },
      parents: [],
      children: [],
      spouses: [],
    };
    this.persons.set(id, newPerson);
    return newPerson;
  }

  async deLinkUserAccount(personId: string): Promise<void> {
    if (this.isDatabaseAvailable) {
      const person = await this.personRepo!.findById(personId);
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'Person not found',
        });
      }
      await this.personRepo!.updateClaimStatus(personId, false, undefined);
      return;
    }

    const person = this.persons.get(personId);
    if (!person) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'Person not found',
      });
    }
    person.isClaimed = false;
    person.claimedByUserId = undefined;
  }

  async updatePerson(id: string, dto: AdminUpdatePersonDto, actor: ActorContext): Promise<PersonDetailDto> {
    if (!dto.justificationReason || !dto.justificationReason.trim()) {
      throw new BadRequestException({
        errorCode: ErrorCode.JUSTIFICATION_REQUIRED,
        message: 'A detailed justification reason is mandatory for administrative person updates (GEN-FR-016)',
      });
    }

    if (this.isDatabaseAvailable) {
      const updatedId = await this.db!.transaction(async (client: PoolClient) => {
        const existing = await this.personRepo!.findById(id, false, client);
        if (!existing) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: `Person with ID ${id} not found`,
          });
        }

        this.checkBranchAuthority(actor, existing.branch_id);

        const updated = await this.personRepo!.updatePerson(
          id,
          {
            branch_id: dto.branchId,
            generation: dto.generation,
            gender: dto.gender,
            living_status: dto.livingStatus,
            birth_year_bs: dto.birthYearBs,
            birth_date_bs: dto.birthDateBs,
            birth_date_ad: dto.birthDateAd,
            birth_place: dto.birthPlace,
            death_year_bs: dto.deathYearBs,
            death_date_bs: dto.deathDateBs,
            death_date_ad: dto.deathDateAd,
            death_place: dto.deathPlace,
            gotra: dto.gotra,
            kuldevata: dto.kuldevata,
            mool_ghar: dto.moolGhar,
            current_address: dto.currentAddress,
            occupation: dto.occupation,
            education: dto.education,
            biography: dto.biography,
            phone_visibility: dto.phoneVisibility,
            address_visibility: dto.addressVisibility,
            dob_visibility: dto.dobVisibility,
            is_minor_protected: dto.isMinorProtected,
          },
          dto.names ? dto.names.map((n) => ({
            language: n.language,
            first_name: n.firstName,
            middle_name: n.middleName,
            last_name: n.lastName,
            full_name: n.fullName,
            is_primary: n.isPrimary,
          })) : undefined,
          dto.version,
          client,
        );

        if (!updated) {
          throw new BadRequestException({
            errorCode: ErrorCode.STALE_UPDATE_DETECTED,
            message: `Conflict: Person record was updated by another process (expected version ${dto.version}, current ${existing.version})`,
          });
        }

        if (this.auditOutboxRepo) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.BRANCH_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_UPDATE_PERSON',
              entityType: 'person',
              entityId: id,
              oldValue: { version: existing.version, ...existing },
              newValue: { version: updated.version, justificationReason: dto.justificationReason, ...dto },
            },
            client,
          );
        }

        return id;
      });

      return (await this.getPersonById(updatedId))!;
    }

    // In-memory fallback
    const mem = this.persons.get(id);
    if (!mem) throw new NotFoundException('Person not found');
    if (dto.version !== undefined && mem.version !== dto.version) {
      throw new BadRequestException({
        errorCode: ErrorCode.STALE_UPDATE_DETECTED,
        message: 'Conflict: Stale update detected',
      });
    }
    Object.assign(mem, dto, { version: (mem.version || 1) + 1 });
    return mem;
  }

  async archivePerson(id: string, dto: AdminArchivePersonDto, actor: ActorContext): Promise<void> {
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException({
        errorCode: ErrorCode.JUSTIFICATION_REQUIRED,
        message: 'A reason is mandatory for archiving a person record (GEN-FR-017)',
      });
    }

    if (this.isDatabaseAvailable) {
      return this.db!.transaction(async (client: PoolClient) => {
        const existing = await this.personRepo!.findById(id, false, client);
        if (!existing) {
          throw new NotFoundException({
            errorCode: ErrorCode.PERSON_NOT_FOUND,
            message: `Person with ID ${id} not found`,
          });
        }

        this.checkBranchAuthority(actor, existing.branch_id);

        await this.personRepo!.archivePerson(id, dto.reason, client);

        if (this.auditOutboxRepo) {
          await this.auditOutboxRepo.recordAuditIntent(
            {
              actorId: actor.id,
              actorRole: actor.roles[0] || Role.SUPER_ADMIN,
              ipAddress: actor.ipAddress || '127.0.0.1',
              userAgent: actor.userAgent || 'system',
              action: 'GENEALOGY_ARCHIVE_PERSON',
              entityType: 'person',
              entityId: id,
              oldValue: { is_archived: false },
              newValue: { is_archived: true, archive_reason: dto.reason },
            },
            client,
          );
        }
      });
    }

    const mem = this.persons.get(id);
    if (mem) mem.isArchived = true;
  }

  async getPersonById(id: string, viewer?: ViewerContext): Promise<PersonDetailDto> {
    if (this.isDatabaseAvailable) {
      const canonicalRes = await this.personRepo!.resolveCanonicalPerson(id);
      const person = canonicalRes.person;
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Person with ID ${id} not found`,
        });
      }

      const activeId = person.id;

      const [names, parentLinks, childLinks, spouseLinks, branchRes] = await Promise.all([
        this.personRepo!.findNamesByPersonId(activeId),
        this.linkRepo!.getParentsByChildId(activeId),
        this.linkRepo!.getChildrenByParentId(activeId),
        this.linkRepo!.getSpousesByPersonId(activeId),
        person.branch_id
          ? this.db!.query('SELECT name_nepali, name_english FROM branches WHERE id = $1', [person.branch_id])
          : Promise.resolve({ rows: [] }),
      ]);

      const primaryNameNe = names.find((n) => n.language === 'ne' && n.is_primary)?.full_name
        || names.find((n) => n.language === 'ne')?.full_name
        || names[0]?.full_name
        || 'अज्ञात';

      const primaryNameEn = names.find((n) => n.language === 'en' && n.is_primary)?.full_name
        || names.find((n) => n.language === 'en')?.full_name
        || names[0]?.full_name
        || 'Unknown';

      const branchName = branchRes.rows[0]?.name_nepali || undefined;

      const parentSummaries = await Promise.all(
        parentLinks.map(async (pl) => ({
          id: pl.id,
          personId: pl.parent_id,
          parentType: pl.parent_type,
          person: (await this.getPersonSummary(pl.parent_id, viewer))!,
        })),
      );

      const childSummaries = await Promise.all(
        childLinks.map(async (cl) => ({
          id: cl.id,
          personId: cl.child_id,
          parentType: cl.parent_type,
          person: (await this.getPersonSummary(cl.child_id, viewer))!,
        })),
      );

      const spouseSummaries = await Promise.all(
        spouseLinks.map(async (sl) => ({
          id: sl.id,
          spousePersonId: sl.spouse_id,
          status: sl.status,
          marriageDateBs: sl.marriage_date_bs,
          person: (await this.getPersonSummary(sl.spouse_id, viewer))!,
        })),
      );

      const detail: PersonDetailDto = {
        id: person.id,
        primaryNameNepali: primaryNameNe,
        primaryNameEnglish: primaryNameEn,
        gender: person.gender,
        livingStatus: person.living_status,
        generation: person.generation,
        branchId: person.branch_id || undefined,
        branchName,
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
        version: person.version || 1,
        isMinorProtected: person.is_minor_protected,
        canonicalPersonId: canonicalRes.wasRedirected ? canonicalRes.canonicalId : undefined,
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
        parents: parentSummaries.filter((p) => p.person !== null),
        spouses: spouseSummaries.filter((s) => s.person !== null),
        children: childSummaries.filter((c) => c.person !== null),
      };

      if (this.privacyEngine) {
        return this.privacyEngine.filterPersonDetail(detail, viewer);
      }
      return detail;
    }

    // In-memory fallback
    const person = this.persons.get(id);
    if (!person) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: `Person with ID ${id} not found`,
      });
    }

    const parentIds = Array.from(this.childLinks.get(id) || []);
    const childIds = Array.from(this.parentLinks.get(id) || []);
    const spouses = Array.from(this.spouseLinks.get(id) || []);

    return {
      ...person,
      names: person.names || [
        { language: 'ne', firstName: 'राम', lastName: 'अधिकारी', fullName: person.primaryNameNepali, isPrimary: true },
      ],
      parents: parentIds.map((pId) => ({
        id: `link_${pId}_${id}`,
        personId: pId,
        parentType: ParentType.BIOLOGICAL,
        person: this.persons.get(pId) || ({} as any),
      })),
      spouses: spouses.map((s) => ({
        id: `spouse_${id}_${s.spouseId}`,
        spousePersonId: s.spouseId,
        status: s.status,
        person: this.persons.get(s.spouseId) || ({} as any),
      })),
      children: childIds.map((cId) => ({
        id: `link_${id}_${cId}`,
        personId: cId,
        parentType: ParentType.BIOLOGICAL,
        person: this.persons.get(cId) || ({} as any),
      })),
    };
  }

  private async getPersonSummary(id: string, viewer?: ViewerContext): Promise<PersonSummaryDto | null> {
    if (this.isDatabaseAvailable) {
      const p = await this.personRepo!.findById(id, true);
      if (!p) return null;
      const [names, branchRes] = await Promise.all([
        this.personRepo!.findNamesByPersonId(id),
        p.branch_id
          ? this.db!.query('SELECT name_nepali FROM branches WHERE id = $1', [p.branch_id])
          : Promise.resolve({ rows: [] }),
      ]);
      const ne = names.find((n) => n.language === 'ne' && n.is_primary)?.full_name
        || names.find((n) => n.language === 'ne')?.full_name
        || names[0]?.full_name
        || 'अज्ञात';
      const en = names.find((n) => n.language === 'en' && n.is_primary)?.full_name
        || names.find((n) => n.language === 'en')?.full_name
        || names[0]?.full_name
        || 'Unknown';

      const summary: PersonSummaryDto = {
        id: p.id,
        primaryNameNepali: ne,
        primaryNameEnglish: en,
        gender: p.gender,
        livingStatus: p.living_status,
        generation: p.generation,
        branchId: p.branch_id || undefined,
        branchName: branchRes.rows[0]?.name_nepali || undefined,
        birthYearBs: p.birth_year_bs,
        deathYearBs: p.death_year_bs,
        isClaimed: p.is_claimed,
        claimedByUserId: p.claimed_user_id,
        isArchived: p.is_archived,
        version: p.version || 1,
        isMinorProtected: p.is_minor_protected,
      };

      if (this.privacyEngine) {
        return this.privacyEngine.filterPersonSummary(summary, viewer);
      }
      return summary;
    }

    const mem = this.persons.get(id);
    return mem || null;
  }

  async getTree(query: TreeQueryDto, viewer?: ViewerContext): Promise<TreeNodeDto> {
    const descDepth = query.descendantGenerations !== undefined ? query.descendantGenerations : 2;
    const ascDepth = query.ancestorGenerations !== undefined ? query.ancestorGenerations : 2;

    if (descDepth > 25 || ascDepth > 25) {
      throw new BadRequestException({
        errorCode: ErrorCode.MAX_TREE_DEPTH_EXCEEDED,
        message: 'Requested tree depth exceeds safe rendering limits',
      });
    }

    if (this.isDatabaseAvailable) {
      const root = await this.personRepo!.findById(query.rootPersonId);
      if (!root) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Root person with ID ${query.rootPersonId} not found`,
        });
      }

      const rawTree = await this.buildSubtreeFromDb(query.rootPersonId, descDepth);
      if (this.privacyEngine) {
        return this.privacyEngine.filterTreeNode(rawTree, viewer);
      }
      return rawTree;
    }

    // In-memory fallback
    const root = this.persons.get(query.rootPersonId);
    if (!root) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: `Root person with ID ${query.rootPersonId} not found`,
      });
    }

    return this.buildSubtree(query.rootPersonId, descDepth);
  }

  private async buildSubtreeFromDb(personId: string, depthRemaining: number): Promise<TreeNodeDto> {
    const p = await this.personRepo!.findById(personId);
    if (!p) throw new NotFoundException(`Person ${personId} not found`);

    const [names, childLinks, parentLinks, spouseLinks] = await Promise.all([
      this.personRepo!.findNamesByPersonId(personId),
      this.linkRepo!.getChildrenByParentId(personId),
      this.linkRepo!.getParentsByChildId(personId),
      this.linkRepo!.getSpousesByPersonId(personId),
    ]);

    const nameNe = names.find((n) => n.language === 'ne')?.full_name || 'अज्ञात';
    const nameEn = names.find((n) => n.language === 'en')?.full_name || 'Unknown';

    const childNodes: TreeNodeDto[] = [];
    if (depthRemaining > 0) {
      for (const cl of childLinks) {
        const childNode = await this.buildSubtreeFromDb(cl.child_id, depthRemaining - 1);
        childNodes.push(childNode);
      }
    }

    const spouseNodes: TreeNodeDto[] = [];
    if (depthRemaining > 0) {
      for (const sl of spouseLinks) {
        const sp = await this.personRepo!.findById(sl.spouse_id);
        if (sp) {
          const spNames = await this.personRepo!.findNamesByPersonId(sl.spouse_id);
          spouseNodes.push({
            id: sp.id,
            nameNepali: spNames.find((n) => n.language === 'ne')?.full_name || 'अज्ञात',
            nameEnglish: spNames.find((n) => n.language === 'en')?.full_name || 'Unknown',
            gender: sp.gender,
            generation: sp.generation,
            livingStatus: sp.living_status,
            isClaimed: sp.is_claimed,
            spouses: [],
            children: [],
            hasMoreAncestors: false,
            hasMoreDescendants: false,
          });
        }
      }
    }

    return {
      id: p.id,
      nameNepali: nameNe,
      nameEnglish: nameEn,
      gender: p.gender,
      generation: p.generation,
      livingStatus: p.living_status,
      isClaimed: p.is_claimed,
      avatarUrl: undefined,
      spouses: spouseNodes,
      children: childNodes,
      hasMoreAncestors: parentLinks.length > 0,
      hasMoreDescendants: childLinks.length > 0 && depthRemaining === 0,
    };
  }

  private buildSubtree(personId: string, depthRemaining: number): TreeNodeDto {
    const p = this.persons.get(personId);
    const childIds = Array.from(this.parentLinks.get(personId) || []);

    return {
      id: p.id,
      nameNepali: p.primaryNameNepali,
      nameEnglish: p.primaryNameEnglish,
      gender: p.gender,
      generation: p.generation,
      livingStatus: p.livingStatus,
      isClaimed: p.isClaimed,
      avatarUrl: p.avatarUrl,
      spouses: [],
      children: depthRemaining > 0 ? childIds.map((cId) => this.buildSubtree(cId, depthRemaining - 1)) : [],
      hasMoreAncestors: (this.childLinks.get(personId)?.size || 0) > 0,
      hasMoreDescendants: childIds.length > 0 && depthRemaining === 0,
    };
  }

  async listBranches() {
    if (this.isDatabaseAvailable) {
      const res = await this.db!.query(
        'SELECT id, name_nepali, name_english, code, mool_ghar, kuldevata FROM branches ORDER BY name_nepali',
      );
      return res.rows.map((r) => ({
        id: r.id,
        nameNepali: r.name_nepali,
        nameEnglish: r.name_english,
        code: r.code,
        moolGhar: r.mool_ghar,
        kuldevata: r.kuldevata,
      }));
    }

    return mockBranches;
  }

  /**
   * Authorized, privacy-filtered genealogy data export (GEN-FR-018, PRIV-FR-007)
   */
  async exportGenealogy(query: GenealogyExportQueryDto, actor: ActorContext): Promise<GenealogyExportDto> {
    if (!actor.roles.some((r) => [Role.SUPER_ADMIN, Role.CENTRAL_ADMIN, Role.BRANCH_ADMIN].includes(r))) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Only authorized administrators may export genealogy data (GEN-FR-018)',
      });
    }

    const isSuperAdmin = actor.roles.includes(Role.SUPER_ADMIN) || actor.roles.includes(Role.CENTRAL_ADMIN);
    const actorBranches = actor.branchIds || (actor.branchId ? [actor.branchId] : []);

    let targetBranchId: string | undefined = undefined;

    if (isSuperAdmin) {
      targetBranchId = query.branchId;
    } else {
      if (query.branchId && !actorBranches.includes(query.branchId)) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch administrators can only export genealogy data for their assigned branch',
        });
      }
      targetBranchId = query.branchId || actorBranches[0];
      if (!targetBranchId) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch administrator has no assigned branch for export',
        });
      }
    }

    const conditions = ['p.is_archived = FALSE'];
    const params: any[] = [];
    let paramIdx = 1;

    if (targetBranchId) {
      params.push(targetBranchId);
      conditions.push(`p.branch_id = $${paramIdx++}`);
    }

    if (query.generationStart) {
      params.push(query.generationStart);
      conditions.push(`p.generation >= $${paramIdx++}`);
    }

    if (query.generationEnd) {
      params.push(query.generationEnd);
      conditions.push(`p.generation <= $${paramIdx++}`);
    }

    const personsRes = await this.db!.query(
      `SELECT p.*, n.full_name as primary_name_nepali, en.full_name as primary_name_english, b.name_nepali as branch_name
       FROM persons p
       JOIN person_names n ON p.id = n.person_id AND n.language = 'ne' AND n.is_primary = TRUE
       LEFT JOIN person_names en ON p.id = en.person_id AND en.language = 'en' AND en.is_primary = TRUE
       LEFT JOIN branches b ON p.branch_id = b.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.generation ASC, p.id ASC`,
      params,
    );

    const viewerContext: ViewerContext = {
      userId: actor.id,
      roles: actor.roles,
      branchId: targetBranchId,
      branchIds: actorBranches,
      isVerifiedMember: true,
    };

    const sanitizedPersons = personsRes.rows.map((r: any) => {
      const summary: PersonSummaryDto = {
        id: r.id,
        primaryNameNepali: r.primary_name_nepali,
        primaryNameEnglish: r.primary_name_english || r.primary_name_nepali,
        gender: r.gender,
        livingStatus: r.living_status,
        generation: r.generation,
        branchId: r.branch_id || undefined,
        branchName: r.branch_name || undefined,
        birthYearBs: r.birth_year_bs,
        deathYearBs: r.death_year_bs,
        isClaimed: r.is_claimed,
        version: r.version,
      };
      return this.privacyEngine ? this.privacyEngine.filterPersonSummary(summary, viewerContext) : summary;
    });

    const personIds = personsRes.rows.map((r: any) => r.id);
    let parentLinks: any[] = [];
    let spouseLinks: any[] = [];

    if (personIds.length > 0) {
      const pLinksRes = await this.db!.query(
        'SELECT parent_id, child_id, parent_type FROM parent_links WHERE parent_id = ANY($1) OR child_id = ANY($1)',
        [personIds],
      );
      parentLinks = pLinksRes.rows;

      const sLinksRes = await this.db!.query(
        'SELECT person_id, spouse_id, status, marriage_date_bs FROM spouse_links WHERE person_id = ANY($1)',
        [personIds],
      );
      spouseLinks = sLinksRes.rows;
    }

    if (this.auditOutboxRepo) {
      await this.auditOutboxRepo.recordAuditIntent({
        actorId: actor.id,
        actorRole: actor.roles[0],
        ipAddress: actor.ipAddress || '127.0.0.1',
        userAgent: actor.userAgent || 'system',
        action: 'GENEALOGY_EXPORT',
        entityType: 'export',
        entityId: targetBranchId || 'global',
        oldValue: null,
        newValue: { totalRecords: sanitizedPersons.length, format: query.format || 'json' },
      });
    }

    return {
      exportedAt: new Date().toISOString(),
      exportedBy: actor.id,
      viewerRole: actor.roles[0],
      branchId: targetBranchId,
      totalRecords: sanitizedPersons.length,
      persons: sanitizedPersons,
      parentLinks,
      spouseLinks,
    };
  }
}
