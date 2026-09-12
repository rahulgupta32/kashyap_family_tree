import { Injectable } from '@nestjs/common';
import { Role, PrivacyVisibility, PersonDetailDto, PersonSummaryDto, TreeNodeDto, LivingStatus } from '@kashyap/contracts';

export interface ViewerContext {
  userId?: string;
  roles: Role[];
  branchId?: string;
  isVerifiedMember?: boolean;
}

@Injectable()
export class PrivacyEngineService {
  // Current Bikram Sambat year estimate for age estimation (~2083 BS)
  private readonly CURRENT_BS_YEAR = 2083;

  /**
   * Evaluates if viewer has full administrative access for this person's branch scope
   */
  public isAuthorizedAdmin(viewer?: ViewerContext, personBranchId?: string): boolean {
    if (!viewer) return false;
    if (viewer.roles.includes(Role.SUPER_ADMIN) || viewer.roles.includes(Role.CENTRAL_ADMIN)) {
      return true;
    }
    if (viewer.roles.includes(Role.BRANCH_ADMIN) || viewer.roles.includes(Role.BRANCH_VERIFIER)) {
      return Boolean(viewer.branchId && personBranchId && viewer.branchId === personBranchId);
    }
    return false;
  }

  /**
   * Determines if a person record is a protected minor or has unconfirmed/uncertain age (PRIV-FR-003)
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
      // Unknown age for living person: treat as unconfirmed/uncertain age (restrictive default)
      return true;
    }

    const calculatedAge = this.CURRENT_BS_YEAR - birthYear;
    return calculatedAge < 18;
  }

  /**
   * Applies privacy filtering to PersonDetailDto based on viewer permissions
   */
  public filterPersonDetail(detail: PersonDetailDto, viewer?: ViewerContext): PersonDetailDto {
    const isAdmin = this.isAuthorizedAdmin(viewer, detail.branchId);
    const isMinor = this.isMinorOrUncertainAge(detail);
    const isDeceased = detail.livingStatus === LivingStatus.DECEASED;
    const isVerified = Boolean(viewer?.isVerifiedMember || viewer?.roles.includes(Role.VERIFIED_MEMBER));
    const isSelf = Boolean(viewer?.userId && detail.claimedByUserId && viewer.userId === detail.claimedByUserId);

    // Deep copy to avoid mutating cache/memory
    const filtered: PersonDetailDto = {
      ...detail,
      privacy: { ...detail.privacy },
      names: detail.names ? [...detail.names] : [],
      parents: detail.parents ? detail.parents.map((p) => ({ ...p, person: this.filterPersonSummary(p.person, viewer) })) : [],
      spouses: detail.spouses ? detail.spouses.map((s) => ({ ...s, person: this.filterPersonSummary(s.person, viewer) })) : [],
      children: detail.children ? detail.children.map((c) => ({ ...c, person: this.filterPersonSummary(c.person, viewer) })) : [],
    };

    if (isAdmin || isSelf) {
      // Authorized administrator within branch scope or owner has full visibility
      return filtered;
    }

    // Minor / Uncertain Age Protection (PRIV-FR-003):
    if (isMinor) {
      filtered.currentAddress = undefined;
      filtered.birthPlace = undefined;
      filtered.moolGhar = undefined;
      filtered.occupation = undefined;
      filtered.education = undefined;
      // Show only year, mask exact date
      if (filtered.birthDateBs) filtered.birthDateBs = filtered.birthYearBs ? `${filtered.birthYearBs} B.S.` : undefined;
      if (filtered.birthDateAd) filtered.birthDateAd = undefined;
      return filtered;
    }

    // Adult Living Person Visibility Rules (PRIV-FR-001, PRIV-FR-002):
    if (!isDeceased) {
      // Phone / Contact visibility
      if (detail.privacy.phoneVisibility === PrivacyVisibility.PRIVATE) {
        // Masked for non-admins
      } else if (detail.privacy.phoneVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified) {
        // Masked for guests / unverified
      }

      // Address visibility
      if (detail.privacy.addressVisibility === PrivacyVisibility.PRIVATE ||
          (detail.privacy.addressVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified)) {
        filtered.currentAddress = undefined;
      }

      // DOB visibility
      if (detail.privacy.dobVisibility === PrivacyVisibility.PRIVATE ||
          (detail.privacy.dobVisibility === PrivacyVisibility.VERIFIED_COMMUNITY && !isVerified)) {
        filtered.birthDateBs = filtered.birthYearBs ? `${filtered.birthYearBs} B.S.` : undefined;
        filtered.birthDateAd = undefined;
      }
    }

    return filtered;
  }

  /**
   * Applies privacy filtering to PersonSummaryDto
   */
  public filterPersonSummary(summary: PersonSummaryDto, viewer?: ViewerContext): PersonSummaryDto {
    const isAdmin = this.isAuthorizedAdmin(viewer, summary.branchId);
    const isMinor = this.isMinorOrUncertainAge(summary);

    const filtered: PersonSummaryDto = { ...summary };

    if (isAdmin) return filtered;

    if (isMinor) {
      // Minor summary facts are sanitized
      filtered.avatarUrl = undefined;
    }

    return filtered;
  }

  /**
   * Filters tree nodes recursively for viewer privacy
   */
  public filterTreeNode(node: TreeNodeDto, viewer?: ViewerContext): TreeNodeDto {
    const isMinor = this.isMinorOrUncertainAge({
      isMinorProtected: false,
      livingStatus: node.livingStatus,
    });

    return {
      ...node,
      avatarUrl: isMinor && !this.isAuthorizedAdmin(viewer) ? undefined : node.avatarUrl,
      spouses: node.spouses.map((s) => this.filterTreeNode(s, viewer)),
      children: node.children.map((c) => this.filterTreeNode(c, viewer)),
    };
  }
}
