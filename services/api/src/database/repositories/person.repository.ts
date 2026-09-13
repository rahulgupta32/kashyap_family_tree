import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { Gender, LivingStatus, PrivacyVisibility, PersonSearchQueryDto, PersonSearchResponseDto, PersonSearchItemDto } from '@kashyap/contracts';
import { PoolClient } from 'pg';

export interface PersonRecord {
  id: string;
  branch_id?: string;
  generation: number;
  gender: Gender;
  living_status: LivingStatus;
  birth_year_bs?: number;
  birth_date_bs?: string;
  birth_date_ad?: string;
  birth_place?: string;
  death_year_bs?: number;
  death_date_bs?: string;
  death_date_ad?: string;
  death_place?: string;
  gotra: string;
  kuldevata?: string;
  mool_ghar?: string;
  current_address?: string;
  occupation?: string;
  education?: string;
  biography?: string;
  avatar_asset_id?: string;
  phone_visibility: PrivacyVisibility;
  address_visibility: PrivacyVisibility;
  dob_visibility: PrivacyVisibility;
  is_minor_protected: boolean;
  is_claimed: boolean;
  claimed_user_id?: string;
  is_archived: boolean;
  archive_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PersonNameRecord {
  id: string;
  person_id: string;
  language: 'ne' | 'en';
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  is_primary: boolean;
  created_at?: string;
}

@Injectable()
export class PersonRepository {
  private readonly logger = new Logger(PersonRepository.name);

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

  async findById(id: string, includeArchived: boolean = false, client?: PoolClient): Promise<PersonRecord | null> {
    const sql = includeArchived
      ? 'SELECT * FROM persons WHERE id = $1'
      : 'SELECT * FROM persons WHERE id = $1 AND is_archived = FALSE';
    const res = await this.executeQuery<PersonRecord>(sql, [id], client);
    return res.rows[0] || null;
  }

  /**
   * Resolves canonical Person ID traversing any historical duplicate merge chains (DUP-FR-008)
   */
  async resolveCanonicalPerson(
    id: string,
    client?: PoolClient,
  ): Promise<{ person: PersonRecord | null; canonicalId: string; wasRedirected: boolean }> {
    let currentId = id;
    let depth = 0;
    let wasRedirected = false;

    while (depth < 10) {
      const res = await this.executeQuery<PersonRecord>('SELECT * FROM persons WHERE id = $1', [currentId], client);
      const person = res.rows[0];
      if (!person) {
        return { person: null, canonicalId: currentId, wasRedirected };
      }

      if (person.is_archived && person.archive_reason?.startsWith('MERGED_INTO:')) {
        const nextId = person.archive_reason.replace('MERGED_INTO:', '').trim();
        if (nextId && nextId !== currentId) {
          currentId = nextId;
          wasRedirected = true;
          depth++;
          continue;
        }
      }

      return { person, canonicalId: currentId, wasRedirected };
    }

    return { person: null, canonicalId: currentId, wasRedirected };
  }

  async findNamesByPersonId(personId: string, client?: PoolClient): Promise<PersonNameRecord[]> {
    const res = await this.executeQuery<PersonNameRecord>(
      'SELECT * FROM person_names WHERE person_id = $1 ORDER BY is_primary DESC, created_at ASC',
      [personId],
      client,
    );
    return res.rows;
  }

