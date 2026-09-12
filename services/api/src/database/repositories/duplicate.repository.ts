import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import {
  DuplicateCandidateStatus,
  DuplicateCandidateQueryDto,
  DuplicateDetectionSignals,
} from '@kashyap/contracts';
import { PoolClient } from 'pg';

export interface DuplicateCandidateRecord {
  id: string;
  person_a_id: string;
  person_b_id: string;
  confidence_score: number;
  detection_signals: DuplicateDetectionSignals;
  status: DuplicateCandidateStatus;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

export interface DuplicateMergeRecord {
  id: string;
  surviving_person_id: string;
  merged_person_id: string;
  audit_snapshot: any;
  executed_by: string;
  created_at: string;
}

@Injectable()
export class DuplicateRepository {
  private readonly logger = new Logger(DuplicateRepository.name);

  constructor(private readonly db: DatabaseService) {}

  private async executeQuery<T = any>(
    sql: string,
    params?: any[],
    client?: PoolClient,
  ): Promise<{ rows: T[]; rowCount?: number }> {
    if (client) {
      const res = await client.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? undefined };
    }
    const res = await this.db.query<T>(sql, params);
    return { rows: res.rows, rowCount: res.rowCount ?? undefined };
  }

  async findCandidate(personAId: string, personBId: string, client?: PoolClient): Promise<DuplicateCandidateRecord | null> {
    const [pA, pB] = [personAId, personBId].sort();
    const res = await this.executeQuery<DuplicateCandidateRecord>(
      'SELECT * FROM duplicate_candidates WHERE (person_a_id = $1 AND person_b_id = $2) OR (person_a_id = $2 AND person_b_id = $1)',
      [pA, pB],
      client,
    );
    return res.rows[0] || null;
  }

  async getCandidateById(id: string, client?: PoolClient): Promise<DuplicateCandidateRecord | null> {
    const res = await this.executeQuery<DuplicateCandidateRecord>(
      'SELECT * FROM duplicate_candidates WHERE id = $1',
      [id],
      client,
    );
    return res.rows[0] || null;
  }

  async createOrUpdateCandidate(
    personAId: string,
    personBId: string,
    score: number,
    signals: DuplicateDetectionSignals,
    client?: PoolClient,
  ): Promise<DuplicateCandidateRecord> {
    const [pA, pB] = [personAId, personBId].sort();

    const res = await this.executeQuery<DuplicateCandidateRecord>(
      `INSERT INTO duplicate_candidates (person_a_id, person_b_id, confidence_score, detection_signals, status)
       VALUES ($1, $2, $3, $4, 'DETECTED')
       ON CONFLICT (person_a_id, person_b_id)
       DO UPDATE SET 
         confidence_score = EXCLUDED.confidence_score,
         detection_signals = EXCLUDED.detection_signals
       RETURNING *`,
      [pA, pB, score, JSON.stringify(signals)],
      client,
    );
    return res.rows[0];
  }

  async listCandidates(
    query: DuplicateCandidateQueryDto,
    client?: PoolClient,
  ): Promise<{ items: DuplicateCandidateRecord[]; total: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${paramIdx++}`);
    } else {
      conditions.push(`status IN ('DETECTED', 'UNDER_REVIEW')`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await this.executeQuery(
      `SELECT COUNT(*) as total FROM duplicate_candidates ${whereClause}`,
      params,
      client,
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const queryParams = [...params, limit, offset];
    const dataRes = await this.executeQuery<DuplicateCandidateRecord>(
      `SELECT * FROM duplicate_candidates 
       ${whereClause} 
       ORDER BY confidence_score DESC, created_at DESC 
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      queryParams,
      client,
    );

