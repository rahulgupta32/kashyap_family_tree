import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { Role } from '@kashyap/contracts';
import { privilegedSessionExpired } from '../../modules/auth/privileged-session.policy';

export interface UserSessionRecord {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  device_id: string | null;
  device_platform: string;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  authenticated_at: Date | null;
  mfa_verified_at: Date | null;
  mfa_generation: number | null;
}

@Injectable()
export class SessionRepository {
  private readonly logger = new Logger(SessionRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    devicePlatform: string;
    deviceId?: string | null;
    deviceName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    expiresAt: Date;
  }): Promise<UserSessionRecord> {
    const query = `
      INSERT INTO user_sessions (
        user_id, refresh_token_hash, device_platform, device_id, device_name,
        ip_address, user_agent, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const params = [
      data.userId,
      data.refreshTokenHash,
      data.devicePlatform,
      data.deviceId || null,
      data.deviceName || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.expiresAt,
    ];
    const res = await this.db.query<UserSessionRecord>(query, params);
    return res.rows[0];
  }

  async findById(sessionId: string): Promise<UserSessionRecord | null> {
    const query = `
      SELECT * FROM user_sessions
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await this.db.query<UserSessionRecord>(query, [sessionId]);
    return res.rows[0] || null;
  }

  async findByTokenHash(refreshTokenHash: string): Promise<UserSessionRecord | null> {
    const query = `
      SELECT * FROM user_sessions
      WHERE refresh_token_hash = $1
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = await this.db.query<UserSessionRecord>(query, [refreshTokenHash]);
    return res.rows[0] || null;
  }

  async rotateSessionTransactional(
    oldTokenHash: string,
    newSessionData: {
      newRefreshTokenHash: string;
      expiresAt: Date;
      devicePlatform: string;
      deviceId?: string | null;
      deviceName?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<{
    status: 'SUCCESS' | 'REUSED' | 'EXPIRED' | 'NOT_FOUND';
    oldSession?: UserSessionRecord;
    newSession?: UserSessionRecord;
  }> {
    return this.db.transaction(async (client) => {
      // 1. Lock the session row with SELECT ... FOR UPDATE (prevents concurrent duplicate successor creation)
      const lockRes = await client.query<UserSessionRecord>(
        `SELECT * FROM user_sessions WHERE refresh_token_hash = $1 FOR UPDATE;`,
        [oldTokenHash],
      );

      if (lockRes.rows.length === 0) {
        return { status: 'NOT_FOUND' };
      }

      const session = lockRes.rows[0];

      // 2. Token reuse / replay check: if already revoked, trigger universal user session revocation (EC-0020)
      if (session.revoked_at !== null) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL;`,
          [session.user_id],
        );
        return { status: 'REUSED', oldSession: session };
      }

      // Current authority and original OTP time survive every refresh successor.
      const roleResult = await client.query<{ role: Role }>('SELECT role FROM user_roles WHERE user_id = $1', [session.user_id]);
      // 3. Expiry check (including privileged absolute age).
      if (new Date() >= session.expires_at || privilegedSessionExpired(roleResult.rows.map(r => r.role), session.authenticated_at)) {
        await client.query(
          `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [session.id],
        );
        return { status: 'EXPIRED', oldSession: session };
      }

      // 4. Revoke the old session
      await client.query(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [session.id],
      );

      // 5. Create successor session in same transaction
      const insertRes = await client.query<UserSessionRecord>(
        `INSERT INTO user_sessions (
          user_id, refresh_token_hash, device_platform, device_id, device_name,
          ip_address, user_agent, expires_at, authenticated_at, mfa_verified_at, mfa_generation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;`,
        [
          session.user_id,
          newSessionData.newRefreshTokenHash,
          newSessionData.devicePlatform || session.device_platform,
          newSessionData.deviceId !== undefined ? newSessionData.deviceId : session.device_id,
          newSessionData.deviceName !== undefined ? newSessionData.deviceName : session.device_name,
          newSessionData.ipAddress !== undefined ? newSessionData.ipAddress : session.ip_address,
          newSessionData.userAgent !== undefined ? newSessionData.userAgent : session.user_agent,
          newSessionData.expiresAt,
          session.authenticated_at,
          session.mfa_verified_at,
          session.mfa_generation,
        ],
      );

      return {
        status: 'SUCCESS',
        oldSession: session,
        newSession: insertRes.rows[0],
      };
    });
  }

  async revokeSession(sessionId: string, client?: any): Promise<void> {
    const query = `
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND revoked_at IS NULL;
    `;
    if (client) {
      await client.query(query, [sessionId]);
    } else {
      await this.db.query(query, [sessionId]);
    }
  }

  async revokeAllForUser(userId: string, client?: any): Promise<number> {
    const query = `
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND revoked_at IS NULL;
    `;
    const res = client
      ? await client.query(query, [userId])
      : await this.db.query(query, [userId]);
    return res.rowCount ?? 0;
  }

  async getActiveSessionsForUser(userId: string): Promise<UserSessionRecord[]> {
    const query = `
      SELECT * FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC;
    `;
    const res = await this.db.query<UserSessionRecord>(query, [userId]);
    return res.rows;
  }

  async deleteExpiredSessions(): Promise<number> {
    const query = `
      DELETE FROM user_sessions
      WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    `;
    const res = await this.db.query(query);
    return res.rowCount ?? 0;
  }
}
