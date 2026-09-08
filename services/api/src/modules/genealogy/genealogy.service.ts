import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

@Injectable()
export class GenealogyService {
  private persons = new Map<string, any>();
  private parentLinks = new Map<string, Set<string>>(); // parentId -> Set of childIds
  private childLinks = new Map<string, Set<string>>(); // childId -> Set of parentIds
  private spouseLinks = new Map<string, Set<{ spouseId: string; status: SpouseStatus }>>();

  constructor() {
    this.resetToFixtures();
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

  async addParentLink(parentId: string, childId: string): Promise<void> {
    if (parentId === childId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_LINK_PROHIBITED,
        message: 'A person cannot be linked as their own parent',
      });
    }

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

    // Directed Graph Cycle Detection: check if parentId is an existing descendant of childId
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

  async deLinkUserAccount(personId: string): Promise<void> {
    const person = this.persons.get(personId);
    if (!person) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: 'Person not found',
      });
    }
    // De-linking user account preserves permanent genealogy Person record
    person.isClaimed = false;
    person.claimedByUserId = undefined;
  }

  async getPersonById(id: string): Promise<PersonDetailDto> {
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

  async getTree(query: TreeQueryDto): Promise<TreeNodeDto> {
    const root = this.persons.get(query.rootPersonId);
    if (!root) {
      throw new NotFoundException({
        errorCode: ErrorCode.PERSON_NOT_FOUND,
        message: `Root person with ID ${query.rootPersonId} not found`,
      });
    }

    if ((query.descendantGenerations || 2) > 25) {
      throw new BadRequestException({
        errorCode: ErrorCode.MAX_TREE_DEPTH_EXCEEDED,
        message: 'Requested tree depth exceeds safe rendering limits',
      });
    }

    return this.buildSubtree(query.rootPersonId, query.descendantGenerations || 2);
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
    return mockBranches;
  }
}