    return {
      items: dataRes.rows,
      total,
    };
  }

  async updateCandidateStatus(
    id: string,
    status: DuplicateCandidateStatus,
    notes?: string,
    reviewerId?: string,
    client?: PoolClient,
  ): Promise<DuplicateCandidateRecord | null> {
    const res = await this.executeQuery<DuplicateCandidateRecord>(
      `UPDATE duplicate_candidates 
       SET status = $1, review_notes = COALESCE($2, review_notes), reviewed_by = COALESCE($3, reviewed_by), reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4 
       RETURNING *`,
      [status, notes || null, reviewerId || null, id],
      client,
    );
    return res.rows[0] || null;
  }

  async markCandidatesAsMerged(mergedPersonId: string, client: PoolClient): Promise<void> {
    await client.query(
      `UPDATE duplicate_candidates 
       SET status = 'MERGED', reviewed_at = CURRENT_TIMESTAMP 
       WHERE (person_a_id = $1 OR person_b_id = $1) AND status != 'NOT_A_DUPLICATE'`,
      [mergedPersonId],
    );
  }

  async recordMerge(
    survivingPersonId: string,
    mergedPersonId: string,
    auditSnapshot: any,
    executedBy: string,
    client: PoolClient,
  ): Promise<DuplicateMergeRecord> {
    const res = await client.query<DuplicateMergeRecord>(
      `INSERT INTO duplicate_merges (surviving_person_id, merged_person_id, audit_snapshot, executed_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [survivingPersonId, mergedPersonId, JSON.stringify(auditSnapshot), executedBy],
    );
    return res.rows[0];
  }

  async findMergeByMergedId(mergedId: string, client?: PoolClient): Promise<DuplicateMergeRecord | null> {
    const res = await this.executeQuery<DuplicateMergeRecord>(
      'SELECT * FROM duplicate_merges WHERE merged_person_id = $1',
      [mergedId],
      client,
    );
    return res.rows[0] || null;
  }

  async findMergeBySurvivingId(survivingId: string, client?: PoolClient): Promise<DuplicateMergeRecord[]> {
    const res = await this.executeQuery<DuplicateMergeRecord>(
      'SELECT * FROM duplicate_merges WHERE surviving_person_id = $1 ORDER BY created_at DESC',
      [survivingId],
      client,
    );
    return res.rows;
  }

  /**
   * Evaluates potential duplicates in DB for a given candidate person
   */
  async findPotentialDuplicateMatches(
    name: string,
    branchId?: string,
    birthYearBs?: number,
    excludePersonId?: string,
    client?: PoolClient,
  ): Promise<Array<{ person_id: string; score: number; signals: DuplicateDetectionSignals }>> {
    const params: any[] = [name.trim()];
    let paramIdx = 2;

    let branchCondition = '';
    if (branchId) {
      params.push(branchId);
      branchCondition = `AND p.branch_id = $${paramIdx++}`;
    }

    let excludeCondition = '';
    if (excludePersonId) {
      params.push(excludePersonId);
      excludeCondition = `AND p.id != $${paramIdx++}`;
    }

    const sql = `
      SELECT 
        p.id,
        p.generation,
        p.gender,
        p.branch_id,
        p.birth_year_bs,
        p.birth_place,
        n.full_name as matched_name,
        similarity(n.full_name, $1) as name_sim
      FROM persons p
      JOIN person_names n ON p.id = n.person_id
      WHERE p.is_archived = FALSE
        AND (similarity(n.full_name, $1) > 0.45 OR n.full_name ILIKE '%' || $1 || '%')
        ${branchCondition}
        ${excludeCondition}
      LIMIT 25;
    `;

    const res = await this.executeQuery(sql, params, client);
    const matches: Array<{ person_id: string; score: number; signals: DuplicateDetectionSignals }> = [];

    for (const row of res.rows) {
      let score = parseFloat(row.name_sim || '0.5');
      const reasons: string[] = [`Name similarity: ${(score * 100).toFixed(0)}%`];
      let birthDiff: number | undefined = undefined;

      // Check birth year proximity
      if (birthYearBs && row.birth_year_bs) {
        birthDiff = Math.abs(birthYearBs - row.birth_year_bs);
        if (birthDiff === 0) {
          score += 0.25;
          reasons.push('Exact birth year match');
        } else if (birthDiff <= 2) {
          score += 0.15;
          reasons.push(`Birth year within ${birthDiff} years`);
        } else if (birthDiff > 10) {
          score -= 0.3;
          reasons.push(`Birth year difference too large (${birthDiff} years)`);
        }
      }

      // Check branch match
      const sameBranch = Boolean(branchId && row.branch_id === branchId);
      if (sameBranch) {
        score += 0.15;
        reasons.push('Same family branch');
      }

      const clampedScore = Math.min(0.99, Math.max(0.1, score));

      if (clampedScore >= 0.55) {
        matches.push({
          person_id: row.id,
          score: parseFloat(clampedScore.toFixed(2)),
          signals: {
            nameSimilarity: parseFloat((parseFloat(row.name_sim || '0.5')).toFixed(2)),
            matchingNames: [row.matched_name],
            birthYearDiff: birthDiff,
            sameBranch,
            sharedParentsCount: 0,
            reasons,
          },
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }
}
