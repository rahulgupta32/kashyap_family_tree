import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@kashyap/contracts';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: info?.message || 'Authentication required to access this resource',
      });
    }
    return user;
  }
}
