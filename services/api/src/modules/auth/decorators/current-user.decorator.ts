import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@kashyap/contracts';

export interface UserRoleAssignment {
  role: Role;
  branchId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  phoneNumber: string;
  roles: Role[];
  branchIds: string[];
  roleAssignments: UserRoleAssignment[];
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