  async createPerson(
    data: Partial<PersonRecord>,
    names: Array<Omit<PersonNameRecord, 'id' | 'person_id'>>,
    client?: PoolClient,
  ): Promise<PersonRecord> {
    const run = async (txClient: PoolClient) => {
      const personRes = await txClient.query<PersonRecord>(
        `INSERT INTO persons (
          generation, gender, living_status, branch_id, birth_year_bs, birth_date_bs, birth_date_ad, birth_place,
          death_year_bs, death_date_bs, death_date_ad, death_place, gotra, kuldevata, mool_ghar, current_address,
          occupation, education, biography, phone_visibility, address_visibility, dob_visibility, is_minor_protected,
          is_claimed, claimed_user_id, is_archived, archive_reason, version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
          $24, $25, $26, $27, 1
        ) RETURNING *`,
        [
          data.generation || 1,
          data.gender || 'UNKNOWN',
          data.living_status || 'LIVING',
          data.branch_id || null,
          data.birth_year_bs || null,
          data.birth_date_bs || null,
          data.birth_date_ad || null,
          data.birth_place || null,
          data.death_year_bs || null,
          data.death_date_bs || null,
          data.death_date_ad || null,
          data.death_place || null,
          data.gotra || 'कश्यप',
          data.kuldevata || null,
          data.mool_ghar || null,
          data.current_address || null,
          data.occupation || null,
          data.education || null,
          data.biography || null,
          data.phone_visibility || 'VERIFIED_COMMUNITY',
          data.address_visibility || 'VERIFIED_COMMUNITY',
          data.dob_visibility || 'VERIFIED_COMMUNITY',
          data.is_minor_protected ?? false,
          data.is_claimed ?? false,
          data.claimed_user_id || null,
          data.is_archived ?? false,
          data.archive_reason || null,
        ],
      );

      const createdPerson = personRes.rows[0];

      for (const name of names) {
        await txClient.query(
          `INSERT INTO person_names (person_id, language, first_name, middle_name, last_name, full_name, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            createdPerson.id,
            name.language,
            name.first_name,
            name.middle_name || null,
            name.last_name,
            name.full_name,
            name.is_primary ?? true,
          ],
        );
      }

      return createdPerson;
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  async updatePerson(
    id: string,
    data: Partial<PersonRecord>,
    names?: Array<Omit<PersonNameRecord, 'id' | 'person_id'>>,
    expectedVersion?: number,
    client?: PoolClient,
  ): Promise<PersonRecord | null> {
    const run = async (txClient: PoolClient) => {
      // Check current version for stale-edit protection
      if (expectedVersion !== undefined) {
        const check = await txClient.query<PersonRecord>(
          'SELECT version FROM persons WHERE id = $1 FOR UPDATE',
          [id],
        );
        if (check.rows.length === 0 || check.rows[0].version !== expectedVersion) {
          return null; // Stale edit detected
        }
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, any> = {
        branch_id: data.branch_id,
        generation: data.generation,
        gender: data.gender,
        living_status: data.living_status,
        birth_year_bs: data.birth_year_bs,
        birth_date_bs: data.birth_date_bs,
        birth_date_ad: data.birth_date_ad,
        birth_place: data.birth_place,
        death_year_bs: data.death_year_bs,
        death_date_bs: data.death_date_bs,
        death_date_ad: data.death_date_ad,
        death_place: data.death_place,
        gotra: data.gotra,
        kuldevata: data.kuldevata,
        mool_ghar: data.mool_ghar,
        current_address: data.current_address,
        occupation: data.occupation,
        education: data.education,
        biography: data.biography,
        phone_visibility: data.phone_visibility,
        address_visibility: data.address_visibility,
        dob_visibility: data.dob_visibility,
        is_minor_protected: data.is_minor_protected,
        is_claimed: data.is_claimed,
        claimed_user_id: data.claimed_user_id,
        is_archived: data.is_archived,
        archive_reason: data.archive_reason,
      };

      for (const [col, val] of Object.entries(fieldMap)) {
        if (val !== undefined) {
          updateFields.push(`${col} = $${paramIdx++}`);
          values.push(val);
        }
      }

      updateFields.push(`version = version + 1`);
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const sql = `UPDATE persons SET ${updateFields.join(', ')} WHERE id = $${paramIdx} RETURNING *`;
      const res = await txClient.query<PersonRecord>(sql, values);
      const updated = res.rows[0];

      if (names && names.length > 0) {
        // If updating primary names, preserve existing as non-primary or overwrite
        await txClient.query('DELETE FROM person_names WHERE person_id = $1', [id]);
        for (const name of names) {
          await txClient.query(
            `INSERT INTO person_names (person_id, language, first_name, middle_name, last_name, full_name, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              name.language,
              name.first_name,
              name.middle_name || null,
              name.last_name,
              name.full_name,
              name.is_primary ?? true,
            ],
          );
        }
      }

      return updated;
    };

    if (client) {
      return run(client);
    }
    return this.db.transaction(run);
  }

