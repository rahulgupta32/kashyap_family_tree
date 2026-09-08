import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditAction } from '@kashyap/contracts';

export interface AuditEntry {
  id: string;
  actorId?: string;
  actorRole?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  prevRecordHash: string;
  currentRecordHash: string;
  createdAt: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private auditChain: AuditEntry[] = [];
  private lastHash = '0000000000000000000000000000000000000000000000000000000000000000';

  async record(
    action: AuditAction,
    entityType: string,
    entityId: string,
    actorId?: string,
    actorRole?: string,
    oldValue?: Record<string, any>,
    newValue?: Record<string, any>,
  ): Promise<AuditEntry> {
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const dataToHash = JSON.stringify({
      id,
      action,
      entityType,
      entityId,
      actorId,
      oldValue,
      newValue,
      prevRecordHash: this.lastHash,
      createdAt,
    });

    const currentRecordHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const entry: AuditEntry = {
      id,
      actorId,
      actorRole,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      prevRecordHash: this.lastHash,
      currentRecordHash,
      createdAt,
    };

    this.auditChain.push(entry);
    this.lastHash = currentRecordHash;

    this.logger.log(`[AUDIT] Action: ${action} on ${entityType}:${entityId} by ${actorId || 'SYSTEM'} (Hash: ${currentRecordHash.substring(0, 8)}...)`);
    return entry;
  }

  async listAuditLogs(): Promise<AuditEntry[]> {
    return this.auditChain;
  }

  // Audit Integrity & Cryptographic Chain Verification (ADR-011)
  verifyChainIntegrity(): { isValid: boolean; corruptedAtIndex?: number } {
    let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < this.auditChain.length; i++) {
      const entry = this.auditChain[i];

      // Check linkage with previous hash
      if (entry.prevRecordHash !== expectedPrevHash) {
        return { isValid: false, corruptedAtIndex: i };
      }

      // Recompute entry hash
      const dataToHash = JSON.stringify({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        prevRecordHash: entry.prevRecordHash,
        createdAt: entry.createdAt,
      });

      const recomputedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
      if (recomputedHash !== entry.currentRecordHash) {
        return { isValid: false, corruptedAtIndex: i };
      }

      expectedPrevHash = entry.currentRecordHash;
    }

    return { isValid: true };
  }
}
