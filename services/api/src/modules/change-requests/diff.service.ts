import { Injectable } from '@nestjs/common';
import { ChangeRequestType, ProposedRelationshipDto, VisualDiffDto, VisualDiffFieldDto } from '@kashyap/contracts';

const FIELD_METADATA: Record<string, { labelNe: string; labelEn: string }> = {
  primaryNameNepali: { labelNe: 'नेपाली नाम', labelEn: 'Nepali Name' },
  primaryNameEnglish: { labelNe: 'अंग्रेजी नाम', labelEn: 'English Name' },
  gender: { labelNe: 'लिङ्ग', labelEn: 'Gender' },
  livingStatus: { labelNe: 'स्थिति', labelEn: 'Living Status' },
  branchId: { labelNe: 'शाखा', labelEn: 'Branch' },
  birthDateBs: { labelNe: 'जन्म मिति (वि.सं.)', labelEn: 'Birth Date (BS)' },
  birthYearBs: { labelNe: 'जन्म वर्ष (वि.सं.)', labelEn: 'Birth Year (BS)' },
  deathDateBs: { labelNe: 'मृत्यु मिति (वि.सं.)', labelEn: 'Death Date (BS)' },
  deathYearBs: { labelNe: 'मृत्यु वर्ष (वि.सं.)', labelEn: 'Death Year (BS)' },
  occupation: { labelNe: 'पेशा', labelEn: 'Occupation' },
  education: { labelNe: 'शिक्षा', labelEn: 'Education' },
  currentAddress: { labelNe: 'हालको ठेगाना', labelEn: 'Current Address' },
  biography: { labelNe: 'जीवनी', labelEn: 'Biography' },
  parentIds: { labelNe: 'अभिभावकहरू', labelEn: 'Parents' },
  spouseIds: { labelNe: 'दाम्पत्य सम्बन्ध', labelEn: 'Spouses' },
};

@Injectable()
export class DiffService {
  computeVisualDiff(
    currentPerson: any | null,
    proposedChanges: Record<string, any>,
    reviewType?: ChangeRequestType,
  ): VisualDiffDto {
    const fields: VisualDiffFieldDto[] = [];

    for (const [key, newVal] of Object.entries(proposedChanges)) {
      const oldVal = currentPerson ? currentPerson[key] ?? null : null;
      if (oldVal !== newVal) {
        const meta = FIELD_METADATA[key] || { labelNe: key, labelEn: key };
        let changeType: 'MODIFIED' | 'ADDED' | 'REMOVED' = 'MODIFIED';
        if (oldVal === null || oldVal === undefined) {
          changeType = 'ADDED';
        } else if (newVal === null || newVal === undefined) {
          changeType = 'REMOVED';
        }

        fields.push({
          field: key,
          fieldLabelNepali: meta.labelNe,
          fieldLabelEnglish: meta.labelEn,
          oldValue: oldVal,
          newValue: newVal,
          changeType,
        });
      }
    }

    const graphImpact: NonNullable<VisualDiffDto['graphImpact']> = {};
    const relationship = reviewType && this.proposedRelationship(reviewType, proposedChanges);
    if (relationship) graphImpact.proposedRelationship = relationship;
    if (proposedChanges.parentIds) {
      graphImpact.affectedParents = proposedChanges.parentIds;
    }
    if (proposedChanges.spouseIds) {
      graphImpact.affectedSpouses = proposedChanges.spouseIds;
    }

    return {
      fields,
      graphImpact: Object.keys(graphImpact).length > 0 ? graphImpact : undefined,
    };
  }

  private proposedRelationship(
    type: ChangeRequestType,
    changes: Record<string, any>,
  ): ProposedRelationshipDto | undefined {
    const action = type === ChangeRequestType.REMOVE_PARENT_LINK ||
      type === ChangeRequestType.REMOVE_SPOUSE_LINK ? 'REMOVE' : 'ADD';

    let relationship: ProposedRelationshipDto['relationship'];
    let personId: unknown;
    if (type === ChangeRequestType.ADD_CHILD ||
        (type === ChangeRequestType.ADD_PARENT_LINK && changes.isChild)) {
      relationship = 'CHILD';
      personId = changes.childPersonId;
    } else if (type === ChangeRequestType.ADD_PARENT ||
               type === ChangeRequestType.ADD_PARENT_LINK ||
               type === ChangeRequestType.REMOVE_PARENT_LINK) {
      relationship = 'PARENT';
      personId = changes.parentPersonId || changes.parentId;
    } else if (type === ChangeRequestType.ADD_SPOUSE ||
               type === ChangeRequestType.ADD_SPOUSE_LINK ||
               type === ChangeRequestType.REMOVE_SPOUSE_LINK) {
      relationship = 'SPOUSE';
      personId = changes.spousePersonId || changes.spouseId;
    } else {
      return undefined;
    }

    if (typeof personId === 'string' && personId) {
      return { action, relationship, relative: { personId } };
    }
    if (action === 'REMOVE') return undefined;
    const name = [changes.primaryNameNepali, changes.primaryNameEnglish]
      .find(value => typeof value === 'string' && value.trim());
    return {
      action,
      relationship,
      relative: typeof name === 'string' ? { proposedName: name.trim() } : {},
    };
  }
}
