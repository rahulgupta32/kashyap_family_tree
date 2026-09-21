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

  async markProcessed(id: string, client?: any): Promise<void> {
    const query = `UPDATE audit_outbox SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP WHERE id = $1;`;
    if (client) {
      await client.query(query, [id]);
    } else {
      await this.db.query(query, [id]);
    }
  }

  async markFailed(id: string, errorMessage: string, client?: any): Promise<void> {
    const query = `UPDATE audit_outbox SET status = 'FAILED', retry_count = retry_count + 1, last_error = $2 WHERE id = $1;`;
    if (client) {
      await client.query(query, [id, errorMessage]);
    } else {
      await this.db.query(query, [id, errorMessage]);
    }
  }

  /**
   * Process a single outbox entry inside an atomic transaction.
   * Locks the outbox row with SELECT ... FOR UPDATE, rechecks status to prevent
   * concurrent workers from double-processing, inserts into audit_logs, and marks
   * the entry PROCESSED within the same transaction.
   */
  async processOutboxEntry(
    entryId: string,
    auditRepo: AuditRepository,
    clientOverride?: any,
  ): Promise<boolean> {
    const runInTx = async (client: any): Promise<boolean> => {
      // 1. Lock and recheck the outbox row inside its processing transaction
      const lockRes = await client.query(
        `SELECT * FROM audit_outbox WHERE id = $1 FOR UPDATE;`,
        [entryId],
      );

      if (lockRes.rows.length === 0) {
        return false;
      }

      const lockedRow = lockRes.rows[0];

      // Recheck status: if another concurrent transaction already committed, skip cleanly
      if (lockedRow.status === 'PROCESSED') {
        this.logger.log(`Outbox entry ${entryId} already processed by concurrent transaction.`);
        return false;
      }

      // 2. Idempotency check: verify if an audit log for this outbox ID already exists
      const existing = await client.query(
        `SELECT id FROM audit_logs WHERE new_value->>'outboxId' = $1 LIMIT 1;`,
        [lockedRow.id],
      );

      if (existing.rows.length === 0) {
        const enrichedNewValue = {
          ...(typeof lockedRow.new_value === 'object' && lockedRow.new_value !== null ? lockedRow.new_value : {}),
          outboxId: lockedRow.id,
        };

        await auditRepo.appendAuditLog(
          lockedRow.action as AuditAction,
          lockedRow.entity_type,
          lockedRow.entity_id,
          lockedRow.actor_id || undefined,
          lockedRow.actor_role || undefined,
          lockedRow.old_value,
          enrichedNewValue,
          lockedRow.ip_address || undefined,
          lockedRow.user_agent || undefined,
          client,
        );
      } else {
        this.logger.log(`Skipping duplicate audit log for already processed outbox ID: ${lockedRow.id}`);
      }

      // 3. Atomically mark the outbox entry processed within the same transaction
      await this.markProcessed(lockedRow.id, client);
      return true;
    };

    if (clientOverride) {
      return runInTx(clientOverride);
    }
    return this.db.transaction(runInTx);
  }

  /**
   * Drain pending audit outbox entries into the immutable audit_logs table.
   * Concurrency-safe:
   * - Locks each outbox row with SELECT ... FOR UPDATE inside its processing transaction.
   * - Rechecks the locked row status to prevent concurrent workers from double-processing.
   * - Checks idempotency and atomically appends to audit_logs and marks the entry PROCESSED.
   * - Backed by database-enforced uniqueness on audit_logs(new_value->>'outboxId').
   */
  async drainOutbox(auditRepo: AuditRepository): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const pending = await this.getPendingEntries(100);
      for (const entry of pending) {
        try {
          const didProcess = await this.processOutboxEntry(entry.id, auditRepo);
          if (didProcess) {
            processed++;
          }
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
