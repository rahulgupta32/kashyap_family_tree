import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PersonSummaryDto, PersonDetailDto, TreeNodeDto, TreeQueryDto, CreatePersonDto, Gender, LivingStatus, ErrorCode, PrivacyVisibility } from '@kashyap/contracts';
import { mockPersons, mockBranches } from '@kashyap/test-fixtures';

@Injectable()
export class GenealogyService {
  private persons = new Map<string, any>();
  private parentLinks = new Map<string, Set<string>>(); // parentId -> Set of childIds
  private childLinks = new Map<string, Set<string>>(); // childId -> Set of parentIds

  constructor() {
    // Seed in-memory structures from test fixtures
    mockPersons.forEach((p) => this.persons.set(p.id, { ...p }));

    // Link Generation 1 -> Generation 2
    this.addParentChildLink('p-101', 'p-201');
    this.addParentChildLink('p-101', 'p-202');

    // Link Generation 2 -> Generation 3
    this.addParentChildLink('p-201', 'p-301');
    this.addParentChildLink('p-201', 'p-302');

    // Link Generation 3 -> Generation 4
    this.addParentChildLink('p-301', 'p-401');
    this.addParentChildLink('p-301', 'p-402');
  }

  private addParentChildLink(parentId: string, childId: string) {
    if (!this.parentLinks.has(parentId)) this.parentLinks.set(parentId, new Set());
    this.parentLinks.get(parentId)!.add(childId);

    if (!this.childLinks.has(childId)) this.childLinks.set(childId, new Set());
    this.childLinks.get(childId)!.add(parentId);
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
        parentType: 'BIOLOGICAL' as any,
        person: this.persons.get(pId) || ({} as any),
      })),
      spouses: [],
      children: childIds.map((cId) => ({
        id: `link_${id}_${cId}`,
        personId: cId,
        parentType: 'BIOLOGICAL' as any,
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
