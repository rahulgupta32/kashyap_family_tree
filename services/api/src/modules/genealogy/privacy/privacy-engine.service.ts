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
   * Computes the authoritative current Bikram Sambat (BS) year dynamically
   * based on the standard solar calendar offset (Baisakh 1 ~ April 14).
   */
  public getCurrentBsYear(now: Date = new Date()): number {
    const month = now.getUTCMonth(); // 0 = Jan, 3 = Apr
    const day = now.getUTCDate();
    if (month > 3 || (month === 3 && day >= 14)) {
      return now.getUTCFullYear() + 57;
    }
    return now.getUTCFullYear() + 56;
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
   * Determines if a person record is a protected minor (< 18) or has unconfirmed/uncertain age (PRIV-FR-003)
   * A living person without an established birth year is treated with restrictive minor protection defaults.
   */
  public isMinorOrUncertainAge(person: {
    is_minor_protected?: boolean;
    isMinorProtected?: boolean;
    birth_year_bs?: number;
    birthYearBs?: number;
    living_status?: LivingStatus;
    livingStatus?: LivingStatus;
  }): boolean {
    const isProtected = Boolean(person.is_minor_protected || person.isMinorProtected);
    if (isProtected) return true;

    const status = person.living_status || person.livingStatus || LivingStatus.LIVING;
    if (status === LivingStatus.DECEASED) return false;

    const birthYear = person.birth_year_bs || person.birthYearBs;
    if (!birthYear) {
      // Living person with unknown birth year: apply restrictive minor protection default
      return true;
    }

    const currentBsYear = this.getCurrentBsYear();
    const calculatedAge = currentBsYear - birthYear;
    return calculatedAge < 18;
  }

  /**
   * Applies privacy filtering and explicit field projection to PersonDetailDto
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

    if (isAdmin || isSelf) {
      return filtered;
    }

    // Minor / Uncertain Age Protection (PRIV-FR-003):
    if (isMinor) {
      filtered.currentAddress = undefined;
      filtered.birthPlace = undefined;
      filtered.moolGhar = undefined;
      filtered.occupation = undefined;
      filtered.education = undefined;
      filtered.avatarUrl = undefined;
      // Show only birth year, redact exact dates
      if (filtered.birthDateBs) filtered.birthDateBs = filtered.birthYearBs ? `${filtered.birthYearBs} B.S.` : undefined;
      if (filtered.birthDateAd) filtered.birthDateAd = undefined;
      return filtered;
    }

    // Adult Living Person Visibility Rules (PRIV-FR-001, PRIV-FR-002):
    if (!isDeceased) {
      // Address visibility
      if (
        detail.privacy.addressVisibility === PrivacyVisibility.PRIVATE ||
        (detail.privacy.addressVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified)
      ) {
        filtered.currentAddress = undefined;
      }

      // DOB visibility
      if (
        detail.privacy.dobVisibility === PrivacyVisibility.PRIVATE ||
        (detail.privacy.dobVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified)
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
}
