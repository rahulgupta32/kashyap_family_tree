import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';

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

      // 3. Expiry check
      if (new Date() > session.expires_at) {
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
          ip_address, user_agent, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ],
      );

      return {
        status: 'SUCCESS',
        oldSession: session,
        newSession: insertRes.rows[0],
      };
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    const query = `
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND revoked_at IS NULL;
    `;
    await this.db.query(query, [sessionId]);
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const query = `
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND revoked_at IS NULL;
    `;
    const res = await this.db.query(query, [userId]);
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
