import { Injectable } from '@nestjs/common';
import {
  Role,
  PrivacyVisibility,
  PersonDetailDto,
  PersonSummaryDto,
  PersonSearchItemDto,
  TreeNodeDto,
  LivingStatus,
  DuplicateDetectionSignals,
} from '@kashyap/contracts';
import {
  getCurrentBsDate as getCalBsDate,
  isValidBsDate,
  isSupportedBsYear,
  BsDate,
} from '@kashyap/localization';

export interface ViewerContext {
  userId?: string;
  roles: Role[];
  branchId?: string;
  branchIds?: string[];
  isVerifiedMember?: boolean;
}

@Injectable()
export class PrivacyEngineService {
  /**
   * Computes the current Bikram Sambat (BS) date based on Nepal Standard Time (UTC+5:45).
   * Accurate calendar conversion aligning with Nepal standard astronomical calendar.
   */
  public getCurrentBsDate(now: Date = new Date()): BsDate {
    return getCalBsDate(now);
  }

  public getCurrentBsYear(now: Date = new Date()): number {
    return this.getCurrentBsDate(now).year;
  }

  /**
   * Evaluates if viewer has full administrative access within this person's branch scope
   * Strict authorization: Super/Central Admins have global access; Branch Admins/Verifiers
   * have access strictly within their assigned branchIds. Blanket bypasses are prohibited.
   */
  public isAuthorizedAdmin(viewer?: ViewerContext, personBranchId?: string): boolean {
    if (!viewer || !viewer.roles || viewer.roles.length === 0) return false;
    if (viewer.roles.includes(Role.SUPER_ADMIN) || viewer.roles.includes(Role.CENTRAL_ADMIN)) {
      return true;
    }
    if (viewer.roles.includes(Role.BRANCH_ADMIN) || viewer.roles.includes(Role.BRANCH_VERIFIER)) {
      if (!personBranchId) return false;
      if (viewer.branchId && viewer.branchId === personBranchId) return true;
      if (viewer.branchIds && viewer.branchIds.includes(personBranchId)) return true;
      return false;
    }
    return false;
  }

  /**
   * Determines if a person record is a protected minor (< 18) or has unconfirmed/uncertain age (PRIV-FR-003, Policy Sec 6.1)
   * Implements approved age/calendar model:
   * - If exact birth_date_bs (YYYY-MM-DD) is available, calculates exact age to the current day.
   * - If only birth_year_bs is available, difference <= 18 is treated restrictively as minor/uncertain.
   * - A living person without an established birth year/date is treated with restrictive minor protection defaults.
   */
  public isMinorOrUncertainAge(person: {
    is_minor_protected?: boolean;
    isMinorProtected?: boolean;
    birth_year_bs?: number;
    birthYearBs?: number;
    birth_date_bs?: string;
    birthDateBs?: string;
    living_status?: LivingStatus;
    livingStatus?: LivingStatus;
  }, now: Date = new Date()): boolean {
    const isProtected = Boolean(person.is_minor_protected || person.isMinorProtected);
    if (isProtected) return true;

    const status = person.living_status || person.livingStatus || LivingStatus.LIVING;
    if (status === LivingStatus.DECEASED) return false;

    const birthDateStr = person.birth_date_bs || person.birthDateBs;
    const currentBs = this.getCurrentBsDate(now);

    if (birthDateStr && typeof birthDateStr === 'string') {
      const parts = birthDateStr.trim().split('-');
      if (parts.length === 3) {
        const bYear = parseInt(parts[0], 10);
        const bMonth = parseInt(parts[1], 10);
        const bDay = parseInt(parts[2], 10);
        if (!isNaN(bYear) && !isNaN(bMonth) && !isNaN(bDay)) {
          // If date is invalid or unsupported, treat restrictively as uncertain/minor
          if (!isValidBsDate(bYear, bMonth, bDay)) {
            return true;
          }
          let exactAge = currentBs.year - bYear;
          if (currentBs.month < bMonth || (currentBs.month === bMonth && currentBs.day < bDay)) {
            exactAge--;
          }
          return exactAge < 18;
        }
      }
    }

    const birthYear = person.birth_year_bs || person.birthYearBs;
    if (!birthYear) {
      // Living person with unknown birth year: apply restrictive minor protection default (Policy Sec 6.1)
      return true;
    }

    if (!isSupportedBsYear(birthYear)) {
      // Unsupported birth year: treat restrictively as uncertain
      return true;
    }

    const yearDiff = currentBs.year - birthYear;
    // When exact month/day is unknown, yearDiff <= 18 represents an uncertain boundary (could be 17)
    // Policy requires treating uncertain boundaries restrictively
    return yearDiff <= 18;
  }

