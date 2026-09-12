import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { ParentType, SpouseStatus } from '@kashyap/contracts';
import { PoolClient } from 'pg';

export interface ParentLinkRecord {
  id: string;
  parent_id: string;
  child_id: string;
  parent_type: ParentType;
  confidence: string;
}

export interface SpouseLinkRecord {
  id: string;
  person_id: string;
  spouse_id: string;
  status: SpouseStatus;
  marriage_date_bs?: string;
  marriage_date_ad?: string;
}

@Injectable()
export class GenealogyLinkRepository {
  private readonly logger = new Logger(GenealogyLinkRepository.name);

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

  /**
   * Acquires transaction-scoped advisory lock for graph mutation invariants (ADR-004 concurrency protection)
   */
  async acquireGraphMutationLock(client: PoolClient): Promise<void> {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('kashyap_lineage_graph'))");
  }

  async getParentsByChildId(childId: string, client?: PoolClient): Promise<ParentLinkRecord[]> {
    const res = await this.executeQuery<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE child_id = $1 ORDER BY created_at ASC',
      [childId],
      client,
    );
    return res.rows;
  }

  async getChildrenByParentId(parentId: string, client?: PoolClient): Promise<ParentLinkRecord[]> {
    const res = await this.executeQuery<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE parent_id = $1 ORDER BY created_at ASC',
      [parentId],
      client,
    );
    return res.rows;
  }

  async getSpousesByPersonId(personId: string, client?: PoolClient): Promise<SpouseLinkRecord[]> {
    const res = await this.executeQuery<SpouseLinkRecord>(
      'SELECT * FROM spouse_links WHERE person_id = $1 ORDER BY created_at ASC',
      [personId],
      client,
    );
    return res.rows;
  }

  async addParentLink(
    parentId: string,
    childId: string,
    parentType: ParentType = ParentType.BIOLOGICAL,
    client?: PoolClient,
  ): Promise<void> {
    const run = async (txClient: PoolClient) => {
      // 1. Acquire transaction graph lock to prevent concurrent cycle formation
      await this.acquireGraphMutationLock(txClient);

      // 2. Validate cycle invariant
      const wouldCycle = await this.checkWouldCreateCycle(parentId, childId, txClient);
      if (wouldCycle) {
        throw new Error('CYCLE_DETECTED');
      }

      await txClient.query(
        `INSERT INTO parent_links (parent_id, child_id, parent_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (parent_id, child_id) DO NOTHING`,
        [parentId, childId, parentType],
      );
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  async removeParentLink(parentId: string, childId: string, client?: PoolClient): Promise<boolean> {
    const run = async (txClient: PoolClient) => {
      await this.acquireGraphMutationLock(txClient);
      const res = await txClient.query(
        'DELETE FROM parent_links WHERE parent_id = $1 AND child_id = $2 RETURNING id',
        [parentId, childId],
      );
      return res.rowCount !== null && res.rowCount > 0;
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  async addSpouseLink(
    personId: string,
    spouseId: string,
    status: SpouseStatus = SpouseStatus.CURRENT,
    marriageDateBs?: string,
    client?: PoolClient,
  ): Promise<void> {
    const run = async (txClient: PoolClient) => {
      await this.acquireGraphMutationLock(txClient);

      await txClient.query(
        `INSERT INTO spouse_links (person_id, spouse_id, status, marriage_date_bs)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (person_id, spouse_id) 
         DO UPDATE SET status = EXCLUDED.status, marriage_date_bs = COALESCE(EXCLUDED.marriage_date_bs, spouse_links.marriage_date_bs)`,
        [personId, spouseId, status, marriageDateBs || null],
      );

      await txClient.query(
        `INSERT INTO spouse_links (person_id, spouse_id, status, marriage_date_bs)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (person_id, spouse_id) 
         DO UPDATE SET status = EXCLUDED.status, marriage_date_bs = COALESCE(EXCLUDED.marriage_date_bs, spouse_links.marriage_date_bs)`,
        [spouseId, personId, status, marriageDateBs || null],
      );
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  async removeSpouseLink(personId: string, spouseId: string, client?: PoolClient): Promise<boolean> {
    const run = async (txClient: PoolClient) => {
      await this.acquireGraphMutationLock(txClient);
      const res = await txClient.query(
        'DELETE FROM spouse_links WHERE (person_id = $1 AND spouse_id = $2) OR (person_id = $2 AND spouse_id = $1)',
        [personId, spouseId],
      );
      return res.rowCount !== null && res.rowCount > 0;
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  /**
   * Directed Acyclic Graph Cycle Check:
   * Checks if candidate parentId is already a descendant of childId (or vice versa)
   */
  async checkWouldCreateCycle(parentId: string, childId: string, client?: PoolClient): Promise<boolean> {
    if (parentId === childId) return true;

    const sql = `
      WITH RECURSIVE descendant_search AS (
        -- Anchor: direct children of childId
        SELECT pl.child_id as current_node, 1 as depth
        FROM parent_links pl
        WHERE pl.parent_id = $1 -- childId
        
        UNION ALL
        
        -- Recursive: children of current nodes
        SELECT pl.child_id, ds.depth + 1
        FROM parent_links pl
        JOIN descendant_search ds ON pl.parent_id = ds.current_node
        WHERE ds.depth < 50
      )
      SELECT COUNT(*) as cycle_count FROM descendant_search WHERE current_node = $2; -- parentId
    `;

    try {
      const res = await this.executeQuery(sql, [childId, parentId], client);
      const count = parseInt(res.rows[0]?.cycle_count || '0', 10);
      return count > 0;
    } catch (err: any) {
      this.logger.error(`Cycle check failed: ${err.message}`);
      return true; // Fail-closed on cycle detection error
    }
  }

  /**
   * Re-parents parent, child, and spouse links during governed duplicate merge
   */
  async migrateLinksForMerge(
    mergedPersonId: string,
    survivingPersonId: string,
    client: PoolClient,
  ): Promise<{ parentsMigrated: number; childrenMigrated: number; spousesMigrated: number }> {
    let parentsMigrated = 0;
    let childrenMigrated = 0;
    let spousesMigrated = 0;

    // 1. Migrate parent links where merged person was child (parent -> mergedPersonId)
    const parentsOfMerged = await client.query<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE child_id = $1',
      [mergedPersonId],
    );

    for (const pl of parentsOfMerged.rows) {
      if (pl.parent_id === survivingPersonId) {
        // Self parent link prohibited, remove
        await client.query('DELETE FROM parent_links WHERE id = $1', [pl.id]);
        continue;
      }

      // Check if surviving already has this parent
      const existing = await client.query(
        'SELECT id FROM parent_links WHERE parent_id = $1 AND child_id = $2',
        [pl.parent_id, survivingPersonId],
      );

      if (existing.rows.length > 0) {
        await client.query('DELETE FROM parent_links WHERE id = $1', [pl.id]);
      } else {
        await client.query(
          'UPDATE parent_links SET child_id = $1 WHERE id = $2',
          [survivingPersonId, pl.id],
        );
        parentsMigrated++;
      }
    }

    // 2. Migrate parent links where merged person was parent (mergedPersonId -> child)
    const childrenOfMerged = await client.query<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE parent_id = $1',
      [mergedPersonId],
    );

    for (const cl of childrenOfMerged.rows) {
      if (cl.child_id === survivingPersonId) {
        // Self child link prohibited, remove
        await client.query('DELETE FROM parent_links WHERE id = $1', [cl.id]);
        continue;
      }

      const existing = await client.query(
        'SELECT id FROM parent_links WHERE parent_id = $1 AND child_id = $2',
        [survivingPersonId, cl.child_id],
      );

      if (existing.rows.length > 0) {
        await client.query('DELETE FROM parent_links WHERE id = $1', [cl.id]);
      } else {
        await client.query(
          'UPDATE parent_links SET parent_id = $1 WHERE id = $2',
          [survivingPersonId, cl.id],
        );
        childrenMigrated++;
      }
    }

    // 3. Migrate spouse links
    const spousesOfMerged = await client.query<SpouseLinkRecord>(
      'SELECT * FROM spouse_links WHERE person_id = $1',
      [mergedPersonId],
    );

    // Remove direct link between merged and surviving if they were linked as spouses
    await client.query(
      'DELETE FROM spouse_links WHERE (person_id = $1 AND spouse_id = $2) OR (person_id = $2 AND spouse_id = $1)',
      [mergedPersonId, survivingPersonId],
    );

    for (const sl of spousesOfMerged.rows) {
      if (sl.spouse_id === survivingPersonId) continue;

      const existing = await client.query(
        'SELECT id FROM spouse_links WHERE person_id = $1 AND spouse_id = $2',
        [survivingPersonId, sl.spouse_id],
      );

      if (existing.rows.length > 0) {
        await client.query('DELETE FROM spouse_links WHERE id = $1', [sl.id]);
      } else {
        await client.query(
          'UPDATE spouse_links SET person_id = $1 WHERE id = $2',
          [survivingPersonId, sl.id],
        );
        // Also update reciprocal link
        await client.query(
          'UPDATE spouse_links SET spouse_id = $1 WHERE person_id = $2 AND spouse_id = $3',
          [survivingPersonId, sl.spouse_id, mergedPersonId],
        );
        spousesMigrated++;
      }
    }

    // Clean up any remaining dangling links for merged person
    await client.query('DELETE FROM parent_links WHERE parent_id = $1 OR child_id = $1', [mergedPersonId]);
    await client.query('DELETE FROM spouse_links WHERE person_id = $1 OR spouse_id = $1', [mergedPersonId]);

    return { parentsMigrated, childrenMigrated, spousesMigrated };
  }
}
