import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { privilegedSessionExpired } from '../auth/privileged-session.policy';
import { sealPushToken } from './push-token.crypto';

export function pushTokenInput(body: unknown): { token: string; platform: 'ANDROID' | 'IOS' } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid push registration.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['token','platform'].includes(key)) ||
    typeof input.token !== 'string' || !/^[A-Za-z0-9_:.-]{16,500}$/.test(input.token) ||
    !['ANDROID','IOS'].includes(input.platform as string)) throw new BadRequestException('Invalid push registration.');
  return { token: input.token, platform: input.platform as 'ANDROID' | 'IOS' };
}

@Injectable()
export class PushTokensService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository) {}

  private async account(client: PoolClient, userId: string) {
    const result = await client.query(`SELECT id FROM user_accounts WHERE id=$1 AND is_active
      AND NOT is_suspended AND deleted_at IS NULL FOR SHARE`, [userId]);
    if (!result.rows.length) throw new UnauthorizedException();
  }

  private async family(client: PoolClient, user: AuthenticatedUser): Promise<string> {
    const row = (await client.query('SELECT session_family_id FROM user_sessions WHERE id=$1 AND user_id=$2', [user.sessionId,user.id])).rows[0];
    if (!row) throw new UnauthorizedException();
    return row.session_family_id;
  }

  private async lockFamilies(client: PoolClient, families: string[]) {
    for (const family of [...new Set(families)].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['session-family:'+family]);
    }
  }

  private async authorize(client: PoolClient, user: AuthenticatedUser, family: string) {
    const session = (await client.query(`SELECT *, clock_timestamp() AS now FROM user_sessions
      WHERE id=$1 AND user_id=$2 AND session_family_id=$3 FOR SHARE`, [user.sessionId,user.id,family])).rows[0];
    const roles = (await client.query('SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE', [user.id])).rows.map(row=>row.role);
    if (!session || session.revoked_at || session.owner_revoked_at || new Date(session.expires_at)<=new Date(session.now) ||
      privilegedSessionExpired(roles,session.authenticated_at,new Date(session.now).getTime())) throw new UnauthorizedException();
    return session;
  }

  private metadata(row: any) {
    return { id: row.id, platform: row.platform, generation: row.generation, expiresAt: row.expires_at };
  }

  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof HttpException && error.getStatus()<500) throw error;
      throw new ServiceUnavailableException('Push registration could not be confirmed. Refresh before retrying.');
    }
  }

  async register(user: AuthenticatedUser, body: unknown) {
    const { token, platform } = pushTokenInput(body);
    const hash = createHash('sha256').update(token).digest('hex');
    return this.guarded(()=>this.db.transaction(async client=>{
      await this.account(client,user.id);
      // Serialize competing owners of a token before reading its binding.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['push-token:'+hash]);
      const family = await this.family(client,user);
      let prior = (await client.query('SELECT * FROM push_token_registrations WHERE token_hash=$1', [hash])).rows[0];
      await this.lockFamilies(client, [family,...(prior ? [prior.session_family_id] : [])]);
      // Removal/rotation may have committed while waiting for the family lock.
      prior = (await client.query('SELECT * FROM push_token_registrations WHERE token_hash=$1 FOR UPDATE', [hash])).rows[0];
      const session = await this.authorize(client,user,family);
      if (session.device_platform.toUpperCase()!==platform) throw new BadRequestException('Push platform must match this session.');
      if (prior && (prior.user_id!==user.id || prior.session_family_id!==family)) {
        const active = (await client.query(`SELECT 1 FROM user_sessions WHERE user_id=$1 AND session_family_id=$2
          AND revoked_at IS NULL AND owner_revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1`, [prior.user_id,prior.session_family_id])).rows.length;
        const expired = new Date(prior.expires_at)<=new Date(session.now);
        if (active && !expired) throw new ConflictException('Push registration is unavailable.');
        await client.query('DELETE FROM push_token_registrations WHERE id=$1', [prior.id]);
        await this.audit.recordAuditIntent({ action:'PUSH_TOKEN_RETIRED',entityType:'push_token_registrations',entityId:prior.id,
          actorId:prior.user_id,actorRole:'SYSTEM',newValue:{reason:expired?'EXPIRED':'SESSION_ENDED'} },client);
      }
      const current = (await client.query('SELECT id FROM push_token_registrations WHERE user_id=$1 AND session_family_id=$2 FOR UPDATE', [user.id,family])).rows[0];
      const id = current?.id || randomUUID(), generation = randomUUID();
      const context = JSON.stringify([id,user.id,family,platform,generation]);
      const envelope = sealPushToken(token,context);
      const row = (await client.query(`INSERT INTO push_token_registrations
        (id,user_id,session_family_id,platform,token_hash,token_envelope,generation,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP+INTERVAL '30 days')
        ON CONFLICT(user_id,session_family_id) DO UPDATE SET platform=EXCLUDED.platform,token_hash=EXCLUDED.token_hash,
          token_envelope=EXCLUDED.token_envelope,generation=EXCLUDED.generation,
          updated_at=CURRENT_TIMESTAMP,expires_at=EXCLUDED.expires_at RETURNING *`, [id,user.id,family,platform,hash,envelope,generation])).rows[0];
      await this.audit.recordAuditIntent({action:current?'PUSH_TOKEN_ROTATED':'PUSH_TOKEN_REGISTERED',entityType:'push_token_registrations',
        entityId:id,actorId:user.id,actorRole:'USER',newValue:{platform,outcome:'ACTIVE'}},client);
      return this.metadata(row);
    }));
  }

  async current(user: AuthenticatedUser) {
    return this.guarded(()=>this.db.transaction(async client=>{
      await this.account(client,user.id);
      const family = await this.family(client,user);
      await this.lockFamilies(client,[family]);
      await this.authorize(client,user,family);
      const row = (await client.query(`SELECT id,platform,generation,expires_at FROM push_token_registrations
        WHERE user_id=$1 AND session_family_id=$2 AND expires_at>CURRENT_TIMESTAMP`, [user.id,family])).rows[0];
      return { registration:row ? this.metadata(row) : null };
    }));
  }

  async remove(user: AuthenticatedUser) {
    return this.guarded(()=>this.db.transaction(async client=>{
      await this.account(client,user.id);
      const family = await this.family(client,user);
      await this.lockFamilies(client,[family]);
      await this.authorize(client,user,family);
      const row = (await client.query('DELETE FROM push_token_registrations WHERE user_id=$1 AND session_family_id=$2 RETURNING id', [user.id,family])).rows[0];
      if (row) await this.audit.recordAuditIntent({action:'PUSH_TOKEN_REMOVED',entityType:'push_token_registrations',
        entityId:row.id,actorId:user.id,actorRole:'USER',newValue:{outcome:'REMOVED'}},client);
      return { success:true };
    }));
  }

  /** Internal provider adapter only. A late invalid-token result cannot remove a newer generation. */
  async invalidate(id: string, generation: string) {
    return this.guarded(()=>this.db.transaction(async client=>{
      const row = (await client.query('DELETE FROM push_token_registrations WHERE id=$1 AND generation=$2 RETURNING id,user_id', [id,generation])).rows[0];
      if (row) await this.audit.recordAuditIntent({action:'PUSH_TOKEN_INVALIDATED',entityType:'push_token_registrations',
        entityId:row.id,actorId:row.user_id,actorRole:'SYSTEM',newValue:{reason:'PROVIDER_INVALID_TOKEN'}},client);
      return { invalidated:!!row };
    }));
  }

  /** Bounded retention cleanup, coordinated with refresh/revocation family locks. */
  async retireStale() {
    return this.guarded(()=>this.db.transaction(async client=>{
      const predicate = `r.expires_at<=CURRENT_TIMESTAMP OR NOT EXISTS (
        SELECT 1 FROM user_sessions s WHERE s.user_id=r.user_id AND s.session_family_id=r.session_family_id
        AND s.revoked_at IS NULL AND s.owner_revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP)`;
      const candidates = (await client.query(`SELECT r.id,r.session_family_id FROM push_token_registrations r
        WHERE ${predicate} ORDER BY r.expires_at,r.id LIMIT 50`)).rows;
      if (!candidates.length) return { retired:0 };
      await this.lockFamilies(client,candidates.map(row=>row.session_family_id));
      const rows = (await client.query(`DELETE FROM push_token_registrations r WHERE r.id=ANY($1::uuid[])
        AND (${predicate}) RETURNING r.id,r.user_id`, [candidates.map(row=>row.id)])).rows;
      for (const row of rows) await this.audit.recordAuditIntent({action:'PUSH_TOKEN_RETIRED',entityType:'push_token_registrations',
        entityId:row.id,actorId:row.user_id,actorRole:'SYSTEM',newValue:{reason:'STALE'}},client);
      return { retired:rows.length };
    }));
  }
}
