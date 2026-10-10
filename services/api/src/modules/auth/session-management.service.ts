import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { AuditAction, ErrorCode } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { privilegedSessionExpired } from './privileged-session.policy';

@Injectable()
export class SessionManagementService {
  private readonly logger = new Logger(SessionManagementService.name);
  constructor(private readonly db: DatabaseService, private readonly outbox: AuditOutboxRepository, private readonly audit: AuditRepository) {}
  private unavailable() { return new ServiceUnavailableException({ errorCode: ErrorCode.SERVICE_UNAVAILABLE, message: 'Session operation could not be confirmed. Refresh the device list before retrying.' }); }
  async list(userId: string, currentSessionId: string, cursor?: string) {
    try {
      let boundary: any;
      if (cursor) {
        boundary = (await this.db.query('SELECT created_at,id FROM user_sessions WHERE id=$1 AND user_id=$2', [cursor,userId])).rows[0];
        if (!boundary) throw new NotFoundException('Device page is unavailable. Refresh the list.');
      }
      const rows = (await this.db.query(`SELECT id,device_platform,device_name,created_at,authenticated_at,expires_at FROM user_sessions
        WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP
        ${boundary ? 'AND (created_at,id)<($2::timestamptz,$3::uuid)' : ''}
        ORDER BY created_at DESC,id DESC LIMIT 51`, boundary ? [userId,boundary.created_at,boundary.id] : [userId])).rows;
      return { items: rows.slice(0,50).map(row=>({ id:row.id, platform:row.device_platform,
        label:typeof row.device_name==='string'?row.device_name.slice(0,80):null,
        createdAt:row.created_at,authenticatedAt:row.authenticated_at,expiresAt:row.expires_at,isCurrent:row.id===currentSessionId })),
        nextCursor:rows.length>50?rows[49].id:null };
    } catch(error) { if(error instanceof NotFoundException)throw error;throw this.unavailable(); }
  }
  async revoke(userId: string, currentSessionId: string, targetId: string, ip: string, userAgent: string) {
    if(currentSessionId===targetId)throw new BadRequestException('Use sign out to end this device session.');
    let auditId: string|undefined;
    try {
      await this.db.transaction(async client=>{
        const account=(await client.query('SELECT id FROM user_accounts WHERE id=$1 AND is_active AND NOT is_suspended AND deleted_at IS NULL FOR SHARE',[userId])).rows[0];
        if(!account)throw new UnauthorizedException();
        const identities=(await client.query('SELECT id,session_family_id FROM user_sessions WHERE user_id=$1 AND id=ANY($2::uuid[])',[userId,[currentSessionId,targetId]])).rows;
        const families=[...new Set(identities.map(row=>row.session_family_id))].sort();
        for(const family of families)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['session-family:'+family]);
        // Stable ordering prevents cross-device revocation from locking these rows in opposite order.
        const rows=(await client.query(`SELECT * FROM user_sessions WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,[userId,[currentSessionId,targetId]])).rows;
        const caller=rows.find(row=>row.id===currentSessionId), target=rows.find(row=>row.id===targetId);
        const now=(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
        const roles=(await client.query('SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE',[userId])).rows.map(row=>row.role);
        if(!caller||caller.revoked_at||new Date(caller.expires_at)<=now||privilegedSessionExpired(roles,caller.authenticated_at,new Date(now).getTime()))throw new UnauthorizedException();
        if(!target)throw new NotFoundException('Device session is unavailable.');
        if(target.session_family_id===caller.session_family_id)throw new BadRequestException('Use sign out to end this device session.');
        const revoked=await client.query('UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),owner_revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND session_family_id=$2 AND owner_revoked_at IS NULL',[userId,target.session_family_id]);
        if(!revoked.rowCount)return; // Same-owner retry; no duplicate intent after a lost acknowledgement.
        auditId=(await this.outbox.recordAuditIntent({action:AuditAction.LOGOUT,entityType:'user_sessions',entityId:targetId,
          actorId:userId,actorRole:'USER',newValue:{scope:'OTHER_DEVICE',outcome:'SESSION_REVOKED'},ipAddress:ip,userAgent},client)).id;
      });
    } catch(error) {
      if(error instanceof UnauthorizedException||error instanceof NotFoundException||error instanceof BadRequestException)throw error;
      this.logger.error('OTHER_DEVICE_REVOCATION_COMMIT_UNCONFIRMED');throw this.unavailable();
    }
    if(auditId)try { await this.outbox.processOutboxEntry(auditId,this.audit); }
    catch { await this.outbox.markFailed(auditId,'SESSION_REVOCATION_AUDIT_DELIVERY_FAILED').catch(()=>{}); }
    return {success:true};
  }
}
