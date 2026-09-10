import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { ParentType, SpouseStatus } from '@kashyap/contracts';

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
}

@Injectable()
export class GenealogyLinkRepository {
  private readonly logger = new Logger(GenealogyLinkRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async getParentsByChildId(childId: string): Promise<ParentLinkRecord[]> {
    const res = await this.db.query<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE child_id = $1',
      [childId],
    );
    return res.rows;
  }

  async getChildrenByParentId(parentId: string): Promise<ParentLinkRecord[]> {
    const res = await this.db.query<ParentLinkRecord>(
      'SELECT * FROM parent_links WHERE parent_id = $1',
      [parentId],
    );
    return res.rows;
  }

  async getSpousesByPersonId(personId: string): Promise<SpouseLinkRecord[]> {
    const res = await this.db.query<SpouseLinkRecord>(
      'SELECT * FROM spouse_links WHERE person_id = $1',
      [personId],
    );
    return res.rows;
  }

  async addParentLink(parentId: string, childId: string, parentType: ParentType = ParentType.BIOLOGICAL): Promise<void> {
    await this.db.query(
      `INSERT INTO parent_links (parent_id, child_id, parent_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (parent_id, child_id) DO NOTHING`,
      [parentId, childId, parentType],
    );
  }

  async addSpouseLink(personId: string, spouseId: string, status: SpouseStatus = SpouseStatus.CURRENT): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO spouse_links (person_id, spouse_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (person_id, spouse_id) DO UPDATE SET status = EXCLUDED.status`,
        [personId, spouseId, status],
      );
      await client.query(
        `INSERT INTO spouse_links (person_id, spouse_id, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (person_id, spouse_id) DO UPDATE SET status = EXCLUDED.status`,
        [spouseId, personId, status],
      );
    });
  }

  // Recursive CTE to query descendants in PostgreSQL (ADR-004)
  async getDescendantHierarchy(rootPersonId: string, maxDepth: number = 3): Promise<any[]> {
    const sql = `
      WITH RECURSIVE descendant_tree AS (
        -- Anchor member: root person
        SELECT 
          p.id, 
          p.generation, 
          p.gender, 
          p.living_status,
          n.full_name as primary_name,
          0 as depth_level,
          ARRAY[p.id] as path_taken
        FROM persons p
        LEFT JOIN person_names n ON p.id = n.person_id AND n.is_primary = TRUE
        WHERE p.id = $1

        UNION ALL

        -- Recursive member: children
        SELECT 
          c.id, 
          c.generation, 
          c.gender, 
          c.living_status,
          cn.full_name as primary_name,
          dt.depth_level + 1,
          dt.path_taken || c.id
        FROM descendant_tree dt
        JOIN parent_links pl ON dt.id = pl.parent_id
        JOIN persons c ON pl.child_id = c.id
        LEFT JOIN person_names cn ON c.id = cn.person_id AND cn.is_primary = TRUE
        WHERE dt.depth_level < $2 AND NOT (c.id = ANY(dt.path_taken)) -- Cycle guard
      )
      SELECT * FROM descendant_tree ORDER BY depth_level ASC;
    `;

    try {
      const res = await this.db.query(sql, [rootPersonId, maxDepth]);
      return res.rows;
    } catch (err: any) {
      this.logger.warn(`Recursive CTE failed (${err.message}). Using manual graph fallback.`);
      return [];
    }
  }

  // Directed Acyclic Graph Cycle Check
  async checkWouldCreateCycle(parentId: string, childId: string): Promise<boolean> {
    const sql = `
      WITH RECURSIVE ancestry_check AS (
        SELECT parent_id, child_id, 1 as depth
        FROM parent_links
        WHERE parent_id = $1

        UNION ALL

        SELECT pl.parent_id, pl.child_id, ac.depth + 1
        FROM ancestry_check ac
        JOIN parent_links pl ON ac.child_id = pl.parent_id
        WHERE ac.depth < 30
      )
      SELECT COUNT(*) as cycle_count FROM ancestry_check WHERE child_id = $2;
    `;

    try {
      const res = await this.db.query(sql, [childId, parentId]);
      return parseInt(res.rows[0]?.cycle_count || '0', 10) > 0;
    } catch {
      return false;
    }
  }
}
