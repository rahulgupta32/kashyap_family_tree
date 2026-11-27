import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PoolClient } from 'pg';

@Injectable()
export class ChatMediaService {
  private config() {
    const endpoint = process.env.CHAT_LIVEKIT_URL;
    const key = process.env.CHAT_LIVEKIT_API_KEY;
    const secret = process.env.CHAT_LIVEKIT_API_SECRET;
    if (!endpoint && !key && !secret && process.env.CHAT_MEDIA_ENABLED !== 'true') return null;
    try {
      const url = new URL(endpoint ?? '');
      if (url.protocol !== 'wss:' || !url.hostname.endsWith('.livekit.cloud') ||
          url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port ||
          !key || !secret || secret.length < 32) throw new Error();
      return { url, key, secret };
    } catch {
      throw new ServiceUnavailableException('Call media configuration unavailable');
    }
  }

  private sign(config: { key: string; secret: string }, sub: string, video: object, now: number, ttl: number) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = [
      encode({ alg: 'HS256', typ: 'JWT' }),
      encode({ iss: config.key, sub, nbf: now, exp: now + ttl, video }),
    ].join('.');
    return `${payload}.${createHmac('sha256', config.secret).update(payload).digest('base64url')}`;
  }

  credential(callId: string, userId: string, media: 'VOICE' | 'VIDEO') {
    const config = this.config();
    if (process.env.CHAT_MEDIA_ENABLED !== 'true' || !config) {
      throw new ServiceUnavailableException('Call media unavailable');
    }
    const now = Math.floor(Date.now() / 1000);
    const token = this.sign(config, userId, {
      room: callId, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false,
      canPublishSources: media === 'VOICE' ? ['microphone'] : ['microphone', 'camera'],
    }, now, 60);
    return { url: config.url.origin, token, expiresAt: new Date((now + 60) * 1000).toISOString() };
  }

  // Caller holds the conversation lock shared by membership changes and credential issuance.
  async revoke(client: PoolClient, conversationId: string, userId?: string) {
    const config = this.config();
    if (!config) return;
    const participants = (await client.query<{ call_id: string; user_id: string }>(`
      SELECT p.call_id,p.user_id FROM chat_call_participants p JOIN chat_calls c ON c.id=p.call_id
      WHERE c.conversation_id=$1 AND c.state='ACTIVE' AND ($2::uuid IS NULL OR p.user_id=$2)
      ORDER BY p.user_id`, [conversationId, userId ?? null])).rows;
    const results = await Promise.allSettled(participants.map(async participant => {
      const now = Math.floor(Date.now() / 1000);
      const video = { room: participant.call_id, roomAdmin: true };
      const token = this.sign(config, 'chat-media-admin', video, now, 30);
      try {
        const response = await fetch(`https://${config.url.hostname}/twirp/livekit.RoomService/RemoveParticipant`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3500),
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: participant.call_id, identity: participant.user_id, revoke_token_ts: String(now + 2) }),
        });
        if (!response.ok) throw new Error();
        await response.body?.cancel();
      } catch {
        throw new ServiceUnavailableException('Could not revoke call media access');
      }
    }));
    if (results.some(result => result.status === 'rejected')) {
      throw new ServiceUnavailableException('Could not revoke call media access');
    }
  }
}
