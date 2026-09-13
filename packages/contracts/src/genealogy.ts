// ============================================================================
// Genealogy & Person Domain Contracts (M3 Production Baseline)
// ============================================================================

import { Gender, LivingStatus, ParentType, SpouseStatus, PrivacyVisibility, DuplicateCandidateStatus } from './enums.js';

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
  isArchived?: boolean;
  version?: number;
  isMinorProtected?: boolean;
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
  canonicalPersonId?: string; // Populated if this ID was merged
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
  ancestors?: TreeNodeDto[];
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
  birthDateAd?: string;
  birthPlace?: string;
  deathYearBs?: number;
  deathDateBs?: string;
  deathDateAd?: string;
  deathPlace?: string;
  gotra?: string;
  kuldevata?: string;
  moolGhar?: string;
  currentAddress?: string;
  occupation?: string;
  education?: string;
  biography?: string;
  phoneVisibility?: PrivacyVisibility;
  addressVisibility?: PrivacyVisibility;
  dobVisibility?: PrivacyVisibility;
  isMinorProtected?: boolean;
  parentPersonIds?: Array<{ personId: string; parentType: ParentType }>;
  spousePersonIds?: Array<{ personId: string; status: SpouseStatus; marriageDateBs?: string }>;
}

export interface AdminCreatePersonDto extends CreatePersonDto {
  justificationReason: string;
  allowDuplicateOverride?: boolean;
}

export interface AdminUpdatePersonDto {
  names?: PersonNameDto[];
  gender?: Gender;
  livingStatus?: LivingStatus;
  branchId?: string;
  generation?: number;
  birthYearBs?: number;
  birthDateBs?: string;
  birthDateAd?: string;
  birthPlace?: string;
  deathYearBs?: number;
  deathDateBs?: string;
  deathDateAd?: string;
  deathPlace?: string;
  gotra?: string;
  kuldevata?: string;
  moolGhar?: string;
  currentAddress?: string;
  occupation?: string;
  education?: string;
  biography?: string;
  phoneVisibility?: PrivacyVisibility;
  addressVisibility?: PrivacyVisibility;
  dobVisibility?: PrivacyVisibility;
  isMinorProtected?: boolean;
  justificationReason: string;
  version: number;
}

export interface AdminArchivePersonDto {
  reason: string;
}

export interface AddParentLinkDto {
  parentId: string;
  childId: string;
  parentType?: ParentType;
  justificationReason?: string;
}

export interface RemoveParentLinkDto {
  parentId: string;
  childId: string;
  justificationReason?: string;
}

export interface AddSpouseLinkDto {
  personId: string;
  spouseId: string;
  status?: SpouseStatus;
  marriageDateBs?: string;
  justificationReason?: string;
}

export interface RemoveSpouseLinkDto {
  personId: string;
  spouseId: string;
  justificationReason?: string;
}

export interface PersonSearchQueryDto {
  query?: string;
  branchId?: string;
  generation?: number;
  livingStatus?: LivingStatus;
  gender?: Gender;
  moolGhar?: string;
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PersonSearchItemDto {
  id: string;
  primaryNameNepali: string;
  primaryNameEnglish: string;
  gender: Gender;
  livingStatus: LivingStatus;
  generation: number;
  branchId: string;
  branchName: string;
  birthYearBs?: number;
  deathYearBs?: number;
  moolGhar?: string;
  isClaimed: boolean;
  similarityScore?: number;
  version: number;
}

export interface PersonSearchResponseDto {
  items: PersonSearchItemDto[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface EvaluatePersonDto {
  names: PersonNameDto[];
  gender?: Gender;
  livingStatus?: LivingStatus;
  branchId?: string;
  generation?: number;
  birthYearBs?: number;
  birthPlace?: string;
  parentPersonIds?: Array<{ personId: string; parentType: ParentType }>;
  spousePersonIds?: Array<{ personId: string; status: SpouseStatus }>;
}

export interface DuplicateDetectionSignals {
  nameSimilarity: number;
  matchingNames: string[];
  birthYearDiff?: number;
  sameBranch: boolean;
  sharedParentsCount: number;
  reasons: string[];
}

export interface DuplicateCandidateDto {
  id: string;
  personAId: string;
  personBId: string;
  personA: PersonSummaryDto;
  personB: PersonSummaryDto;
  confidenceScore: number;
  detectionSignals: DuplicateDetectionSignals;
  status: DuplicateCandidateStatus;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface DuplicateCandidateQueryDto {
  status?: DuplicateCandidateStatus;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface DuplicateCompareDto {
  candidateId?: string;
  personA: PersonDetailDto;
  personB: PersonDetailDto;
  confidenceScore: number;
  detectionSignals: DuplicateDetectionSignals;
  fieldDifferences: Array<{
    field: string;
    labelNepali: string;
    labelEnglish: string;
    valueA: any;
    valueB: any;
    hasConflict: boolean;
  }>;
  sharedRelationships: {
    parents: Array<{ idA?: string; idB?: string; person: PersonSummaryDto; matched: boolean }>;
    spouses: Array<{ idA?: string; idB?: string; person: PersonSummaryDto; matched: boolean }>;
    children: Array<{ idA?: string; idB?: string; person: PersonSummaryDto; matched: boolean }>;
  };
}

export interface ResolveDuplicateCandidateDto {
  status: DuplicateCandidateStatus.NOT_A_DUPLICATE | DuplicateCandidateStatus.CONFIRMED_DUPLICATE;
  notes?: string;
}

export interface MergePersonsDto {
  survivingPersonId: string;
  mergedPersonId: string;
  fieldResolutions?: Record<string, any>;
  justificationReason: string;
  survivingPersonVersion?: number;
  mergedPersonVersion?: number;
}

export interface MergeResultDto {
  canonicalPersonId: string;
  mergedPersonId: string;
  migratedParentLinksCount: number;
  migratedChildLinksCount: number;
  migratedSpouseLinksCount: number;
  migratedClaimsCount: number;
  migratedRequestsCount: number;
  executedAt: string;
}

export interface GenealogyExportQueryDto {
  branchId?: string;
  generationStart?: number;
  generationEnd?: number;
  format?: 'json' | 'csv';
}

export interface GenealogyExportDto {
  exportedAt: string;
  exportedBy: string;
  viewerRole: string;
  branchId?: string;
  totalRecords: number;
  persons: any[];
  parentLinks: any[];
  spouseLinks: any[];
}
