import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, uuid } from '../community/community-policy';
import { ChatService } from './chat.service';

@Injectable()
export class ChatCallsService {
  constructor(private readonly db: DatabaseService, private readonly chat: ChatService) {}

  private async reconcile(client: PoolClient, id: string) {
    await client.query(`
      DELETE FROM chat_call_participants p USING chat_calls c
      WHERE p.call_id=c.id AND c.conversation_id=$1 AND c.state IN ('RINGING','ACTIVE')
      AND NOT EXISTS (
        SELECT 1 FROM chat_participants m JOIN user_accounts u ON u.id=m.user_id
        JOIN chat_conversations chat ON chat.id=m.conversation_id
        WHERE m.conversation_id=c.conversation_id AND m.user_id=p.user_id
          AND m.left_at IS NULL AND m.removed_at IS NULL
          AND u.is_active AND NOT u.is_suspended AND u.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id
            AND r.role NOT IN ('GUEST','REGISTERED_USER')
            AND (chat.branch_id IS NULL OR r.branch_id=chat.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')))
      )`, [id]);
    await client.query(`UPDATE chat_calls c SET state=CASE
      WHEN c.state='RINGING' AND c.ring_until<=now() THEN 'MISSED' ELSE 'ENDED' END
      WHERE c.conversation_id=$1 AND c.state IN ('RINGING','ACTIVE')
      AND ((c.state='RINGING' AND c.ring_until<=now())
        OR NOT EXISTS (SELECT 1 FROM chat_call_participants p WHERE p.call_id=c.id))`, [id]);
  }

  async manage(conversationId: string, user: AuthenticatedUser, body?: any) {
    if (process.env.CHAT_CALLS_ENABLED !== 'true') throw new NotFoundException('Calls unavailable');
    const action = body === undefined ? 'VIEW' : body?.action;
    if (body !== undefined) allowedFields(body, ['action', 'media', 'callId']);
    if (!['VIEW', 'START', 'JOIN', 'DECLINE', 'LEAVE'].includes(action) ||
        (body !== undefined && action === 'VIEW')) throw new BadRequestException('Invalid call action');
    const limit = Number(process.env.CHAT_CALL_PARTICIPANT_LIMIT ?? '6');
    if (!Number.isInteger(limit) || limit < 2 || limit > 50) throw new ConflictException('Invalid call participant configuration');

    return this.db.transaction(async client => {
      const conversation = await this.chat.access(conversationId, user, client);
      const direct = conversation.conversation_type === 'DIRECT';
      await this.reconcile(client, conversationId);
      if (direct && (await client.query(`SELECT 1 FROM chat_blocks b
        JOIN chat_participants other ON other.conversation_id=$1 AND other.user_id<>$2
        WHERE (b.blocker_id=$2 AND b.blocked_id=other.user_id)
           OR (b.blocked_id=$2 AND b.blocker_id=other.user_id)`, [conversationId,user.id])).rows.length) {
        throw new ForbiddenException('Calling is blocked');
      }

      let call = (await client.query(`SELECT id,caller_id,media,state,ring_until FROM chat_calls
        WHERE conversation_id=$1 ORDER BY (state IN ('RINGING','ACTIVE')) DESC,created_at DESC,id DESC LIMIT 1`,
        [conversationId])).rows[0];
      const open = call && ['RINGING','ACTIVE'].includes(call.state);
      if (action === 'START') {
        if (!['VOICE','VIDEO'].includes(body.media)) throw new BadRequestException('Choose voice or video');
        if (open) throw new ConflictException('A call is already open');
        call = (await client.query(`INSERT INTO chat_calls(conversation_id,caller_id,media,state)
          VALUES($1,$2,$3,$4) RETURNING id,caller_id,media,state,ring_until`,
          [conversationId,user.id,body.media,direct ? 'RINGING' : 'ACTIVE'])).rows[0];
        await this.join(client, call.id, user.id);
      } else if (action !== 'VIEW') {
        if (!open || call.id !== uuid(body.callId, 'call')) throw new ConflictException('Call is no longer open');
        if (action === 'JOIN') {
          const participants = (await client.query('SELECT user_id FROM chat_call_participants WHERE call_id=$1', [call.id])).rows;
          if (!participants.some(p => p.user_id === user.id)) {
            if (participants.length >= (direct ? 2 : limit)) throw new ConflictException('Call is full');
            if ((await client.query(`SELECT 1 FROM chat_blocks b JOIN chat_call_participants p ON p.call_id=$1
              WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id)
                 OR (b.blocked_id=$2 AND b.blocker_id=p.user_id)`, [call.id, user.id])).rows.length) {
              throw new ForbiddenException('Calling is blocked');
            }
            await this.join(client, call.id, user.id);
            await client.query("UPDATE chat_calls SET state='ACTIVE' WHERE id=$1", [call.id]);
            call.state = 'ACTIVE';
          }
        } else if (action === 'DECLINE') {
          if (!direct || call.state !== 'RINGING' || call.caller_id === user.id) {
            throw new ConflictException('No incoming call to decline');
          }
          call.state = 'DECLINED';
          await client.query('UPDATE chat_calls SET state=$2 WHERE id=$1', [call.id, call.state]);
          await client.query('DELETE FROM chat_call_participants WHERE call_id=$1', [call.id]);
        } else {
          const left = await client.query('DELETE FROM chat_call_participants WHERE call_id=$1 AND user_id=$2', [call.id,user.id]);
          if (left.rowCount && (direct || !(await client.query('SELECT 1 FROM chat_call_participants WHERE call_id=$1 LIMIT 1',[call.id])).rows.length)) {
            call.state = 'ENDED';
            await client.query('UPDATE chat_calls SET state=$2 WHERE id=$1', [call.id, call.state]);
            await client.query('DELETE FROM chat_call_participants WHERE call_id=$1', [call.id]);
          }
        }
      }

      if (!call) return { call: null };
      const participants = ['RINGING','ACTIVE'].includes(call.state)
        ? (await client.query('SELECT user_id FROM chat_call_participants WHERE call_id=$1 ORDER BY user_id', [call.id])).rows
        : [];
      return { call: { id: call.id, media: call.media, state: call.state,
        startedByMe: call.caller_id === user.id, ringUntil: call.ring_until,
        joined: participants.some(p => p.user_id === user.id), participantCount: participants.length } };
    });
  }

  private async join(client: PoolClient, callId: string, userId: string) {
    await client.query('INSERT INTO chat_call_participants(call_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [callId, userId]);
  }
}
