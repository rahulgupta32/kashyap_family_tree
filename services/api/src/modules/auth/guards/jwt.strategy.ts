import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ErrorCode, Role } from '@kashyap/contracts';

export interface JwtPayload {
  sub: string;
  phoneNumber: string;
  roles: Role[];
  branchIds: string[];
  iat?: number;
  exp?: number;
}

import { JWT_SECRET } from '../auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly userRepo: UserRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Malformed token: missing subject identifier',
      });
    }

    // Verify user exists and check active status in database (AUTH-FR-010)
    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'User account not found',
      });
    }

    if (user.is_suspended) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_SUSPENDED,
        message: user.suspension_reason || 'Account has been suspended.',
      });
    }

    if (!user.is_active || user.deleted_at) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ACCOUNT_DELETED,
        message: 'Account has been deactivated.',
      });
    }

    // Fetch fresh database roles to prevent stale privilege retention
    const roleRecords = await this.userRepo.getUserRoles(user.id);
    const roles = roleRecords.length > 0 ? roleRecords.map((r) => r.role) : payload.roles;
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      roles,
      branchIds,
    };
  }
}
