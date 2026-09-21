import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';

export interface BranchRecord {
  id: string;
  name_nepali: string;
  name_english: string;
  code: string;
  mool_ghar: string | null;
  kuldevata: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class BranchRepository {
  private readonly logger = new Logger(BranchRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<BranchRecord[]> {
    const query = `
      SELECT * FROM branches
      ORDER BY name_english ASC;
    `;
    const res = await this.db.query<BranchRecord>(query);
    return res.rows;
  }

  async findById(id: string): Promise<BranchRecord | null> {
    const query = `
      SELECT * FROM branches
      WHERE id = $1;
    `;
    const res = await this.db.query<BranchRecord>(query, [id]);
    return res.rows[0] || null;
  }

  async findByCode(code: string): Promise<BranchRecord | null> {
    const query = `
      SELECT * FROM branches
      WHERE code = $1;
    `;
    const res = await this.db.query<BranchRecord>(query, [code]);
    return res.rows[0] || null;
  }

  async create(data: {
    nameNepali: string;
    nameEnglish: string;
    code: string;
    moolGhar?: string | null;
    kuldevata?: string | null;
    description?: string | null;
  }): Promise<BranchRecord> {
    const query = `
      INSERT INTO branches (name_nepali, name_english, code, mool_ghar, kuldevata, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (code) DO UPDATE
      SET name_nepali = EXCLUDED.name_nepali,
          name_english = EXCLUDED.name_english,
          updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const res = await this.db.query<BranchRecord>(query, [
      data.nameNepali,
      data.nameEnglish,
      data.code,
      data.moolGhar || null,
      data.kuldevata || null,
      data.description || null,
    ]);
    return res.rows[0];
  }
}
