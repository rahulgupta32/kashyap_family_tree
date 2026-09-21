import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database.service';
import { ClaimStatus, DisputeStatus } from '@kashyap/contracts';

export interface ClaimRecord {
  id: string;
  target_person_id: string;
  claimant_user_id: string;
  status: ClaimStatus;
  relationship_description: string;
  known_family_members?: any;
  statement_of_truth: boolean;
  tier1_reviewed_by?: string | null;
  tier1_reviewed_at?: string | null;
  tier1_decision?: string | null;
  tier1_notes?: string | null;
  tier2_reviewed_by?: string | null;
  tier2_reviewed_at?: string | null;
  tier2_decision?: string | null;
  tier2_notes?: string | null;
  correction_request_notes?: string | null;
  resubmission_count: number;
  version: number;
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimEvidenceRecord {
  id: string;
  claim_id: string;
  media_asset_id: string;
  document_type: string;
  sha256_hash?: string;
  description?: string;
  dispute_id?: string | null;
  created_at: string;
}

export interface ClaimDisputeRecord {
  id: string;
  claim_id: string;
  disputant_user_id: string;
  reason: string;
  status: DisputeStatus;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ClaimRepository {
  constructor(private readonly db: DatabaseService) {}

  private query<R = any>(text: string, params?: any[], client?: PoolClient) {
    if (client) {
      return client.query<R>(text, params);
    }
    return this.db.query<R>(text, params);
  }

  async findById(id: string, client?: PoolClient): Promise<ClaimRecord | null> {
    const res = await this.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1', [id], client);
    return res.rows[0] || null;
  }

  async findActiveByPersonId(personId: string, client?: PoolClient): Promise<ClaimRecord | null> {
    const res = await this.query<ClaimRecord>(
      `SELECT * FROM profile_claims 
       WHERE target_person_id = $1 
         AND status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED', 'DISPUTED')
       LIMIT 1`,
      [personId],
      client,
    );
    return res.rows[0] || null;
  }

  async findActiveByClaimantId(userId: string, client?: PoolClient): Promise<ClaimRecord | null> {
    const res = await this.query<ClaimRecord>(
      `SELECT * FROM profile_claims 
       WHERE claimant_user_id = $1 
         AND status IN ('PENDING_TIER1', 'PENDING_TIER2', 'CORRECTION_REQUESTED', 'RESUBMITTED', 'ESCALATED')
       LIMIT 1`,
      [userId],
      client,
    );
    return res.rows[0] || null;
  }

  async findEvidenceByClaimId(claimId: string, client?: PoolClient): Promise<ClaimEvidenceRecord[]> {
    const res = await this.query<ClaimEvidenceRecord>(
      'SELECT * FROM claim_evidence_attachments WHERE claim_id = $1 ORDER BY created_at ASC',
      [claimId],
      client,
    );
    return res.rows;
  }

  async findDisputesByClaimId(claimId: string, client?: PoolClient): Promise<ClaimDisputeRecord[]> {
    const res = await this.query<ClaimDisputeRecord>(
      'SELECT * FROM claim_disputes WHERE claim_id = $1 ORDER BY created_at DESC',
      [claimId],
      client,
    );
    return res.rows;
  }

  async findDisputeById(disputeId: string, client?: PoolClient): Promise<ClaimDisputeRecord | null> {
    const res = await this.query<ClaimDisputeRecord>('SELECT * FROM claim_disputes WHERE id = $1', [disputeId], client);
    return res.rows[0] || null;
  }

  async listAll(options?: {
    status?: ClaimStatus;
    claimantUserId?: string;
    branchId?: string;
  }): Promise<ClaimRecord[]> {
    let sql = `
      SELECT c.* FROM profile_claims c
      LEFT JOIN persons p ON c.target_person_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (options?.status) {
      sql += ` AND c.status = $${pIdx++}`;
      params.push(options.status);
    }
    if (options?.claimantUserId) {
      sql += ` AND c.claimant_user_id = $${pIdx++}`;
      params.push(options.claimantUserId);
    }
    if (options?.branchId) {
      sql += ` AND p.branch_id = $${pIdx++}`;
      params.push(options.branchId);
    }

    sql += ' ORDER BY c.created_at DESC';
    const res = await this.db.query<ClaimRecord>(sql, params);
    return res.rows;
  }
}