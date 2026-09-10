import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role, ErrorCode } from '@kashyap/contracts';

@Injectable()
export class BranchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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

    const targetBranchId =
      request.params?.branchId ||
      request.body?.branchId ||
      request.query?.branchId;

    if (!targetBranchId) {
      // If no branch is explicitly targeted, allow if user has general member role, or require explicit branch for verifiers
      return true;
    }

    const userBranches: string[] = user.branchIds || [];
    const isAuthorizedForBranch = userBranches.includes(targetBranchId);

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
