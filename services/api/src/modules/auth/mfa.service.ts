import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditAction, Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { AuthenticatedUser } from './decorators/current-user.decorator';
import { PRIVILEGED_ROLES, privilegedSessionExpired } from './privileged-session.policy';
import { decryptSecret, encryptSecret, matchingCounter, mfaKey, base32, recoveryHash } from './mfa.crypto';

const bypassPaths = new Set(['/auth/mfa/status', '/auth/mfa/enroll', '/auth/mfa/confirm', '/auth/mfa/verify', '/auth/mfa/recover', '/auth/me', '/auth/logout', '/auth/logout-all']);
export function isMfaBootstrapRequest(method: string, path: string): boolean {
  const clean = path.split('?')[0];
  return bypassPaths.has(clean) && ((clean === '/auth/me' || clean === '/auth/mfa/status') ? method === 'GET' : method === 'POST');
}

@Injectable()
export class MfaService {
  private readonly key: Buffer;
  constructor(private readonly db: DatabaseService, private readonly audit: AuditRepository) { this.key = mfaKey(); }

  async status(userId: string, session: any, roles: Role[]) {
    const factor = (await this.db.query('SELECT generation,enabled_at FROM account_authenticators WHERE user_id=$1', [userId])).rows[0];
    const privileged = roles.some(role => PRIVILEGED_ROLES.includes(role));
    // Existing non-production fictional fixtures have no enrolled authenticator.
    // Enrollment itself enables enforcement in every environment; production
    // always requires enrollment for authority roles. There is no production bypass.
    const required = privileged && (process.env.NODE_ENV === 'production' || !!factor?.enabled_at);
    const verified = !!factor?.enabled_at && !!session.mfa_verified_at && session.mfa_generation === factor.generation;
    return { required, eligible: privileged, enrolled: !!factor?.enabled_at, verified, generation: factor?.generation || 0 };
  }

  async enforce(userId: string, session: any, roles: Role[], method?: string, path?: string) {
    const status = await this.status(userId, session, roles);
    if (status.required && !status.verified && !isMfaBootstrapRequest(method || '', path || '')) {
      throw new ForbiddenException({ errorCode: 'MFA_REQUIRED', message: 'Authenticator verification is required. Open the security verification page.' });
    }
  }

