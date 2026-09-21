import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import * as crypto from 'crypto';
import { AuditAction } from '@kashyap/contracts';

export interface AuditRecord {
  id: string;
  actor_id?: string;
  actor_role?: string;
  ip_address?: string;
  user_agent?: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  prev_record_hash: string;
  current_record_hash: string;
  created_at: string;
}

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getLatestRecord(client?: any): Promise<AuditRecord | null> {
    const query = 'SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1';
    const res = client
      ? await client.query(query)
      : await this.db.query<AuditRecord>(query);
    return res.rows[0] || null;
  }

  async appendAuditLog(
    action: AuditAction,
    entityType: string,
    entityId: string,
    actorId?: string,
    actorRole?: string,
    oldValue?: any,
    newValue?: any,
    ipAddress?: string,
    userAgent?: string,
    client?: any,
  ): Promise<AuditRecord> {
    const latest = await this.getLatestRecord(client);
    const prevHash = latest ? latest.current_record_hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const createdAt = new Date().toISOString();

    const dataToHash = JSON.stringify({
      action,
      entityType,
      entityId,
      actorId: actorId || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      prevRecordHash: prevHash,
      createdAt,
    });

    const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const sql = `INSERT INTO audit_logs (
        actor_id, actor_role, ip_address, user_agent, action, entity_type, entity_id,
        old_value, new_value, prev_record_hash, current_record_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`;
    const params = [
      actorId || null,
      actorRole || null,
      ipAddress || null,
      userAgent || null,
      action,
      entityType,
      entityId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      prevHash,
      currentHash,
      createdAt,
    ];

    const res = client
      ? await client.query(sql, params)
      : await this.db.query<AuditRecord>(sql, params);

    this.logger.log(`[SQL AUDIT] Logged ${action} on ${entityType}:${entityId} (Hash: ${currentHash.substring(0, 8)}...)`);
    return res.rows[0];
  }

  async listLogs(limit: number = 50): Promise<AuditRecord[]> {
    const res = await this.db.query<AuditRecord>(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return res.rows;
  }
}
