import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
  Gender,
  LivingStatus,
  ErrorCode,
  PrivacyVisibility,
  ParentType,
  SpouseStatus,
} from '@kashyap/contracts';
import { mockPersons, mockBranches } from '@kashyap/test-fixtures';
import { PersonRepository, PersonRecord, PersonNameRecord } from '../../database/repositories/person.repository';
import { GenealogyLinkRepository } from '../../database/repositories/genealogy-link.repository';
import { DatabaseService } from '../../database/database.service';

export const GENEALOGY_TEST_FIXTURE_MODE = 'GENEALOGY_TEST_FIXTURE_MODE';

@Injectable()
export class GenealogyService {
  private readonly logger = new Logger(GenealogyService.name);

  // In-memory structures for isolated unit test configuration only (when explicit test fixtures mode is enabled)
  private persons = new Map<string, any>();
  private parentLinks = new Map<string, Set<string>>();
  private childLinks = new Map<string, Set<string>>();
  private spouseLinks = new Map<string, Set<{ spouseId: string; status: SpouseStatus }>>();
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
    const instance = new GenealogyService(undefined, undefined, undefined, true);
    return instance;
  }

  constructor(
    @Optional() private readonly personRepo?: PersonRepository,
    @Optional() private readonly linkRepo?: GenealogyLinkRepository,
    @Optional() private readonly db?: DatabaseService,
    @Optional() @Inject(GENEALOGY_TEST_FIXTURE_MODE) explicitTestFixtureMode?: boolean,
  ) {
    if (explicitTestFixtureMode === true) {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(
          `FATAL SECURITY CONFIGURATION: Test fixture mode is strictly prohibited when NODE_ENV is not 'test'. ` +
          `Current NODE_ENV='${process.env.NODE_ENV}'. Direct constructor opt-in rejected.`,
        );
      }
      // Explicit test-only fixture mode — only reachable in NODE_ENV='test'
      this.isTestFixtureMode = true;
      this.resetToFixtures();
      this.logger.warn('GenealogyService initialized in EXPLICIT TEST FIXTURE mode.');
      return;
    }

    // Normal runtime: all dependencies are required regardless of environment
    if (!this.personRepo || !this.linkRepo || !this.db) {
      throw new Error(
        'FATAL CONFIGURATION: GenealogyService requires PersonRepository, GenealogyLinkRepository, and DatabaseService. ' +
        'Missing runtime dependencies must be resolved. For unit tests, use GenealogyService.createWithTestFixtures().',
      );
    }
  }

  private checkDatabaseReady(): void {
    if (this.isTestFixtureMode) return;
    if (!this.personRepo || !this.linkRepo || !this.db) {
      throw new Error('GenealogyService dependencies are missing. Database repositories are required.');
    }
    if (!this.db.isReady()) {
      throw new Error('Database is not connected or ready. Automatic in-memory fallback is disabled.');
    }
  }

  private get isDatabaseAvailable(): boolean {
    return !this.isTestFixtureMode;
  }

  public resetToFixtures() {
    this.persons.clear();
    this.parentLinks.clear();
    this.childLinks.clear();
    this.spouseLinks.clear();

    // Seed in-memory structures from test fixtures
    mockPersons.forEach((p) => this.persons.set(p.id, { ...p }));

    // Link Generation 1 -> Generation 2
    this.addParentChildLinkInternal('p-101', 'p-201');
    this.addParentChildLinkInternal('p-101', 'p-202');

    // Link Generation 2 -> Generation 3
    this.addParentChildLinkInternal('p-201', 'p-301');
    this.addParentChildLinkInternal('p-201', 'p-302');

    // Link Generation 3 -> Generation 4
    this.addParentChildLinkInternal('p-301', 'p-401');
    this.addParentChildLinkInternal('p-301', 'p-402');
  }

  private addParentChildLinkInternal(parentId: string, childId: string) {
    if (!this.parentLinks.has(parentId)) this.parentLinks.set(parentId, new Set());
    this.parentLinks.get(parentId)!.add(childId);

    if (!this.childLinks.has(childId)) this.childLinks.set(childId, new Set());
    this.childLinks.get(childId)!.add(parentId);
  }

  async addParentLink(parentId: string, childId: string, parentType: ParentType = ParentType.BIOLOGICAL): Promise<void> {
    if (parentId === childId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        message: 'A person cannot be linked as their own parent',
      });
    }

    if (this.isDatabaseAvailable) {
      const [parent, child] = await Promise.all([
        this.personRepo!.findById(parentId),
        this.personRepo!.findById(childId),
      ]);

      if (!parent || !child) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'Parent or Child person record not found',
        });
      }

      const existingParents = await this.linkRepo!.getParentsByChildId(childId);
      if (existingParents.some((p) => p.parent_id === parentId)) {
        throw new BadRequestException({
          errorCode: ErrorCode.DUPLICATE_PARENT_LINK,
          message: 'Parent link already exists',
        });
      }

      // Check for directed ancestry loop (cycle)
      const wouldCycle = await this.linkRepo!.checkWouldCreateCycle(parentId, childId);
      if (wouldCycle) {
        throw new BadRequestException({
          errorCode: ErrorCode.CYCLE_DETECTED,
          message: 'Cannot link parent: this would create an impossible ancestry loop (cycle)',
        });
      }

      await this.linkRepo!.addParentLink(parentId, childId, parentType);
      return;
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

  async addSpouseLink(personId: string, spouseId: string, status: SpouseStatus = SpouseStatus.CURRENT): Promise<void> {
    if (personId === spouseId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        message: 'A person cannot be linked as their own spouse',
      });
    }

    if (this.isDatabaseAvailable) {
      const [p1, p2] = await Promise.all([
        this.personRepo!.findById(personId),
        this.personRepo!.findById(spouseId),
      ]);

      if (!p1 || !p2) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: 'Person record not found',
        });
      }

      await this.linkRepo!.addSpouseLink(personId, spouseId, status);
      return;
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

    this.spouseLinks.get(personId)!.add({ spouseId, status });
    this.spouseLinks.get(spouseId)!.add({ spouseId: personId, status });
  }

  async createPerson(dto: CreatePersonDto): Promise<PersonDetailDto> {
    if (this.isDatabaseAvailable) {
      if (!dto.branchId) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: 'Branch identifier (branchId) is required for creating a person record',
        });
      }

      const branchRes = await this.db!.query('SELECT id FROM branches WHERE id = $1', [dto.branchId]);
      if (branchRes.rows.length === 0) {
        throw new BadRequestException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch with ID ${dto.branchId} does not exist`,
        });
      }

      const created = await this.personRepo!.createPerson(
        {
          branch_id: dto.branchId,
          generation: dto.generation,
          gender: dto.gender,
          living_status: dto.livingStatus,
          birth_year_bs: dto.birthYearBs,
          birth_date_bs: dto.birthDateBs,
          birth_place: dto.birthPlace,
          death_year_bs: dto.deathYearBs,
          death_date_bs: dto.deathDateBs,
        },
        dto.names.map((n) => ({
          language: n.language,
          first_name: n.firstName,
          middle_name: n.middleName,
          last_name: n.lastName,
          full_name: n.fullName,
          is_primary: n.isPrimary,
        })),
      );

      if (dto.parentPersonIds && dto.parentPersonIds.length > 0) {
        for (const p of dto.parentPersonIds) {
          await this.addParentLink(p.personId, created.id, p.parentType);
        }
      }

      if (dto.spousePersonIds && dto.spousePersonIds.length > 0) {
        for (const s of dto.spousePersonIds) {
          await this.addSpouseLink(created.id, s.personId, s.status);
        }
      }

      return this.getPersonById(created.id);
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
      branchName: 'कास्की शाखा',
      birthYearBs: dto.birthYearBs,
      birthDateBs: dto.birthDateBs,
      birthPlace: dto.birthPlace,
      names: dto.names,
      isClaimed: false,
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

    // In-memory fallback
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

  async getPersonById(id: string): Promise<PersonDetailDto> {
    if (this.isDatabaseAvailable) {
      const person = await this.personRepo!.findById(id);
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Person with ID ${id} not found`,
        });
      }

      const [names, parentLinks, childLinks, spouseLinks, branchRes] = await Promise.all([
        this.personRepo!.findNamesByPersonId(id),
        this.linkRepo!.getParentsByChildId(id),
        this.linkRepo!.getChildrenByParentId(id),
        this.linkRepo!.getSpousesByPersonId(id),
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

      const branchName = branchRes.rows[0]?.name_nepali || 'कास्की शाखा';

      // Load related person summaries
      const parentSummaries = await Promise.all(
        parentLinks.map(async (pl) => {
          const p = await this.getPersonSummary(pl.parent_id);
          return {
            id: `link_${pl.parent_id}_${id}`,
            personId: pl.parent_id,
            parentType: pl.parent_type,
            person: p,
          };
        }),
      );

      const childSummaries = await Promise.all(
        childLinks.map(async (cl) => {
          const c = await this.getPersonSummary(cl.child_id);
          return {
            id: `link_${id}_${cl.child_id}`,
            personId: cl.child_id,
            parentType: cl.parent_type,
            person: c,
          };
        }),
      );

      const spouseSummaries = await Promise.all(
        spouseLinks.map(async (sl) => {
          const s = await this.getPersonSummary(sl.spouse_id);
          return {
            id: `spouse_${id}_${sl.spouse_id}`,
            spousePersonId: sl.spouse_id,
            status: sl.status,
            marriageDateBs: sl.marriage_date_bs,
            person: s,
          };
        }),
      );

      return {
        id: person.id,
        primaryNameNepali: primaryNameNe,
        primaryNameEnglish: primaryNameEn,
        gender: person.gender,
        livingStatus: person.living_status,
        generation: person.generation,
        branchId: person.branch_id || 'b-001',
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
        parents: parentSummaries,
        spouses: spouseSummaries,
        children: childSummaries,
      };
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
      names: [
        {
          language: 'ne',
          firstName: person.primaryNameNepali.split(' ')[0] || '',
          lastName: 'अधिकारी',
          fullName: person.primaryNameNepali,
          isPrimary: true,
        },
        {
          language: 'en',
          firstName: person.primaryNameEnglish.split(' ')[0] || '',
          lastName: 'Adhikari',
          fullName: person.primaryNameEnglish,
          isPrimary: false,
        },
      ],
      gotra: 'कश्यप',
      kuldevata: 'विन्ध्यवासिनी',
      privacy: {
        phoneVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
        addressVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
        dobVisibility: PrivacyVisibility.VERIFIED_COMMUNITY,
      },
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

  private async getPersonSummary(id: string): Promise<PersonSummaryDto> {
    if (this.isDatabaseAvailable) {
      const p = await this.personRepo!.findById(id);
      if (!p) {
        return {
          id,
          primaryNameNepali: 'अज्ञात',
          primaryNameEnglish: 'Unknown',
          gender: Gender.UNKNOWN,
          livingStatus: LivingStatus.LIVING,
          generation: 1,
          branchId: 'b-001',
          branchName: 'कास्की शाखा',
          isClaimed: false,
        };
      }
      const names = await this.personRepo!.findNamesByPersonId(id);
      const ne = names.find((n) => n.language === 'ne')?.full_name || 'अज्ञात';
      const en = names.find((n) => n.language === 'en')?.full_name || 'Unknown';
      return {
        id: p.id,
        primaryNameNepali: ne,
        primaryNameEnglish: en,
        gender: p.gender,
        livingStatus: p.living_status,
        generation: p.generation,
        branchId: p.branch_id || 'b-001',
        branchName: 'कास्की शाखा',
        birthYearBs: p.birth_year_bs,
        deathYearBs: p.death_year_bs,
        isClaimed: p.is_claimed,
        claimedByUserId: p.claimed_user_id,
      };
    }

    const mem = this.persons.get(id);
    return mem || ({} as any);
  }

  async getTree(query: TreeQueryDto): Promise<TreeNodeDto> {
    if ((query.descendantGenerations || 2) > 25) {
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

      return this.buildSubtreeFromDb(query.rootPersonId, query.descendantGenerations || 2);
    }

    // In-memory fallback
    const root = this.persons.get(query.rootPersonId);
    if (!root) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: `Root person with ID ${query.rootPersonId} not found`,
      });
    }

    return this.buildSubtree(query.rootPersonId, query.descendantGenerations || 2);
  }

  private async buildSubtreeFromDb(personId: string, depthRemaining: number): Promise<TreeNodeDto> {
    const p = await this.personRepo!.findById(personId);
    if (!p) throw new NotFoundException(`Person ${personId} not found`);

    const [names, childLinks, parentLinks] = await Promise.all([
      this.personRepo!.findNamesByPersonId(personId),
      this.linkRepo!.getChildrenByParentId(personId),
      this.linkRepo!.getParentsByChildId(personId),
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

    return {
      id: p.id,
      nameNepali: nameNe,
      nameEnglish: nameEn,
      gender: p.gender,
      generation: p.generation,
      livingStatus: p.living_status,
      isClaimed: p.is_claimed,
      avatarUrl: undefined,
      spouses: [],
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
      this.checkDatabaseReady();
      const res = await this.db!.query(
        'SELECT id, name_nepali, name_english, code, mool_ghar, kuldevata FROM branches ORDER BY name_nepali',
      );
      // Empty database results must remain empty; never fall back to mock fixtures
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
}
