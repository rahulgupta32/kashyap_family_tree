import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { Role } from '@kashyap/contracts';

export interface UserAccountRecord {
  id: string;
  phone_number: string;
  is_phone_verified: boolean;
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason: string | null;
  preferred_language: string;
  person_id: string | null;
  consent_given: boolean;
  consent_version: string | null;
  consent_timestamp: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: Role;
  branch_id: string | null;
  granted_by: string | null;
  created_at: Date;
}

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findOrCreateByPhone(phoneNumber: string, preferredLanguage = 'ne'): Promise<UserAccountRecord> {
    const query = `
      INSERT INTO user_accounts (phone_number, preferred_language)
      VALUES ($1, $2)
      ON CONFLICT (phone_number)
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const res = await this.db.query<UserAccountRecord>(query, [phoneNumber, preferredLanguage]);
    return res.rows[0];
  }

  async findByPhone(phoneNumber: string): Promise<UserAccountRecord | null> {
    const query = `
      SELECT * FROM user_accounts
      WHERE phone_number = $1 AND deleted_at IS NULL;
    `;
    const res = await this.db.query<UserAccountRecord>(query, [phoneNumber]);
    return res.rows[0] || null;
  }

  async findById(id: string): Promise<UserAccountRecord | null> {
    const query = `
      SELECT * FROM user_accounts
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    const res = await this.db.query<UserAccountRecord>(query, [id]);
    return res.rows[0] || null;
  }

  async setPhoneVerified(id: string, isVerified = true): Promise<void> {
    const query = `
      UPDATE user_accounts
      SET is_phone_verified = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.db.query(query, [id, isVerified]);
  }

  async setSuspension(id: string, isSuspended: boolean, reason?: string): Promise<void> {
    const query = `
      UPDATE user_accounts
      SET is_suspended = $2, suspension_reason = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.db.query(query, [id, isSuspended, reason || null]);

    if (isSuspended) {
      // Invalidate active sessions immediately upon account suspension (AUTH-FR-010)
      await this.db.query(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL;`,
        [id],
      );
    }
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    const query = `
      UPDATE user_accounts
      SET is_active = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    await this.db.query(query, [id, isActive]);
  }

  async assignRole(
    userId: string,
    role: Role,
    branchId: string | null = null,
    grantedBy: string | null = null,
  ): Promise<UserRoleRecord> {
    // Check if role assignment already exists (handling NULL branch_id correctly with IS NOT DISTINCT FROM)
    const existing = await this.db.query<UserRoleRecord>(
      `SELECT * FROM user_roles WHERE user_id = $1 AND role = $2 AND branch_id IS NOT DISTINCT FROM $3;`,
      [userId, role, branchId],
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const query = `
      INSERT INTO user_roles (user_id, role, branch_id, granted_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await this.db.query<UserRoleRecord>(query, [userId, role, branchId, grantedBy]);
    return res.rows[0];
  }

  async revokeRole(userId: string, role: Role, branchId: string | null = null): Promise<boolean> {
    const query = `
      DELETE FROM user_roles
      WHERE user_id = $1 AND role = $2 AND branch_id IS NOT DISTINCT FROM $3;
    `;
    const res = await this.db.query(query, [userId, role, branchId]);
    return (res.rowCount ?? 0) > 0;
  }

  async getUserRoles(userId: string): Promise<UserRoleRecord[]> {
    const query = `
      SELECT id, user_id, role, branch_id, granted_by, created_at
      FROM user_roles
      WHERE user_id = $1
      ORDER BY created_at ASC;
    `;
    const res = await this.db.query<UserRoleRecord>(query, [userId]);
    return res.rows;
  }

  async hasRole(userId: string, role: Role, branchId?: string | null): Promise<boolean> {
    let query: string;
    let params: any[];

    if (branchId !== undefined) {
      query = `
        SELECT 1 FROM user_roles
        WHERE user_id = $1 AND role = $2 AND branch_id IS NOT DISTINCT FROM $3
        LIMIT 1;
      `;
      params = [userId, role, branchId];
    } else {
      query = `
        SELECT 1 FROM user_roles
        WHERE user_id = $1 AND role = $2
        LIMIT 1;
      `;
      params = [userId, role];
    }

    const res = await this.db.query(query, params);
    return res.rows.length > 0;
  }
}
