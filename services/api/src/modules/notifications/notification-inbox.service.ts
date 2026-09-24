import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

type Category = 'WORKFLOW' | 'CHAT' | 'EVENT';
type Preference = 'inAppEnabled' | 'workflowEnabled' | 'chatEnabled' | 'familyEventsEnabled';
const destinations: Record<Category, string> = { WORKFLOW: '/claims', CHAT: '/chat', EVENT: '/calendar' };

@Injectable()
export class NotificationInboxService {
  constructor(private readonly db: DatabaseService) {}

  private classify(action: string): { category: Category; destination: string; message: string } | null {
    if (action === 'CHAT_MESSAGE_CREATED') return {
      category: 'CHAT', destination: destinations.CHAT,
      message: 'नयाँ निजी सन्देश आएको छ। (You have a new private message)',
    };
    if (action === 'CALENDAR_EVENT_CREATED') return {
      category: 'EVENT', destination: destinations.EVENT,
      message: 'नयाँ कार्यक्रम थपिएको छ। (A new event was added)',
    };
    if (/^(CLAIM_|DISPUTE_FILED|DISPUTE_RESOLVED)/.test(action)) return {
      category: 'WORKFLOW', destination: '/claims',
      message: 'दाबी सम्बन्धी अपडेट छ। (A claim has an update)',
    };
    if (action.startsWith('CHANGE_REQUEST_')) return {
      category: 'WORKFLOW', destination: '/change-requests',
      message: 'संशोधन अनुरोध अपडेट छ। (A change request has an update)',
    };
    return null; // Audit-only events must never create member notifications.
  }

  async record(outbox: {id: string; action: string; entity_id?: string}, recipientId: string, prefs: any): Promise<void> {
    const kind = this.classify(outbox.action);
    if (!kind || prefs.in_app_enabled === false ||
      (kind.category === 'WORKFLOW' && prefs.workflow_enabled === false) ||
      (kind.category === 'CHAT' && prefs.chat_enabled === false) ||
      (kind.category === 'EVENT' && prefs.family_events_enabled === false)) return;
    await this.db.query(`INSERT INTO notification_inbox
      (outbox_id,recipient_user_id,category,action,message,destination,chat_message_id)
      SELECT $1,u.id,$3,$4,$5,$6,$7 FROM user_accounts u
      WHERE u.id=$2 AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
      ON CONFLICT (outbox_id,recipient_user_id) DO NOTHING`,
      [outbox.id,recipientId,kind.category,outbox.action,kind.message,kind.destination,
        kind.category === 'CHAT' ? outbox.entity_id : null]);
  }

  // Chat notices are rechecked at read time, so leaving a group, a block,
  // or deleting a message revokes even a previously queued notice.
  private readonly visible = `(
    n.category <> 'CHAT' OR EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_participants p ON p.conversation_id=m.conversation_id
        AND p.user_id=n.recipient_user_id AND p.left_at IS NULL
      JOIN chat_conversations c ON c.id=m.conversation_id
      WHERE m.id=n.chat_message_id AND m.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=n.recipient_user_id
          AND r.role NOT IN ('GUEST','REGISTERED_USER')
          AND (c.branch_id IS NULL OR r.branch_id=c.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')))
        AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=n.recipient_user_id AND b.blocked_id=m.sender_id)
          OR (b.blocker_id=m.sender_id AND b.blocked_id=n.recipient_user_id))
    ))`;

  async list(userId: string, limitRaw?: string, cursor?: string) {
    const number = limitRaw === undefined ? 30 : Number(limitRaw);
    if (!Number.isInteger(number) || number < 1 || number > 50) throw new BadRequestException('limit must be 1..50');
    let before: [string,string] | null = null;
    if (cursor !== undefined) {
      const parts = cursor.split('|');
      if (parts.length !== 2 || Number.isNaN(Date.parse(parts[0])) ||
        !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(parts[1]))
        throw new BadRequestException('Invalid notification cursor');
      before = [new Date(parts[0]).toISOString(), parts[1]];
    }
    const rows = await this.db.query(`SELECT n.id,n.category,n.action,n.message,n.destination,n.created_at,n.read_at
      FROM notification_inbox n JOIN user_accounts u ON u.id=n.recipient_user_id
      WHERE n.recipient_user_id=$1 AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
      AND ${this.visible} AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2::timestamptz,$3::uuid))
      ORDER BY n.created_at DESC,n.id DESC LIMIT $4`,[userId,before?.[0]??null,before?.[1]??null,number+1]);
    const items = rows.rows.slice(0,number).map(r=>({id:r.id,category:r.category,action:r.action,
      message:r.message,destination:r.destination,createdAt:r.created_at,readAt:r.read_at}));
    const last = rows.rows[number-1];
    const count = await this.db.query(`SELECT count(*)::int AS count FROM notification_inbox n
      JOIN user_accounts u ON u.id=n.recipient_user_id WHERE n.recipient_user_id=$1
      AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
      AND n.read_at IS NULL AND ${this.visible}`,[userId]);
    return {items,unreadCount:count.rows[0].count,
      nextCursor:rows.rows.length>number ? `${new Date(last.created_at).toISOString()}|${last.id}` : null};
  }

  async markRead(userId:string,id:string) {
    if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) throw new NotFoundException();
    const updated=await this.db.query(`UPDATE notification_inbox n SET read_at=COALESCE(read_at,NOW())
      WHERE n.id=$1 AND n.recipient_user_id=$2 AND ${this.visible} RETURNING n.id,n.read_at`,[id,userId]);
    if(!updated.rows.length)throw new NotFoundException();
    return {id:updated.rows[0].id,readAt:updated.rows[0].read_at};
  }

  async markAllRead(userId:string) {
    const result=await this.db.query(`UPDATE notification_inbox n SET read_at=NOW()
      WHERE n.recipient_user_id=$1 AND n.read_at IS NULL AND ${this.visible}`,[userId]);
    return {updated:result.rowCount};
  }

  async preferences(userId:string) {
    const rows=await this.db.query(`SELECT in_app_enabled,workflow_enabled,chat_enabled,family_events_enabled
      FROM notification_preferences WHERE user_id=$1`,[userId]);
    const p=rows.rows[0];return {inAppEnabled:p?.in_app_enabled??true,workflowEnabled:p?.workflow_enabled??true,
      chatEnabled:p?.chat_enabled??true,familyEventsEnabled:p?.family_events_enabled??true};
  }

  async updatePreferences(userId:string,body:Record<string,unknown>) {
    const keys:Preference[]=['inAppEnabled','workflowEnabled','chatEnabled','familyEventsEnabled'];
    if(!body || Array.isArray(body) || typeof body!=='object' || !Object.keys(body).length ||
      Object.keys(body).some(key=>!keys.includes(key as Preference)||typeof body[key]!=='boolean'))
      throw new BadRequestException('Expected one or more boolean notification preferences');
    await this.db.query(`INSERT INTO notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,[userId]);
    await this.db.query(`UPDATE notification_preferences SET
      in_app_enabled=COALESCE($2::boolean,in_app_enabled),
      workflow_enabled=COALESCE($3::boolean,workflow_enabled),
      chat_enabled=COALESCE($4::boolean,chat_enabled),
      family_events_enabled=COALESCE($5::boolean,family_events_enabled),updated_at=NOW()
      WHERE user_id=$1`,[userId,...keys.map(k=>body[k]??null)]);
    return this.preferences(userId);
  }
}
