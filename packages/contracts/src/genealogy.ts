// ============================================================================
// Genealogy & Person Domain Contracts
// ============================================================================

import { Gender, LivingStatus, ParentType, SpouseStatus, PrivacyVisibility } from './enums.js';

export interface PersonNameDto {
  language: 'ne' | 'en';
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  isPrimary: boolean;
}

export interface PersonSummaryDto {
  id: string;
  primaryNameNepali: string;
  primaryNameEnglish: string;
  gender: Gender;
  livingStatus: LivingStatus;
  generation: number;
  branchId: string;
  branchName: string;
  birthYearBs?: number;
  birthYearAd?: number;
  deathYearBs?: number;
  avatarUrl?: string;
  isClaimed: boolean;
  claimedByUserId?: string;
}

export interface PersonDetailDto extends PersonSummaryDto {
  names: PersonNameDto[];
  birthDateBs?: string;
  birthDateAd?: string;
  birthPlace?: string;
  deathDateBs?: string;
  deathDateAd?: string;
  deathPlace?: string;
  gotra: string;
  kuldevata?: string;
  moolGhar?: string;
  currentAddress?: string;
  biography?: string;
  occupation?: string;
  education?: string;
  privacy: {
    phoneVisibility: PrivacyVisibility;
    addressVisibility: PrivacyVisibility;
    dobVisibility: PrivacyVisibility;
  };
  parents: Array<{
    id: string;
    personId: string;
    parentType: ParentType;
    person: PersonSummaryDto;
  }>;
  spouses: Array<{
    id: string;
    spousePersonId: string;
    status: SpouseStatus;
    marriageDateBs?: string;
    person: PersonSummaryDto;
  }>;
  children: Array<{
    id: string;
    personId: string;
    parentType: ParentType;
    person: PersonSummaryDto;
  }>;
}

export interface TreeNodeDto {
  id: string;
  nameNepali: string;
  nameEnglish: string;
  gender: Gender;
  generation: number;
  livingStatus: LivingStatus;
  isClaimed: boolean;
  avatarUrl?: string;
  spouses: TreeNodeDto[];
  children: TreeNodeDto[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

export interface TreeQueryDto {
  rootPersonId: string;
  ancestorGenerations?: number; // default 2
  descendantGenerations?: number; // default 2
  includeSpouses?: boolean;
}

export interface CreatePersonDto {
  names: PersonNameDto[];
  gender: Gender;
  livingStatus: LivingStatus;
  branchId: string;
  generation: number;
  birthYearBs?: number;
  birthDateBs?: string;
  birthPlace?: string;
  deathYearBs?: number;
  deathDateBs?: string;
  parentPersonIds?: Array<{ personId: string; parentType: ParentType }>;
  spousePersonIds?: Array<{ personId: string; status: SpouseStatus; marriageDateBs?: string }>;
}
