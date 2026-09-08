// ============================================================================
// Cultural & Kinship Rule Engine Contracts
// ============================================================================

import { RuleSetStatus, RuleType } from './enums.js';

export interface KinshipPathStep {
  relation: 'F' | 'M' | 'B' | 'Z' | 'S' | 'D' | 'H' | 'W'; // Father, Mother, Brother, Sister, Son, Daughter, Husband, Wife
  relativeAge?: 'ELDER' | 'YOUNGER';
}

export interface NataSainoTermMapping {
  pathCode: string; // e.g. "F.B.S", "M.B"
  nepaliTerm: string; // e.g. "काका", "मामा"
  englishTerm: string; // e.g. "Paternal Uncle", "Maternal Uncle"
  nepaliDescription?: string;
  reciprocalTermNepali?: string;
  reciprocalTermEnglish?: string;
}

export interface JuthoRuleEntry {
  relationshipPath: string;
  mourningDays: number;
  sutokDays: number;
  restrictions: string[];
  exceptions: string[];
}

export interface DomainRuleSetDto {
  id: string;
  ruleType: RuleType;
  version: string;
  status: RuleSetStatus;
  title: string;
  description: string;
  rulesData: {
    nataSaino?: NataSainoTermMapping[];
    jutho?: JuthoRuleEntry[];
    marriageEligibility?: any[];
  };
  signedByReviewer?: string;
  signedByAuthority?: string;
  activatedAt?: string;
  createdAt: string;
}

export interface KinshipLookupDto {
  fromPersonId: string;
  toPersonId: string;
}

export interface KinshipResultDto {
  pathFound: boolean;
  pathSteps?: string[];
  pathCode?: string;
  nataSainoNepali?: string;
  nataSainoEnglish?: string;
  reciprocalNepali?: string;
  reciprocalEnglish?: string;
  generationsDiff?: number;
  isAuthorityApproved: boolean;
  statusNote?: string; // e.g. "Pending Authority Sign-off"
}
