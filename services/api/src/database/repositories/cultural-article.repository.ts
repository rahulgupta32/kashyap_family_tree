import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';

export interface CulturalArticleRecord {
  id: string;
  title_nepali: string;
  title_english?: string;
  slug: string;
  category: string;
  content_nepali: string;
  content_english?: string;
  cover_image_id?: string;
  is_published: boolean;
  published_at?: string;
  author_id?: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CulturalArticleRepository {
  constructor(private readonly db: DatabaseService) {}

  async listPublished(category?: string): Promise<CulturalArticleRecord[]> {
    const sql = category
      ? 'SELECT * FROM cultural_articles WHERE is_published = TRUE AND category = $1 ORDER BY published_at DESC'
      : 'SELECT * FROM cultural_articles WHERE is_published = TRUE ORDER BY published_at DESC';
    const params = category ? [category] : [];
    const res = await this.db.query<CulturalArticleRecord>(sql, params);
    return res.rows;
  }

  async findBySlug(slug: string): Promise<CulturalArticleRecord | null> {
    const res = await this.db.query<CulturalArticleRecord>(
      'SELECT * FROM cultural_articles WHERE slug = $1',
      [slug],
    );
    return res.rows[0] || null;
  }

  async createArticle(data: Omit<CulturalArticleRecord, 'id' | 'created_at' | 'updated_at'>): Promise<CulturalArticleRecord> {
    const res = await this.db.query<CulturalArticleRecord>(
      `INSERT INTO cultural_articles (
        title_nepali, title_english, slug, category, content_nepali, content_english, cover_image_id, is_published, author_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        data.title_nepali,
        data.title_english || null,
        data.slug,
        data.category,
        data.content_nepali,
        data.content_english || null,
        data.cover_image_id || null,
        data.is_published,
        data.author_id || null,
      ],
    );
    return res.rows[0];
  }
}