  async archivePerson(id: string, reason: string, client?: PoolClient): Promise<PersonRecord | null> {
    const res = await this.executeQuery<PersonRecord>(
      `UPDATE persons 
       SET is_archived = TRUE, archive_reason = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [reason, id],
      client,
    );
    return res.rows[0] || null;
  }

  async searchPersons(filter: PersonSearchQueryDto, viewer?: any): Promise<PersonSearchResponseDto> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Apply visibility predicate consistently for both count and items
    const isSuperAdmin = viewer?.roles?.some((r: string) => r === 'SUPER_ADMIN' || r === 'CENTRAL_ADMIN');
    const branchAdminBranches: string[] = (viewer?.roleAssignments || [])
      .filter((ra: any) => (ra.role === 'BRANCH_ADMIN' || ra.role === 'BRANCH_VERIFIER') && ra.branchId)
      .map((ra: any) => ra.branchId as string);

    if (viewer?.branchIds) {
      for (const bId of viewer.branchIds) {
        if (viewer.roles?.includes('BRANCH_ADMIN') || viewer.roles?.includes('BRANCH_VERIFIER')) {
          if (!branchAdminBranches.includes(bId)) {
            branchAdminBranches.push(bId);
          }
        }
      }
    }

    if (isSuperAdmin && (filter as any).includeArchived) {
      // Super admin can search archived records when explicitly requested
    } else if (branchAdminBranches.length > 0 && (filter as any).includeArchived) {
      params.push(branchAdminBranches);
      conditions.push(`(p.is_archived = FALSE OR (p.is_archived = TRUE AND p.branch_id = ANY($${paramIdx++})))`);
    } else {
      // Regular users and guests only see active records
      conditions.push('p.is_archived = FALSE');
    }

    let searchScoreSql = '0.0 as similarity_score';

    if (filter.query && filter.query.trim()) {
      const q = filter.query.trim();
      const wild = `%${q}%`;
      params.push(wild);
      const wildParam = paramIdx++;
      params.push(q);
      const rawParam = paramIdx++;

      conditions.push(`(
        n.full_name ILIKE $${wildParam}
        OR similarity(n.full_name, $${rawParam}) > 0.2
        OR p.mool_ghar ILIKE $${wildParam}
        OR p.birth_place ILIKE $${wildParam}
      )`);

      searchScoreSql = `similarity(n.full_name, $${rawParam}) as similarity_score`;
    }

    if (filter.branchId) {
      params.push(filter.branchId);
      conditions.push(`p.branch_id = $${paramIdx++}`);
    }

    if (filter.generation !== undefined && filter.generation !== null) {
      params.push(filter.generation);
      conditions.push(`p.generation = $${paramIdx++}`);
    }

    if (filter.livingStatus) {
      params.push(filter.livingStatus);
      conditions.push(`p.living_status = $${paramIdx++}`);
    }

    if (filter.gender) {
      params.push(filter.gender);
      conditions.push(`p.gender = $${paramIdx++}`);
    }

    if (filter.moolGhar && filter.moolGhar.trim()) {
      params.push(`%${filter.moolGhar.trim()}%`);
      conditions.push(`p.mool_ghar ILIKE $${paramIdx++}`);
    }

    const whereClause = conditions.join(' AND ');

    // Count query for deterministic pagination
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM persons p
      JOIN person_names n ON p.id = n.person_id AND n.is_primary = TRUE
      WHERE ${whereClause}
    `;
    const countRes = await this.db.query(countSql, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Data query with deterministic ordering
    const queryParams = [...params, limit, offset];
    const dataSql = `
      SELECT DISTINCT ON (p.id)
        p.id,
        p.gender,
        p.living_status,
        p.generation,
        p.branch_id,
        p.birth_year_bs,
        p.death_year_bs,
        p.mool_ghar,
        p.is_claimed,
        p.version,
        n.full_name as primary_name_nepali,
        COALESCE(en.full_name, n.full_name) as primary_name_english,
        b.name_nepali as branch_name,
        ${searchScoreSql}
      FROM persons p
      JOIN person_names n ON p.id = n.person_id AND n.language = 'ne' AND n.is_primary = TRUE
      LEFT JOIN person_names en ON p.id = en.person_id AND en.language = 'en' AND en.is_primary = TRUE
      LEFT JOIN branches b ON p.branch_id = b.id
      WHERE ${whereClause}
      ORDER BY p.id, p.generation ASC, n.full_name ASC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    const dataRes = await this.db.query(dataSql, queryParams);

    const items: PersonSearchItemDto[] = dataRes.rows.map((r: any) => ({
      id: r.id,
      primaryNameNepali: r.primary_name_nepali,
      primaryNameEnglish: r.primary_name_english,
      gender: r.gender,
      livingStatus: r.living_status,
      generation: r.generation,
      branchId: r.branch_id || undefined,
      branchName: r.branch_name || undefined,
      birthYearBs: r.birth_year_bs ? Number(r.birth_year_bs) : undefined,
      deathYearBs: r.death_year_bs ? Number(r.death_year_bs) : undefined,
      moolGhar: r.mool_ghar,
      isClaimed: r.is_claimed,
      similarityScore: r.similarity_score ? Number(r.similarity_score) : undefined,
      version: r.version || 1,
    }));

    return {
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    };
  }

  async updateClaimStatus(personId: string, isClaimed: boolean, claimedUserId?: string, client?: PoolClient): Promise<void> {
    await this.executeQuery(
      'UPDATE persons SET is_claimed = $1, claimed_user_id = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [isClaimed, claimedUserId || null, personId],
      client,
    );
  }
}
