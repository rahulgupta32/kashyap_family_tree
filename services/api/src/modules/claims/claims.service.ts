import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  SubmitClaimDto,
  ClaimDetailDto,
  ReviewClaimDto,
  ClaimStatus,
  ErrorCode,
  Role,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PersonRepository } from '../../database/repositories/person.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { UserRepository } from '../../database/repositories/user.repository';

@Injectable()
export class ClaimsService {
  private claims = new Map<string, ClaimDetailDto>();

  constructor(
    @Optional() private readonly personRepo?: PersonRepository,
    @Optional() private readonly branchRepo?: BranchRepository,
    @Optional() private readonly userRepo?: UserRepository,
  ) {}

  async submitClaim(claimantUserId: string, dto: SubmitClaimDto): Promise<ClaimDetailDto> {
    if (!dto.statementOfTruth) {
      throw new BadRequestException({
        errorCode: ErrorCode.INSUFFICIENT_EVIDENCE,
        message: 'Must agree to statement of truth',
      });
    }

    // Check if duplicate claim exists
    for (const c of this.claims.values()) {
      if (c.targetPersonId === dto.targetPersonId && c.status === ClaimStatus.SUBMITTED) {
        throw new BadRequestException({
          errorCode: ErrorCode.ACTIVE_CLAIM_EXISTS,
          message: 'An active verification claim already exists for this person',
        });
      }
    }

    // Server-side PostgreSQL lookup of target person
    let resolvedBranchId = 'b-001';
    let branchName = 'कास्की शाखा';
    let primaryNameNepali = 'दिनेश अधिकारी';
    let primaryNameEnglish = 'Dinesh Adhikari';
    let gender = 'MALE' as any;
    let livingStatus = 'LIVING' as any;
    let generation = 4;
    let isClaimed = false;

    if (this.personRepo) {
      const person = await this.personRepo.findById(dto.targetPersonId);
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Target person record not found in database: ${dto.targetPersonId}`,
        });
      }
      resolvedBranchId = person.branch_id || 'UNKNOWN';
      gender = person.gender;
      livingStatus = person.living_status;
      generation = person.generation;
      isClaimed = person.is_claimed;

      const names = await this.personRepo.findNamesByPersonId(person.id);
      const neName = names.find((n) => n.language === 'ne');
      const enName = names.find((n) => n.language === 'en');
      if (neName) primaryNameNepali = neName.full_name;
      if (enName) primaryNameEnglish = enName.full_name;

      if (this.branchRepo && person.branch_id) {
        const branch = await this.branchRepo.findById(person.branch_id);
        if (branch) {
          branchName = branch.name_nepali;
        }
      }
    }

    let claimantPhone = '9841000001';
    if (this.userRepo) {
      const user = await this.userRepo.findById(claimantUserId);
      if (user) {
        claimantPhone = user.phone_number;
      }
    }

    const claimId = `claim_${Date.now()}`;
    const newClaim: ClaimDetailDto = {
      id: claimId,
      targetPersonId: dto.targetPersonId,
      targetPerson: {
        id: dto.targetPersonId,
        primaryNameNepali,
        primaryNameEnglish,
        gender,
        livingStatus,
        generation,
        branchId: resolvedBranchId,
        branchName,
        isClaimed,
      },
      claimantUserId,
      claimantPhoneNumber: claimantPhone,
      status: ClaimStatus.SUBMITTED,
      relationshipDescription: dto.relationshipDescription,
      evidenceAttachments: dto.evidenceAttachments.map((a, i) => ({
        id: `att_${i}`,
        mediaUrl: `https://storage.kashyap.org/evidence/${a.mediaAssetId}`,
        documentType: a.documentType,
        description: a.description,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.claims.set(claimId, newClaim);
    return newClaim;
  }

  async listClaims(callerUser?: AuthenticatedUser): Promise<ClaimDetailDto[]> {
    const all = Array.from(this.claims.values());
    if (!callerUser) return all;

    if (callerUser.roles.includes(Role.SUPER_ADMIN)) {
      return all;
    }

    // Filter by reviewer's authorized branch assignments
    const authorizedBranches = (callerUser.roleAssignments || [])
      .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
      .map((ra) => ra.branchId)
      .filter((b): b is string => b !== null);

    return all.filter((c) => authorizedBranches.includes(c.targetPerson.branchId));
  }

  async reviewClaim(
    claimId: string,
    reviewer: AuthenticatedUser | string,
    dto: ReviewClaimDto,
  ): Promise<ClaimDetailDto> {
    const claim = this.claims.get(claimId);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    const reviewerId = typeof reviewer === 'string' ? reviewer : reviewer.id;
    const reviewerRoles = typeof reviewer === 'string' ? [Role.SUPER_ADMIN] : reviewer.roles;
    const reviewerRoleAssignments =
      typeof reviewer === 'string'
        ? [{ role: Role.SUPER_ADMIN, branchId: null }]
        : reviewer.roleAssignments || [];

    if (claim.claimantUserId === reviewerId) {
      throw new BadRequestException({
        errorCode: ErrorCode.SELF_VERIFICATION_PROHIBITED,
        message: 'Administrators cannot verify their own claims',
      });
    }

    // Resolve resource branch server-side
    let claimBranchId = claim.targetPerson.branchId;
    if (this.personRepo) {
      const person = await this.personRepo.findById(claim.targetPersonId);
      if (person && person.branch_id) {
        claimBranchId = person.branch_id;
      }
    }

    const isSuperAdmin = reviewerRoles.includes(Role.SUPER_ADMIN);
    if (!isSuperAdmin) {
      const isAuthorized = reviewerRoleAssignments.some(
        (ra) =>
          (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) &&
          ra.branchId === claimBranchId,
      );

      if (!isAuthorized) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: You do not possess administrative authority for branch ${claimBranchId}`,
          messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
        });
      }
    }

    claim.status = dto.status;
    claim.reviewNotes = dto.reviewNotes;
    claim.reviewedByUserId = reviewerId;
    claim.reviewedAt = new Date().toISOString();
    claim.updatedAt = new Date().toISOString();

    return claim;
  }
}
