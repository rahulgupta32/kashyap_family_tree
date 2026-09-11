import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { AuditRepository } from './audit.repository';
import { AuditAction } from '@kashyap/contracts';

export interface AuditOutboxRecord {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  actor_role: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  user_agent: string | null;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  retry_count: number;
  last_error: string | null;
  created_at: Date;
  processed_at: Date | null;
}

@Injectable()
export class AuditOutboxRepository {
  private readonly logger = new Logger(AuditOutboxRepository.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Durably record audit intent in PostgreSQL so that even if immediate
   * audit delivery fails or the process restarts, the audit evidence is not lost.
   */
  async recordAuditIntent(
    data: {
      action: AuditAction | string;
      entityType: string;
      entityId: string;
      actorId?: string | null;
      actorRole?: string | null;
      oldValue?: any;
      newValue?: any;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    client?: any,
  ): Promise<AuditOutboxRecord> {
    const sql = `
      INSERT INTO audit_outbox (
        action, entity_type, entity_id, actor_id, actor_role,
        old_value, new_value, ip_address, user_agent, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
      RETURNING *;
    `;
    const params = [
      data.action,
      data.entityType,
      data.entityId,
      data.actorId || null,
      data.actorRole || null,
      data.oldValue ? JSON.stringify(data.oldValue) : null,
      data.newValue ? JSON.stringify(data.newValue) : null,
      data.ipAddress || null,
      data.userAgent || null,
    ];

    const res = client
      ? await client.query(sql, params)
      : await this.db.query<AuditOutboxRecord>(sql, params);

    return res.rows[0];
  }

  async getPendingEntries(limit = 50): Promise<AuditOutboxRecord[]> {
    const res = await this.db.query<AuditOutboxRecord>(
      `SELECT * FROM audit_outbox WHERE status IN ('PENDING', 'FAILED') AND retry_count < 10 ORDER BY created_at ASC LIMIT $1;`,
      [limit],
    );
    return res.rows;
  }

  async findByEntityId(entityId: string): Promise<AuditOutboxRecord[]> {
    const res = await this.db.query<AuditOutboxRecord>(
      `SELECT * FROM audit_outbox WHERE entity_id = $1 ORDER BY created_at DESC;`,
      [entityId],
    );
    return res.rows;
  }

  async markProcessed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE audit_outbox SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE id = $1;`,
      [id],
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `UPDATE audit_outbox SET status = 'FAILED', retry_count = retry_count + 1, last_error = $2 WHERE id = $1;`,
      [id, errorMessage],
    );
  }

  /**
   * Drain pending audit outbox entries into the immutable audit_logs table.
   */
  async drainOutbox(auditRepo: AuditRepository): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const pending = await this.getPendingEntries(100);
      for (const entry of pending) {
        try {
          await auditRepo.appendAuditLog(
            entry.action as AuditAction,
            entry.entity_type,
            entry.entity_id,
            entry.actor_id || undefined,
            entry.actor_role || undefined,
            entry.old_value,
            entry.new_value,
            entry.ip_address || undefined,
            entry.user_agent || undefined,
          );
          await this.markProcessed(entry.id);
          processed++;
        } catch (err: any) {
          failed++;
          this.logger.warn(`Failed to drain audit outbox entry ${entry.id}: ${err.message}`);
          await this.markFailed(entry.id, err.message);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error during audit outbox drain: ${err.message}`);
    }

    return { processed, failed };
  }
}
