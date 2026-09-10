import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { Gender, LivingStatus, PrivacyVisibility } from '@kashyap/contracts';

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
  is_claimed: boolean;
  claimed_user_id?: string;
  is_archived: boolean;
  archive_reason?: string;
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
}

@Injectable()
export class PersonRepository {
  private readonly logger = new Logger(PersonRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<PersonRecord | null> {
    const res = await this.db.query<PersonRecord>('SELECT * FROM persons WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async findNamesByPersonId(personId: string): Promise<PersonNameRecord[]> {
    const res = await this.db.query<PersonNameRecord>(
      'SELECT * FROM person_names WHERE person_id = $1 ORDER BY is_primary DESC',
      [personId],
    );
    return res.rows;
  }

  async createPerson(data: Partial<PersonRecord>, names: Array<Omit<PersonNameRecord, 'id' | 'person_id'>>): Promise<PersonRecord> {
    return this.db.transaction(async (client) => {
      const personRes = await client.query<PersonRecord>(
        `INSERT INTO persons (
          generation, gender, living_status, branch_id, birth_year_bs, birth_date_bs, birth_place,
          death_year_bs, death_date_bs, death_place, gotra, kuldevata, mool_ghar, current_address,
          occupation, education, biography, phone_visibility, address_visibility, dob_visibility
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING *`,
        [
          data.generation || 1,
          data.gender || 'UNKNOWN',
          data.living_status || 'LIVING',
          data.branch_id || null,
          data.birth_year_bs || null,
          data.birth_date_bs || null,
          data.birth_place || null,
          data.death_year_bs || null,
          data.death_date_bs || null,
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
        ],
      );

      const createdPerson = personRes.rows[0];

      for (const name of names) {
        await client.query(
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
    });
  }

  async searchPersons(query: string, branchId?: string, limit: number = 20): Promise<any[]> {
    const cleanQuery = `%${query.trim()}%`;
    const sql = `
      SELECT p.*, n.full_name, n.language, b.name_nepali as branch_name_nepali, b.name_english as branch_name_english
      FROM persons p
      JOIN person_names n ON p.id = n.person_id AND n.is_primary = TRUE
      LEFT JOIN branches b ON p.branch_id = b.id
      WHERE (n.full_name ILIKE $1 OR p.mool_ghar ILIKE $1 OR p.birth_place ILIKE $1)
      ${branchId ? 'AND p.branch_id = $2' : ''}
      LIMIT ${limit}
    `;
    const params = branchId ? [cleanQuery, branchId] : [cleanQuery];
    const res = await this.db.query(sql, params);
    return res.rows;
  }

  async updateClaimStatus(personId: string, isClaimed: boolean, claimedUserId?: string): Promise<void> {
    await this.db.query(
      'UPDATE persons SET is_claimed = $1, claimed_user_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [isClaimed, claimedUserId || null, personId],
    );
  }
}
