import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  SubmitChangeRequestDto,
  ChangeRequestDetailDto,
  ReviewChangeRequestDto,
  ChangeRequestStatus,
  Role,
  ErrorCode,
} from '@kashyap/contracts';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PersonRepository } from '../../database/repositories/person.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';

@Injectable()
export class ChangeRequestsService {
  private requests = new Map<string, ChangeRequestDetailDto>();

  constructor(
    @Optional() private readonly personRepo?: PersonRepository,
    @Optional() private readonly branchRepo?: BranchRepository,
  ) {}

  async submitRequest(requesterUserId: string, dto: SubmitChangeRequestDto): Promise<ChangeRequestDetailDto> {
    let resolvedBranchId: string | null = dto.branchId || null;

    if (dto.targetPersonId && this.personRepo) {
      const person = await this.personRepo.findById(dto.targetPersonId);
      if (!person) {
        throw new NotFoundException({
          errorCode: ErrorCode.PERSON_NOT_FOUND,
          message: `Target person record not found in database: ${dto.targetPersonId}`,
        });
      }
      resolvedBranchId = person.branch_id || resolvedBranchId;
    }

    const id = `chg_${Date.now()}`;
    const req: ChangeRequestDetailDto = {
      id,
      type: dto.type,
      status: ChangeRequestStatus.PENDING,
      targetPersonId: dto.targetPersonId,
      branchId: resolvedBranchId,
      requesterUserId,
      proposedChanges: dto.proposedChanges,
      reason: dto.reason,
      createdAt: new Date().toISOString(),
    };

    this.requests.set(id, req);
    return req;
  }

  async listRequests(callerUser?: AuthenticatedUser): Promise<ChangeRequestDetailDto[]> {
    const all = Array.from(this.requests.values());
    if (!callerUser) return all;

    if (callerUser.roles.includes(Role.SUPER_ADMIN)) {
      return all;
    }

    const authorizedBranches = (callerUser.roleAssignments || [])
      .filter((ra) => ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER)
      .map((ra) => ra.branchId)
      .filter((b): b is string => b !== null);

    return all.filter((r) => r.branchId && authorizedBranches.includes(r.branchId));
  }

  async reviewRequest(
    id: string,
    reviewer: AuthenticatedUser | string,
    dto: ReviewChangeRequestDto,
  ): Promise<ChangeRequestDetailDto> {
    const req = this.requests.get(id);
    if (!req) {
      throw new NotFoundException('Change request not found');
    }

    const reviewerId = typeof reviewer === 'string' ? reviewer : reviewer.id;
    const reviewerRoles = typeof reviewer === 'string' ? [Role.SUPER_ADMIN] : reviewer.roles;
    const reviewerRoleAssignments =
      typeof reviewer === 'string'
        ? [{ role: Role.SUPER_ADMIN, branchId: null }]
        : reviewer.roleAssignments || [];

    let requestBranchId = req.branchId;
    if (req.targetPersonId && this.personRepo) {
      const person = await this.personRepo.findById(req.targetPersonId);
      if (person && person.branch_id) {
        requestBranchId = person.branch_id;
      }
    }

    const isSuperAdmin = reviewerRoles.includes(Role.SUPER_ADMIN);
    if (!isSuperAdmin) {
      const isAuthorized = reviewerRoleAssignments.some(
        (ra) =>
          (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER) &&
          ra.branchId === requestBranchId,
      );

      if (!isAuthorized) {
        throw new ForbiddenException({
          errorCode: ErrorCode.BRANCH_MISMATCH,
          message: `Branch mismatch: You do not possess administrative authority for branch ${requestBranchId}`,
          messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
        });
      }
    }

    req.status = dto.status;
    req.reviewNotes = dto.reviewNotes;
    req.reviewedByUserId = reviewerId;
    req.reviewedAt = new Date().toISOString();

    return req;
  }
}