  async execute(user: AuthenticatedUser, operation: 'enroll' | 'confirm' | 'verify' | 'recover', body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid verification request');
    const input = body as Record<string, unknown>;
    const allowed = operation === 'enroll' ? [] : ['code'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new BadRequestException('Unexpected verification field');
    if (operation !== 'enroll' && (typeof input.code !== 'string' || !(operation === 'recover' ? /^[a-f0-9]{32}$/ : /^\d{6}$/).test(input.code))) throw new BadRequestException('Invalid verification code format');

    const result = await this.db.transaction(async tx => {
      // Serialize all factor/session operations for this account before row locks.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('authenticator:' || $1::text))", [user.id]);
      const account = (await tx.query('SELECT is_active,is_suspended,deleted_at FROM user_accounts WHERE id=$1', [user.id])).rows[0];
      const session = (await tx.query('SELECT * FROM user_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE', [user.sessionId, user.id])).rows[0];
      const roles = (await tx.query<{ role: Role }>('SELECT role FROM user_roles WHERE user_id=$1', [user.id])).rows.map(row => row.role);
      if (!account?.is_active || account.is_suspended || account.deleted_at || !session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || privilegedSessionExpired(roles, session.authenticated_at)) throw new UnauthorizedException('Fresh authentication required');
      if (!roles.some(role => PRIVILEGED_ROLES.includes(role))) throw new ForbiddenException('Authenticator enrollment is reserved for authority accounts');
      await tx.query('INSERT INTO account_authenticators(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user.id]);
      const factor = (await tx.query('SELECT * FROM account_authenticators WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
      if (factor.locked_until && new Date(factor.locked_until).getTime() > Date.now()) return { denied: true };
      if (factor.locked_until) { factor.failed_attempts = 0; await tx.query('UPDATE account_authenticators SET failed_attempts=0,locked_until=NULL WHERE user_id=$1', [user.id]); }
      if (operation === 'enroll') {
        if (factor.enabled_at) throw new ConflictException('Authenticator is already enrolled');
        const secret = crypto.randomBytes(20);
        await tx.query("UPDATE account_authenticators SET pending_ciphertext=$2,pending_session_id=$3,pending_expires_at=CURRENT_TIMESTAMP+INTERVAL '10 minutes' WHERE user_id=$1", [user.id, encryptSecret(secret, user.id, this.key), session.id]);
        await this.audit.appendAuditLog(AuditAction.UPDATE, 'account_authenticator', user.id, user.id, 'AUTHENTICATOR', null, { event: 'ENROLLMENT_STARTED' }, undefined, undefined, tx);
        const encoded = base32(secret);
        return { secret: encoded, uri: `otpauth://totp/${encodeURIComponent('Kashyap:' + user.id)}?secret=${encoded}&issuer=Kashyap&algorithm=SHA1&digits=6&period=30`, expiresIn: 600 };
      }
      let counter: number | null = null;
      let recoveryIndex = -1;
      let hashes: string[] = factor.recovery_hashes;
      if (operation === 'confirm') {
        if (factor.enabled_at || !factor.pending_ciphertext || factor.pending_session_id !== session.id || new Date(factor.pending_expires_at).getTime() <= Date.now()) throw new ConflictException('Enrollment expired or superseded; start again');
        counter = matchingCounter(decryptSecret(factor.pending_ciphertext, user.id, this.key), input.code as string, -1);
      } else {
        if (!factor.enabled_at || !factor.secret_ciphertext) throw new ConflictException('Enroll an authenticator first');
        if (operation === 'recover') {
          const candidate = Buffer.from(recoveryHash(input.code as string), 'hex');
          recoveryIndex = hashes.findIndex(hash => crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex')));
        } else counter = matchingCounter(decryptSecret(factor.secret_ciphertext, user.id, this.key), input.code as string, Number(factor.last_counter));
      }
      if (counter === null && recoveryIndex < 0) {
        await tx.query("UPDATE account_authenticators SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN CURRENT_TIMESTAMP+INTERVAL '15 minutes' ELSE NULL END WHERE user_id=$1", [user.id]);
        return { denied: true };
      }
      let recoveryCodes: string[] | undefined;
      let generation = factor.generation;
      if (operation === 'confirm') {
        recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString('hex'));
        hashes = recoveryCodes.map(recoveryHash); generation++;
        await tx.query('UPDATE account_authenticators SET secret_ciphertext=pending_ciphertext,pending_ciphertext=NULL,pending_session_id=NULL,pending_expires_at=NULL,enabled_at=CURRENT_TIMESTAMP,generation=$2,last_counter=$3,recovery_hashes=$4::jsonb,failed_attempts=0,locked_until=NULL WHERE user_id=$1', [user.id, generation, counter, JSON.stringify(hashes)]);
        // Re-enrollment/reset is intentionally not exposed through an OTP-only path.
        await tx.query('UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL', [user.id, session.id]);
      } else {
        if (recoveryIndex >= 0) hashes.splice(recoveryIndex, 1);
        await tx.query('UPDATE account_authenticators SET last_counter=COALESCE($2,last_counter),recovery_hashes=$3::jsonb,failed_attempts=0,locked_until=NULL WHERE user_id=$1', [user.id, counter, JSON.stringify(hashes)]);
      }
      await tx.query('UPDATE user_sessions SET mfa_verified_at=CURRENT_TIMESTAMP,mfa_generation=$2 WHERE id=$1', [session.id, generation]);
      await this.audit.appendAuditLog(AuditAction.UPDATE, 'account_authenticator', user.id, user.id, 'AUTHENTICATOR', null, { event: operation === 'confirm' ? 'ENROLLMENT_CONFIRMED' : operation === 'recover' ? 'RECOVERY_CODE_USED' : 'AUTHENTICATOR_VERIFIED', generation }, undefined, undefined, tx);
      return { success: true, ...(recoveryCodes ? { recoveryCodes } : {}) };
    });
    if ('denied' in result) throw new ForbiddenException('Verification failed or temporarily locked. Try again later.');
    return result;
  }
}
