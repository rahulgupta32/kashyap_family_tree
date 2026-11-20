import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { PrivacyEngineService } from '../genealogy/privacy/privacy-engine.service';

const privacy = new PrivacyEngineService();
const personFields = 'person.id,person.birth_year_bs,person.birth_date_bs,person.living_status,person.is_minor_protected,person.is_archived,person.is_claimed,person.claimed_user_id';
function eligible(rows: any[]): boolean {
  return rows.length === 2 && rows.every(row => row.id && !row.is_archived && row.is_claimed && row.claimed_user_id===row.account_id && row.account_verified && !privacy.isMinorOrUncertainAge(row));
}

/** Direct messaging remains unavailable for minors/uncertain ages until the
 * governed guardian policy is approved. Both current account links matter. */
export async function directParticipantsEligible(db: DatabaseService, scope: string | string[], client?: PoolClient): Promise<boolean> {
  const condition = Array.isArray(scope) ? 'u.id=ANY($1::uuid[])'
    : 'u.id IN (SELECT user_id FROM chat_participants WHERE conversation_id=$1)';
  const rows = (await db.query(`SELECT ${personFields},u.id AS account_id,
    EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=u.id AND role.role NOT IN ('GUEST','REGISTERED_USER')) AS account_verified
    FROM user_accounts u JOIN persons person ON person.id=u.person_id
    WHERE ${condition} AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
    ORDER BY u.id${client ? ' FOR SHARE OF u,person' : ''}`, [scope], client)).rows;
  return eligible(rows);
}

/** Bounded batches for a member's list/inbox; missing links remain represented and
 * cannot disappear from the two-participant eligibility decision. */
export async function eligibleDirectConversationIds(db: DatabaseService, userId: string, conversationIds?: string[]): Promise<string[]> {
  if(conversationIds && !conversationIds.length)return [];
  const ids:string[]=[];
  let after:string|null=null;
  do {
    const rows = (await db.query(`WITH selected AS (
      SELECT c.id FROM chat_conversations c WHERE c.conversation_type='DIRECT'
      AND EXISTS(SELECT 1 FROM chat_participants mine WHERE mine.conversation_id=c.id AND mine.user_id=$1)
      AND ($2::uuid IS NULL OR c.id>$2::uuid) ${conversationIds ? 'AND c.id=ANY($3::uuid[])' : ''}
      ORDER BY c.id LIMIT 500)
      SELECT c.id AS conversation_id,${personFields},u.id AS account_id,
      u.is_active AS account_active,u.is_suspended AS account_suspended,u.deleted_at AS account_deleted,
      EXISTS(SELECT 1 FROM user_roles role WHERE role.user_id=u.id AND role.role NOT IN ('GUEST','REGISTERED_USER')) AS account_verified
      FROM selected c LEFT JOIN chat_participants participant ON participant.conversation_id=c.id
      LEFT JOIN user_accounts u ON u.id=participant.user_id LEFT JOIN persons person ON person.id=u.person_id
      ORDER BY c.id,u.id`, conversationIds ? [userId,after,conversationIds] : [userId,after])).rows;
    const conversations = new Map<string, any[]>();
    for (const row of rows) {
      const participants = conversations.get(row.conversation_id) || [];
      participants.push(row); conversations.set(row.conversation_id, participants);
    }
    for(const [id,participants] of conversations){if(eligible(participants)&&participants.every(row=>row.account_active&&!row.account_suspended&&!row.account_deleted))ids.push(id);after=id;}
    if(conversations.size<500)break;
  }while(after);
  return ids;
}
