import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, ErrorCode } from '@kashyap/contracts';
import { PersonRepository } from '../../../database/repositories/person.repository';

@Injectable()
export class BranchGuard implements CanActivate {
  constructor(private readonly personRepo: PersonRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Authentication required for branch-scoped operations',
      });
    }

    // Super Admin has unrestricted authority across all branches (BR-GOV-014)
    if (user.roles?.includes(Role.SUPER_ADMIN)) {
      return true;
    }

    let targetBranchId: string | undefined =
      request.params?.branchId ||
      request.body?.branchId ||
      request.query?.branchId;

    // If branchId is not directly in params/body, resolve from target person in PostgreSQL
    if (!targetBranchId) {
      const personId = request.params?.id || request.params?.childId || request.params?.personId;
      if (personId) {
        const person = await this.personRepo.findById(personId);
        if (person && person.branch_id) {
          targetBranchId = person.branch_id;
        }
      }
    }

    if (!targetBranchId) {
      throw new BadRequestException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: 'Branch identifier cannot be determined or is missing for branch-scoped operation.',
      });
    }

    // Enforce strict role-branch pairing: verify user has BRANCH_ADMIN or BRANCH_VERIFIER specifically for targetBranchId
    const roleAssignments = user.roleAssignments || [];
    const isAuthorizedForBranch = roleAssignments.some(
      (ra: { role: Role; branchId: string | null }) =>
        ra.branchId === targetBranchId &&
        (ra.role === Role.BRANCH_ADMIN || ra.role === Role.BRANCH_VERIFIER),
    );

    if (!isAuthorizedForBranch) {
      throw new ForbiddenException({
        errorCode: ErrorCode.BRANCH_MISMATCH,
        message: `Branch mismatch: You do not possess administrative authority for branch ${targetBranchId} (BR-GOV-005).`,
        messageNepali: 'शाखा बेमेल: तपाईंसँग यस शाखाको लागि प्रशासनिक अधिकार छैन।',
      });
    }

    return true;
  }
}
