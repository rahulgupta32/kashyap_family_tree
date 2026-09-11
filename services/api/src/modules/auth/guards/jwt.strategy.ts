import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '../../../database/repositories/user.repository';
import { SessionRepository } from '../../../database/repositories/session.repository';
import { ErrorCode, Role } from '@kashyap/contracts';
import { getJwtSecret, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } from '../auth.constants';
import { UserRoleAssignment } from '../decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  sid: string;
  phoneNumber: string;
  tokenType: 'access';
  roles: Role[];
  branchIds: string[];
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALGORITHM],
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Malformed token: missing subject identifier',
      });
    }

    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Invalid token type: expected access token',
      });
    }

    if (!payload.sid) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Malformed token: missing session identifier',
      });
    }

    // 1. Verify user exists and check active status in database (AUTH-FR-010)
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

    // 2. Validate persistent session state in PostgreSQL (Real-time server-side revocation)
    const session = await this.sessionRepo.findById(payload.sid);
    if (!session || session.revoked_at !== null || new Date() > session.expires_at) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.SESSION_EXPIRED,
        message: 'Session has been revoked or expired. Please log in again.',
      });
    }

    // 3. Derive permissions STRICTLY from current database assignments.
    // An empty role result must NEVER fall back to old JWT claims!
    const roleRecords = await this.userRepo.getUserRoles(user.id);
    const roles: Role[] = roleRecords.map((r) => r.role);
    const branchIds = roleRecords.map((r) => r.branch_id).filter((b): b is string => b !== null);
    const roleAssignments: UserRoleAssignment[] = roleRecords.map((r) => ({
      role: r.role,
      branchId: r.branch_id,
    }));

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      roles,
      branchIds,
      roleAssignments,
      sessionId: session.id,
    };
  }
}
