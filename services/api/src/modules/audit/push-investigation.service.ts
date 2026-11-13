import { BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { requireOperationalReview } from '../auth/operational-review-access';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const needingReview = `d.channel='PUSH' AND d.delivery_status IN ('PENDING','PROCESSING','FAILED','RECONCILIATION_REQUIRED')
  AND (d.delivery_status IN ('FAILED','RECONCILIATION_REQUIRED') OR EXISTS(
    SELECT 1 FROM push_delivery_attempts a WHERE a.dispatch_id=d.id AND
      (a.status IN ('UNKNOWN','REJECTED') OR (a.status='SENDING' AND a.lease_expires_at<=clock_timestamp()))))`;

@Injectable()
export class PushInvestigationService {
  constructor(private readonly db: DatabaseService) {}

  private async review<T>(user: AuthenticatedUser, work: (tx: PoolClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async tx => { await requireOperationalReview(tx, user); return work(tx); });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Push investigation is unavailable');
    }
  }

  async list(user: AuthenticatedUser, query: Record<string, unknown> = {}) {
    if (Object.keys(query).some(k => !['limit', 'cursor'].includes(k))) throw new BadRequestException('Invalid investigation query');
    const limit = query.limit === undefined ? 20 :
      (typeof query.limit === 'string' && /^\d{1,2}$/.test(query.limit) ? Number(query.limit) : NaN);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new BadRequestException('limit must be 1..50');
    let after: string[] | null = null;
    if (query.cursor !== undefined) {
      if (typeof query.cursor !== 'string' || query.cursor.length > 80) throw new BadRequestException('Invalid investigation cursor');
      const parts = query.cursor.split('|');
      const parsed = Date.parse(parts[0]);
      if (parts.length !== 2 || !timestamp.test(parts[0]) || !Number.isFinite(parsed) ||
          new Date(parsed).toISOString().slice(0, 19) !== parts[0].slice(0, 19) || !uuid.test(parts[1])) {
        throw new BadRequestException('Invalid investigation cursor');
      }
      after = parts; // Preserve PostgreSQL microseconds; JS Date would round them away.
    }
    return this.review(user, async tx => {
      const rows = (await tx.query(`SELECT d.id,d.delivery_status,d.created_at,
        to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
        FROM notification_dispatches d WHERE ${needingReview}
        AND ($1::timestamptz IS NULL OR (d.created_at,d.id)>($1::timestamptz,$2::uuid))
        ORDER BY d.created_at,d.id LIMIT $3`, [after?.[0] ?? null, after?.[1] ?? null, limit + 1])).rows;
      const items = rows.slice(0, limit).map(r => ({ id: r.id, deliveryStatus: r.delivery_status, createdAt: r.created_at }));
      const last = rows[limit - 1];
      return { items, nextCursor: rows.length > limit ? `${last.cursor_time}|${last.id}` : null, acceptanceOnly: true };
    });
  }

  async detail(user: AuthenticatedUser, id: string) {
    if (typeof id !== 'string' || !uuid.test(id)) throw new BadRequestException('Invalid dispatch identifier');
    return this.review(user, async tx => {
      // Parent and device observations share a single statement snapshot.
      const row = (await tx.query(`SELECT d.id,d.delivery_status,d.created_at,
        COALESCE(a.attempts,'[]'::jsonb) AS attempts FROM notification_dispatches d
        LEFT JOIN LATERAL (SELECT jsonb_agg(x.evidence ORDER BY x.created_at,x.id) AS attempts FROM (
          SELECT a.id,a.created_at,jsonb_build_object('id',a.id,'status',a.status,
            'recordedOutcome',o.outcome,'observationRecorded',o.id IS NOT NULL,
            'effectiveOutcome',CASE WHEN a.status='UNKNOWN' AND o.outcome IS NOT NULL THEN o.outcome ELSE a.status END,
            'claimExpired',a.status='SENDING' AND COALESCE(a.lease_expires_at<=clock_timestamp(),false)) AS evidence
          FROM push_delivery_attempts a LEFT JOIN push_provider_observations o
            ON o.attempt_id=a.id AND o.claim_id=a.claim_id WHERE a.dispatch_id=d.id
          ORDER BY a.created_at,a.id LIMIT 51) x) a ON true WHERE d.id=$1 AND d.channel='PUSH'`, [id.toLowerCase()])).rows[0];
      if (!row) throw new NotFoundException('Push dispatch not found');
      if (row.attempts.length > 50) throw new ServiceUnavailableException('Push investigation is unavailable');
      return { id: row.id, deliveryStatus: row.delivery_status, createdAt: row.created_at,
        attempts: row.attempts, acceptanceOnly: true };
    });
  }
}