  /**
   * Applies privacy filtering and explicit field projection to PersonDetailDto
   * Removes unconditional admin bypass so user-level PRIVATE fields and minor protections are respected.
   */
  public filterPersonDetail(detail: PersonDetailDto, viewer?: ViewerContext): PersonDetailDto {
    const isAdmin = this.isAuthorizedAdmin(viewer, detail.branchId);
    const isMinor = this.isMinorOrUncertainAge(detail);
    const isDeceased = detail.livingStatus === LivingStatus.DECEASED;
    const isVerified = Boolean(viewer?.isVerifiedMember || viewer?.roles.includes(Role.VERIFIED_MEMBER));
    const isSelf = Boolean(viewer?.userId && detail.claimedByUserId && viewer.userId === detail.claimedByUserId);

    // Explicit projection copy
    const filtered: PersonDetailDto = {
      id: detail.id,
      primaryNameNepali: detail.primaryNameNepali,
      primaryNameEnglish: detail.primaryNameEnglish,
      gender: detail.gender,
      livingStatus: detail.livingStatus,
      generation: detail.generation,
      branchId: detail.branchId,
      branchName: detail.branchName,
      birthYearBs: detail.birthYearBs,
      birthYearAd: detail.birthYearAd,
      birthDateBs: detail.birthDateBs,
      birthDateAd: detail.birthDateAd,
      birthPlace: detail.birthPlace,
      deathYearBs: detail.deathYearBs,
      deathDateBs: detail.deathDateBs,
      deathDateAd: detail.deathDateAd,
      deathPlace: detail.deathPlace,
      gotra: detail.gotra,
      kuldevata: detail.kuldevata,
      moolGhar: detail.moolGhar,
      currentAddress: detail.currentAddress,
      biography: detail.biography,
      occupation: detail.occupation,
      education: detail.education,
      avatarUrl: detail.avatarUrl,
      isClaimed: detail.isClaimed,
      claimedByUserId: isAdmin || isSelf ? detail.claimedByUserId : undefined, // Protect user account ID
      isArchived: detail.isArchived,
      version: detail.version,
      isMinorProtected: isMinor,
      canonicalPersonId: detail.canonicalPersonId,
      privacy: { ...detail.privacy },
      names: (detail.names || []).map((n) => ({
        language: n.language,
        firstName: n.firstName,
        middleName: n.middleName,
        lastName: n.lastName,
        fullName: n.fullName,
        isPrimary: n.isPrimary,
      })),
      parents: (detail.parents || []).map((p) => ({
        id: p.id,
        personId: p.personId,
        parentType: p.parentType,
        person: this.filterPersonSummary(p.person, viewer),
      })),
      spouses: (detail.spouses || []).map((s) => ({
        id: s.id,
        spousePersonId: s.spousePersonId,
        status: s.status,
        marriageDateBs: isMinor || (!isAdmin && !isVerified) ? undefined : s.marriageDateBs,
        person: this.filterPersonSummary(s.person, viewer),
      })),
      children: (detail.children || []).map((c) => ({
        id: c.id,
        personId: c.personId,
        parentType: c.parentType,
        person: this.filterPersonSummary(c.person, viewer),
      })),
    };

    if (isSelf) {
      return filtered;
    }

    // Minor / Uncertain Age Protection (PRIV-FR-003, Policy Sec 6.1):
    if (isMinor) {
      if (!isAdmin && !isSelf) {
        filtered.currentAddress = undefined;
        filtered.birthPlace = undefined;
        filtered.moolGhar = undefined;
        filtered.occupation = undefined;
        filtered.education = undefined;
        filtered.avatarUrl = undefined;
        // Show only birth year, redact exact dates
        if (filtered.birthDateBs) filtered.birthDateBs = filtered.birthYearBs ? `${filtered.birthYearBs} B.S.` : undefined;
        if (filtered.birthDateAd) filtered.birthDateAd = undefined;
      }
      return filtered;
    }

    // Adult Living Person Visibility Rules (PRIV-FR-001, PRIV-FR-002):
    if (!isDeceased) {
      // Address visibility
      if (
        detail.privacy.addressVisibility === PrivacyVisibility.PRIVATE ||
        (detail.privacy.addressVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified && !isAdmin)
      ) {
        filtered.currentAddress = undefined;
      }

      // DOB visibility
      if (
        detail.privacy.dobVisibility === PrivacyVisibility.PRIVATE ||
        (detail.privacy.dobVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified && !isAdmin)
      ) {
        filtered.birthDateBs = filtered.birthYearBs ? `${filtered.birthYearBs} B.S.` : undefined;
        filtered.birthDateAd = undefined;
      }
    }

    return filtered;
  }

