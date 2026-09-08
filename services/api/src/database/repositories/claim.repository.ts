import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { ClaimStatus } from '@kashyap/contracts';

export interface ClaimRecord {
  id: string;
  target_person_id: string;
  claimant_user_id: string;
  status: ClaimStatus;
  relationship_description: string;
  known_family_members?: any;
  statement_of_truth: boolean;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
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
  created_at: string;
}

@Injectable()
export class ClaimRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<ClaimRecord | null> {
    const res = await this.db.query<ClaimRecord>('SELECT * FROM profile_claims WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async findActiveByPersonId(personId: string): Promise<ClaimRecord | null> {
    const res = await this.db.query<ClaimRecord>(
      `SELECT * FROM profile_claims 
       WHERE target_person_id = $1 AND status IN ('SUBMITTED', 'IN_REVIEW')
       LIMIT 1`,
      [personId],
    );
    return res.rows[0] || null;
  }

  async createClaim(
    data: Omit<ClaimRecord, 'id' | 'created_at' | 'updated_at'>,
    attachments: Array<{ mediaAssetId: string; documentType: string; description: string }>,
  ): Promise<ClaimRecord> {
    return this.db.transaction(async (client) => {
      const claimRes = await client.query<ClaimRecord>(
        `INSERT INTO profile_claims (
          target_person_id, claimant_user_id, status, relationship_description, known_family_members, statement_of_truth
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          data.target_person_id,
          data.claimant_user_id,
          data.status,
          data.relationship_description,
          JSON.stringify(data.known_family_members || []),
          data.statement_of_truth,
        ],
      );

      const claim = claimRes.rows[0];

      for (const att of attachments) {
        await client.query(
          `INSERT INTO claim_evidence_attachments (claim_id, media_asset_id, document_type, description)
           VALUES ($1, $2, $3, $4)`,
          [claim.id, att.mediaAssetId, att.documentType, att.description],
        );
      }

      return claim;
    });
  }

  async listAll(status?: ClaimStatus): Promise<ClaimRecord[]> {
    const sql = status
      ? 'SELECT * FROM profile_claims WHERE status = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM profile_claims ORDER BY created_at DESC';
    const params = status ? [status] : [];
    const res = await this.db.query<ClaimRecord>(sql, params);
    return res.rows;
  }

  async updateReview(
    claimId: string,
    status: ClaimStatus,
    reviewNotes: string,
    reviewedBy: string,
  ): Promise<ClaimRecord | null> {
    const res = await this.db.query<ClaimRecord>(
      `UPDATE profile_claims 
       SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, reviewNotes, reviewedBy, claimId],
    );
    return res.rows[0] || null;
  }
}
