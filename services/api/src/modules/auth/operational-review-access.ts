import { ForbiddenException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { PoolClient } from 'pg';
import { AuthenticatedUser } from './decorators/current-user.decorator';
import { privilegedSessionExpired } from './privileged-session.policy';

/** Sensitive operational review requires current authority and MFA in every environment. */
export async function requireOperationalReview(tx: PoolClient, user: AuthenticatedUser) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('authenticator:' || $1::text))", [user.id]);
  const account = (await tx.query('SELECT * FROM user_accounts WHERE id=$1 FOR SHARE', [user.id])).rows[0];
  const session = (await tx.query('SELECT * FROM user_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',
    [user.sessionId, user.id])).rows[0];
  const roles = (await tx.query('SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE', [user.id])).rows.map(r => r.role);
  const factor = (await tx.query('SELECT generation,enabled_at FROM account_authenticators WHERE user_id=$1 FOR SHARE', [user.id])).rows[0];
  if (!account?.is_active || account.is_suspended || account.deleted_at || !session || session.revoked_at ||
      session.owner_revoked_at || new Date(session.expires_at).getTime() <= Date.now() ||
      !roles.includes(Role.SUPER_ADMIN) || privilegedSessionExpired(roles, session.authenticated_at)) {
    throw new ForbiddenException('Current Super Admin authority and fresh authentication required');
  }
  if (!factor?.enabled_at || !session.mfa_verified_at || session.mfa_generation !== factor.generation) {
    throw new ForbiddenException('Current authenticator verification required');
  }
}
