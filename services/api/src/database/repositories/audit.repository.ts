import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database.service';
import * as crypto from 'crypto';
import { AuditAction } from '@kashyap/contracts';

export interface AuditRecord {
  id: string;
  actor_id?: string | null;
  actor_role?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  prev_record_hash: string;
  current_record_hash: string;
  created_at: string | Date;
  hash_version: number;
  chain_position: string | null;
}
const GENESIS = '0'.repeat(64);

// JSONB can reorder keys. Hash the canonical JSON value, not object insertion order.
export function canonicalAuditJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAuditJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalAuditJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function auditRecordHash(record: Omit<AuditRecord, 'current_record_hash' | 'chain_position'>): string {
  return crypto.createHash('sha256').update(canonicalAuditJson({
    version: record.hash_version, id: record.id, actorId: record.actor_id ?? null,
    actorRole: record.actor_role ?? null, ipAddress: record.ip_address ?? null,
    userAgent: record.user_agent ?? null, action: record.action,
    entityType: record.entity_type, entityId: record.entity_id,
    oldValue: record.old_value ?? null, newValue: record.new_value ?? null,
    prevRecordHash: record.prev_record_hash,
    createdAt: new Date(record.created_at).toISOString(),
  })).digest('hex');
}

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);
  constructor(private readonly db: DatabaseService) {}

  async getLatestRecord(client?: PoolClient): Promise<AuditRecord | null> {
    const res = await this.db.query<AuditRecord>(
      'SELECT * FROM audit_logs ORDER BY chain_position DESC NULLS LAST, created_at DESC, id DESC LIMIT 1',
      undefined, client,
    );
    return res.rows[0] || null;
  }

  async appendAuditLog(
    action: AuditAction, entityType: string, entityId: string,
    actorId?: string, actorRole?: string, oldValue?: any, newValue?: any,
    ipAddress?: string, userAgent?: string, client?: PoolClient,
  ): Promise<AuditRecord> {
    const append = async (tx: PoolClient) => {
      // The transaction owns the lock through COMMIT/ROLLBACK. Independent
      // processes, direct writes and outbox drains use the same lock and client.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('kashyap_audit_chain'))");
      const latest = await this.getLatestRecord(tx);
      const ip = ipAddress ? (await tx.query('SELECT host($1::inet) AS ip', [ipAddress])).rows[0].ip : null;
      const record = {
        id: crypto.randomUUID(), action, entity_type: entityType, entity_id: entityId,
        actor_id: actorId?.toLowerCase() || null, actor_role: actorRole || null,
        ip_address: ip, user_agent: userAgent || null,
        old_value: JSON.parse(JSON.stringify(oldValue ?? null)),
        new_value: JSON.parse(JSON.stringify(newValue ?? null)),
        prev_record_hash: latest?.current_record_hash || GENESIS,
        created_at: new Date().toISOString(), hash_version: 2,
      };
      const hash = auditRecordHash(record);
      const res = await tx.query<AuditRecord>(`INSERT INTO audit_logs (
        id,actor_id,actor_role,ip_address,user_agent,action,entity_type,entity_id,
        old_value,new_value,prev_record_hash,current_record_hash,created_at,hash_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,2) RETURNING *`, [
        record.id, record.actor_id, record.actor_role, ip, record.user_agent, action, entityType, entityId,
        JSON.stringify(record.old_value), JSON.stringify(record.new_value), record.prev_record_hash, hash, record.created_at,
      ]);
      this.logger.log(`[SQL AUDIT] Logged ${action} on ${entityType}:${entityId}`);
      return res.rows[0];
    };
    return client ? append(client) : this.db.transaction(append);
  }

  async verifyIntegrity() {
    const tx = await this.db.getClient();
    try {
      await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // Legacy hashes used insertion-order JSON before JSONB storage. Rewriting
      // those records to make verification pass would erase historical evidence.
      const legacy = await tx.query('SELECT count(*)::int AS count FROM audit_logs WHERE chain_position IS NULL');
      let legacyRecords = legacy.rows[0].count as number;
      const anchor = await tx.query('SELECT current_record_hash FROM audit_logs WHERE chain_position IS NULL ORDER BY created_at DESC,id DESC LIMIT 1');
      let previous = anchor.rows[0]?.current_record_hash || GENESIS;
      let cursor = '0', verifiedRecords = 0;
      let broken: { recordId: string; reason: string } | null = null;
      while (!broken) {
        const result = await tx.query<AuditRecord>(`SELECT *,host(ip_address) AS ip_address FROM audit_logs
          WHERE chain_position>$1 ORDER BY chain_position LIMIT 500`, [cursor]);
        if (!result.rows.length) break;
        for (const row of result.rows) {
          if (row.prev_record_hash !== previous) { broken = { recordId: row.id, reason: 'PREDECESSOR_MISMATCH' }; break; }
          if (row.hash_version !== 2) legacyRecords++;
          else if (auditRecordHash(row) !== row.current_record_hash) { broken = { recordId: row.id, reason: 'DIGEST_MISMATCH' }; break; }
          else verifiedRecords++;
          previous = row.current_record_hash; cursor = row.chain_position!;
        }
      }
      await tx.query('COMMIT');
      return { status: broken ? 'BROKEN' : legacyRecords ? 'LEGACY_UNVERIFIED' : 'VERIFIED',
        verifiedRecords, legacyRecords, lastVerifiedPosition: cursor, headHash: previous, failure: broken };
    } catch (err) { await tx.query('ROLLBACK'); throw err; }
    finally { tx.release(); }
  }

  async listLogs(limit = 50): Promise<AuditRecord[]> {
    return (await this.db.query<AuditRecord>('SELECT * FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT $1', [limit])).rows;
  }
}