  /**
   * Applies privacy filtering and explicit projection to PersonSummaryDto
   */
  public filterPersonSummary(summary: PersonSummaryDto, viewer?: ViewerContext): PersonSummaryDto {
    const isAdmin = this.isAuthorizedAdmin(viewer, summary.branchId);
    const isMinor = this.isMinorOrUncertainAge(summary);
    const isSelf = Boolean(viewer?.userId && summary.claimedByUserId && viewer.userId === summary.claimedByUserId);

    return {
      id: summary.id,
      primaryNameNepali: summary.primaryNameNepali,
      primaryNameEnglish: summary.primaryNameEnglish,
      gender: summary.gender,
      livingStatus: summary.livingStatus,
      generation: summary.generation,
      branchId: summary.branchId,
      branchName: summary.branchName,
      birthYearBs: summary.birthYearBs,
      birthYearAd: summary.birthYearAd,
      deathYearBs: summary.deathYearBs,
      avatarUrl: isMinor && !isAdmin ? undefined : summary.avatarUrl,
      isClaimed: summary.isClaimed,
      claimedByUserId: isAdmin || isSelf ? summary.claimedByUserId : undefined,
      isArchived: summary.isArchived,
      version: summary.version,
      isMinorProtected: isMinor,
    };
  }

  /**
   * Applies privacy filtering and explicit projection to PersonSearchItemDto
   */
  public filterSearchItem(item: PersonSearchItemDto, viewer?: ViewerContext): PersonSearchItemDto {
    const isAdmin = this.isAuthorizedAdmin(viewer, item.branchId);
    const isMinor = this.isMinorOrUncertainAge(item);

    return {
      id: item.id,
      primaryNameNepali: item.primaryNameNepali,
      primaryNameEnglish: item.primaryNameEnglish,
      gender: item.gender,
      livingStatus: item.livingStatus,
      generation: item.generation,
      branchId: item.branchId,
      branchName: item.branchName,
      birthYearBs: item.birthYearBs,
      deathYearBs: item.deathYearBs,
      moolGhar: isMinor && !isAdmin ? undefined : item.moolGhar,
      isClaimed: item.isClaimed,
      similarityScore: item.similarityScore,
      version: item.version,
    };
  }

  /**
   * Filters tree nodes recursively for viewer privacy
   */
  public filterTreeNode(node: TreeNodeDto, viewer?: ViewerContext): TreeNodeDto {
    const isMinor = this.isMinorOrUncertainAge({
      isMinorProtected: false,
      livingStatus: node.livingStatus,
    });
    const isAdmin = this.isAuthorizedAdmin(viewer);

    return {
      id: node.id,
      nameNepali: node.nameNepali,
      nameEnglish: node.nameEnglish,
      gender: node.gender,
      generation: node.generation,
      livingStatus: node.livingStatus,
      isClaimed: node.isClaimed,
      avatarUrl: isMinor && !isAdmin ? undefined : node.avatarUrl,
      spouses: (node.spouses || []).map((s) => this.filterTreeNode(s, viewer)),
      children: (node.children || []).map((c) => this.filterTreeNode(c, viewer)),
      ancestors: (node.ancestors || []).map((a) => this.filterTreeNode(a, viewer)),
      hasMoreAncestors: node.hasMoreAncestors,
      hasMoreDescendants: node.hasMoreDescendants,
    };
  }

  /**
   * Sanitizes duplicate detection signals to protect privacy of sensitive candidate details
   */
  public filterDuplicateSignals(signals: DuplicateDetectionSignals, viewer?: ViewerContext): DuplicateDetectionSignals {
    return {
      nameSimilarity: signals.nameSimilarity,
      matchingNames: signals.matchingNames || [],
      birthYearDiff: signals.birthYearDiff,
      sameBranch: signals.sameBranch,
      sharedParentsCount: signals.sharedParentsCount,
      reasons: signals.reasons || [],
    };
  }

  /**
   * Evaluates if a record is visible to the given viewer context
   */
  public isRecordVisible(
    record: { is_archived?: boolean; isArchived?: boolean; branch_id?: string; branchId?: string; living_status?: LivingStatus; livingStatus?: LivingStatus },
    viewer?: ViewerContext,
  ): boolean {
    const isArchived = Boolean(record.is_archived || record.isArchived);
    const branchId = record.branch_id || record.branchId;
    if (isArchived) {
      return this.isAuthorizedAdmin(viewer, branchId);
    }
    return true;
  }
}
