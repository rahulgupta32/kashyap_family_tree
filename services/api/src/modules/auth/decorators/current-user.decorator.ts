import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@kashyap/contracts';

export interface AuthenticatedUser {
  id: string;
  phoneNumber: string;
  roles: Role[];
  branchIds: string[];
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
