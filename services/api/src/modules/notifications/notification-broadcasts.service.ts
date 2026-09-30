import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, member, textField, uuid } from '../community/community-policy';
import { broadcastEligibility } from './broadcast-eligibility';

interface NoticeInput {
  requestId: string;
  title: string;
  body: string;
  scope: 'ALL' | 'BRANCH' | 'GENERATION';
  branchId: string | null;
  generation: number | null;
}

@Injectable()
export class NotificationBroadcastsService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository) {}

  private parse(body: any, sending: boolean): NoticeInput {
    allowedFields(body, ['requestId', 'title', 'body', 'scope', 'branchId', 'generation']);
    if (!['ALL', 'BRANCH', 'GENERATION'].includes(body.scope)) throw new BadRequestException('Invalid audience scope');
    const scope = body.scope as NoticeInput['scope'];
    const branchId = body.branchId === undefined ? null : uuid(body.branchId, 'branchId');
    const generation = body.generation === undefined ? null : body.generation;
    if ((scope === 'ALL' && (branchId || generation !== null)) ||
      (scope === 'BRANCH' && (!branchId || generation !== null)) ||
      (scope === 'GENERATION' && (!Number.isInteger(generation) || generation! < 1 || generation! > 100))) {
      throw new BadRequestException('Scope requires a branch or generation with no extra fields');
    }
    return {
      requestId: sending ? uuid(body.requestId, 'requestId') : '',
      title: sending ? textField(body.title, 'Title', 180) : '',
      body: sending ? textField(body.body, 'Notice', 4000) : '',
      scope, branchId, generation,
    };
  }

  // Recheck current database roles at the point of use, including before returning
  // an idempotent response. Session role claims are never authority for a send.
  private async authorize(user: AuthenticatedUser, input: NoticeInput, client?: any): Promise<void> {
    const authority = await this.db.query(`SELECT
      EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role IN ('SUPER_ADMIN','CENTRAL_ADMIN')) AS global_admin,
      EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='BRANCH_ADMIN' AND branch_id=$2) AS branch_admin`,
      [user.id, input.branchId], client);
    if (!authority.rows[0].global_admin && (!input.branchId || !authority.rows[0].branch_admin)) {
      throw new ForbiddenException('Broadcast authority for this audience is required');
    }
    if (input.branchId) {
      const exists = await this.db.query('SELECT 1 FROM branches WHERE id=$1', [input.branchId], client);
      if (!exists.rows.length) throw new BadRequestException('Unknown branch');
    }
  }

  private readonly audienceSql = `FROM user_accounts u JOIN notification_broadcasts b ON b.id=$1
    WHERE ${broadcastEligibility()}`;

  async preview(user: AuthenticatedUser, body: any) {
    const input = this.parse(body, false);
    await this.authorize(user, input);
    const result = await this.db.query(`SELECT count(*)::int AS count FROM
      (VALUES($1::varchar,$2::uuid,$3::int)) AS b(scope,branch_id,generation)
      CROSS JOIN user_accounts u WHERE ${broadcastEligibility()}`,
      [input.scope, input.branchId, input.generation]);
    return { recipientCount: result.rows[0].count, scope: input.scope, branchId: input.branchId, generation: input.generation };
  }

  async send(user: AuthenticatedUser, body: any) {
    const input = this.parse(body, true);
    return this.db.transaction(async client => {
      await this.authorize(user, input, client);
      const inserted = await client.query(`INSERT INTO notification_broadcasts
        (created_by_user_id,request_id,title,body,scope,branch_id,generation)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(created_by_user_id,request_id) DO NOTHING RETURNING id`,
        [user.id, input.requestId, input.title, input.body, input.scope, input.branchId, input.generation]);
      if (!inserted.rows.length) {
        const old = (await client.query('SELECT * FROM notification_broadcasts WHERE created_by_user_id=$1 AND request_id=$2',
          [user.id, input.requestId])).rows[0];
        if (!old || old.title !== input.title || old.body !== input.body || old.scope !== input.scope ||
          old.branch_id !== input.branchId || old.generation !== input.generation) {
          throw new ConflictException('requestId has already been used for a different notice');
        }
        const count = (await client.query('SELECT count(*)::int AS count FROM notification_broadcast_recipients WHERE broadcast_id=$1',
          [old.id])).rows[0].count;
        return { id: old.id, recipientCount: count, alreadySent: true };
      }
      const id = inserted.rows[0].id;
      const recipients = await client.query(`INSERT INTO notification_broadcast_recipients(broadcast_id,user_id)
        SELECT $1,u.id ${this.audienceSql} RETURNING user_id`, [id]);
      if (!recipients.rowCount) throw new BadRequestException('No currently eligible recipients in this audience');
      await this.audit.recordAuditIntent({ action: 'NOTIFICATION_BROADCAST_CREATED', entityType: 'NOTIFICATION_BROADCAST',
        entityId: id, actorId: user.id, newValue: { scope: input.scope, branchId: input.branchId,
          generation: input.generation, recipientCount: recipients.rowCount } }, client);
      return { id, recipientCount: recipients.rowCount, alreadySent: false };
    });
  }

  private readonly visibleSql = `FROM notification_broadcasts b
    JOIN user_accounts u ON u.id=$1
    WHERE u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL AND (
      (${broadcastEligibility()} AND EXISTS(SELECT 1 FROM notification_broadcast_recipients r
        WHERE r.broadcast_id=b.id AND r.user_id=u.id))
      OR (b.created_by_user_id=u.id AND (
        EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=u.id AND role.role IN ('SUPER_ADMIN','CENTRAL_ADMIN'))
        OR (b.branch_id IS NOT NULL AND EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=u.id
          AND role.role='BRANCH_ADMIN' AND role.branch_id=b.branch_id)))))`;

  async list(user: AuthenticatedUser) {
    member(user);
    const rows = await this.db.query(`SELECT b.id,b.title,b.scope,b.branch_id,b.generation,b.created_at
      ${this.visibleSql} ORDER BY b.created_at DESC,b.id DESC LIMIT 50`, [user.id]);
    return rows.rows.map(row => ({ id: row.id, title: row.title, scope: row.scope,
      branchId: row.branch_id, generation: row.generation, createdAt: row.created_at }));
  }

  async detail(user: AuthenticatedUser, id: string) {
    member(user);
    const rows = await this.db.query(`SELECT b.id,b.title,b.body,b.scope,b.branch_id,b.generation,b.created_at
      ${this.visibleSql} AND b.id=$2`, [user.id, uuid(id)]);
    if (!rows.rows.length) throw new NotFoundException('Notice not found');
    const b = rows.rows[0];
    return { id: b.id, title: b.title, body: b.body, scope: b.scope, branchId: b.branch_id,
      generation: b.generation, createdAt: b.created_at };
  }
}
