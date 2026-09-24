import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { PrivacyEngineService } from '../genealogy/privacy/privacy-engine.service';
import { PoolClient } from 'pg';
import { GenealogyService } from '../genealogy/genealogy.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { allowedFields, branchAccess, canModerate, globalAdmin, member, textField, uuid } from '../community/community-policy';

@Injectable()
export class ChatService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository,private readonly genealogy:GenealogyService,private readonly privacy:PrivacyEngineService) {}

 async access(id:string,user:AuthenticatedUser,client?:PoolClient) {
  member(user);uuid(id);
  const result=await this.db.query(`SELECT c.* FROM chat_conversations c JOIN chat_participants p ON p.conversation_id=c.id
   WHERE c.id=$1 AND p.user_id=$2 AND p.left_at IS NULL`+(client?' FOR UPDATE OF c':''),[id,user.id],client);
  const row=result.rows[0];if(!row)throw new NotFoundException('Conversation not found');
  branchAccess(user,row.branch_id);
  return row;
 }
 async list(user:AuthenticatedUser) {
  member(user);
  return (await this.db.query(`SELECT c.id,c.title,c.conversation_type AS type,c.branch_id AS "branchId",c.updated_at AS "updatedAt",
   p.left_at IS NULL AND p.id IS NOT NULL AS "isParticipant",
   (SELECT count(*)::int FROM chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL AND m.sender_id<>$1 AND m.sequence>coalesce(p.last_read_sequence,0)) AS "unreadCount"
   FROM chat_conversations c LEFT JOIN chat_participants p ON p.conversation_id=c.id AND p.user_id=$1
   WHERE (p.id IS NOT NULL AND p.left_at IS NULL OR c.conversation_type='FAMILY_BRANCH' AND c.branch_id=ANY($2::uuid[]))
     AND ($3 OR c.branch_id IS NULL OR c.branch_id=ANY($2::uuid[])) ORDER BY c.updated_at DESC,c.id LIMIT 100`,[user.id,user.branchIds,globalAdmin(user)])).rows;
 }
 async create(user:AuthenticatedUser,body:any) {
  allowedFields(body,['type','personId','branchId','title']);member(user);
  if(body.type==='DIRECT'){
   if(body.branchId||body.title)throw new BadRequestException('Direct chat title and participants are derived from profiles');
   const person=await this.genealogy.getPersonById(uuid(body.personId,'person'),{
    userId:user.id,personId:user.personId,roles:user.roles,roleAssignments:user.roleAssignments,branchIds:user.branchIds,isVerifiedMember:true,
   });
   const target=(await this.db.query(`SELECT p.*,u.id AS account_id FROM user_accounts u JOIN persons p ON p.id=u.person_id WHERE u.person_id=$1 AND u.is_active=true AND u.is_suspended=false AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER'))`,[person.id])).rows[0];
   if(!target||target.account_id===user.id||this.privacy.isMinorOrUncertainAge(target))throw new BadRequestException('This profile is unavailable for direct chat');
   const pair=[user.id,target.account_id].sort(),key=pair.join(':');
   return this.db.transaction(async client=>{
    // Same pair always uses one conversation even across simultaneous requests.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`chat:${key}`]);
    if((await client.query('SELECT 1 FROM chat_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',pair)).rows.length)throw new ForbiddenException('Direct messaging is blocked');
    let row=(await client.query('SELECT * FROM chat_conversations WHERE direct_key=$1',[key])).rows[0];
    const created=!row;
    if(!row){row=(await client.query(`INSERT INTO chat_conversations(conversation_type,direct_key,is_group,created_by,title) VALUES('DIRECT',$1,false,$2,'Private conversation') RETURNING *`,[key,user.id])).rows[0];}
    for(const id of pair) await client.query(`INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2) ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=CASE WHEN chat_participants.user_id=$3 THEN NULL ELSE chat_participants.left_at END`,[row.id,id,user.id]);
    if(created) await this.audit.recordAuditIntent({action:'CHAT_CONVERSATION_CREATED',entityType:'chat_conversation',entityId:row.id,actorId:user.id},client);
    return {id:row.id,type:'DIRECT',title:row.title,isParticipant:true};
   });
  }
  if(body.type!=='FAMILY_BRANCH'||body.personId)throw new BadRequestException('Choose DIRECT or FAMILY_BRANCH');
  const branch=uuid(body.branchId,'branch');branchAccess(user,branch);
  if(!canModerate(user,branch))throw new ForbiddenException('Branch administrator authority required');
  const title=textField(body.title,'Title',150);
  return this.db.transaction(async client=>{
   const row=(await client.query(`INSERT INTO chat_conversations(conversation_type,branch_id,is_group,created_by,title)
    VALUES('FAMILY_BRANCH',$1,true,$2,$3) ON CONFLICT(branch_id) WHERE conversation_type='FAMILY_BRANCH' DO UPDATE SET updated_at=chat_conversations.updated_at RETURNING *`,[branch,user.id,title])).rows[0];
   await client.query(`INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2) ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL`,[row.id,user.id]);
   await this.audit.recordAuditIntent({action:'CHAT_CONVERSATION_CREATED',entityType:'chat_conversation',entityId:row.id,actorId:user.id},client);
   return {id:row.id,type:'FAMILY_BRANCH',title:row.title,isParticipant:true};
  });
 }
 async join(id:string,user:AuthenticatedUser) {
  member(user);uuid(id);
  return this.db.transaction(async client=>{
   const row=(await client.query("SELECT * FROM chat_conversations WHERE id=$1 AND conversation_type='FAMILY_BRANCH' FOR UPDATE",[id])).rows[0];
   if(!row)throw new NotFoundException('Branch conversation not found');branchAccess(user,row.branch_id);
   await client.query(`INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2) ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL`,[id,user.id]);
   return {success:true};
  });
 }
 async messages(id:string,user:AuthenticatedUser,after=0,before=0) {
  await this.access(id,user);
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(before)||before<0||(after>0&&before>0))throw new BadRequestException('Invalid message cursor');
  const rows=(await this.db.query(`SELECT m.id,m.conversation_id AS "conversationId",m.sender_id AS "senderUserId",m.sequence::float8 AS sequence,
   CASE WHEN m.deleted_at IS NULL THEN m.message_text ELSE '' END AS content,m.deleted_at IS NOT NULL AS "isDeleted",m.created_at AS "createdAt",
   ARRAY(SELECT p.user_id FROM chat_participants p WHERE p.conversation_id=m.conversation_id AND p.left_at IS NULL AND p.last_read_sequence>=m.sequence) AS "readByUserIds"
   FROM chat_messages m WHERE m.conversation_id=$1 AND ($2::bigint=0 OR m.sequence>$2) AND ($3::bigint=0 OR m.sequence<$3) ORDER BY m.sequence ${after>0?'ASC':'DESC'} LIMIT 100`,[id,after,before])).rows;
  return after>0?rows:rows.reverse();
 }
 async send(id:string,user:AuthenticatedUser,body:any) {
  allowedFields(body,['content','clientMessageId']);const content=textField(body.content,'Message',4000),retry=uuid(body.clientMessageId,'client message');
  return this.db.transaction(async client=>{
   const conv=await this.access(id,user,client);
   if(conv.conversation_type==='DIRECT'&&(await client.query(`SELECT 1 FROM chat_blocks b WHERE
    (b.blocker_id=$2 AND b.blocked_id IN (SELECT user_id FROM chat_participants WHERE conversation_id=$1)) OR
    (b.blocked_id=$2 AND b.blocker_id IN (SELECT user_id FROM chat_participants WHERE conversation_id=$1))`,[id,user.id])).rows.length)throw new ForbiddenException('Direct messaging is blocked');
   const existing=(await client.query('SELECT id,message_text FROM chat_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3',[id,user.id,retry])).rows[0];
   if(existing){if(existing.message_text!==content)throw new ConflictException('A message retry must keep the original content');return {id:existing.id,alreadySent:true};}
   const row=(await client.query(`INSERT INTO chat_messages(conversation_id,sender_id,message_text,client_message_id) VALUES($1,$2,$3,$4) RETURNING id,sequence::float8 AS sequence`,[id,user.id,content,retry])).rows[0];
   await client.query('UPDATE chat_conversations SET updated_at=now() WHERE id=$1',[id]);
   await client.query('UPDATE chat_participants SET last_read_sequence=greatest(last_read_sequence,$3),last_read_at=now() WHERE conversation_id=$1 AND user_id=$2',[id,user.id,row.sequence]);
   const recipients=(await client.query('SELECT user_id FROM chat_participants WHERE conversation_id=$1 AND user_id<>$2 AND left_at IS NULL',[id,user.id])).rows.map(r=>r.user_id);
   await this.audit.recordAuditIntent({action:'CHAT_MESSAGE_CREATED',entityType:'chat_message',entityId:row.id,actorId:user.id,newValue:{conversationId:id,recipientUserIds:recipients}},client);
   return {...row,alreadySent:false};
  });
 }
 async read(id:string,user:AuthenticatedUser,sequence:number){
  if(!Number.isSafeInteger(sequence)||sequence<0)throw new BadRequestException('Invalid read cursor');
  return this.db.transaction(async client=>{
   await this.access(id,user,client);
   const latest=(await client.query('SELECT coalesce(max(sequence),0)::float8 AS sequence FROM chat_messages WHERE conversation_id=$1',[id])).rows[0].sequence;
   if(sequence>latest)throw new BadRequestException('Cannot acknowledge future messages');
   await client.query('UPDATE chat_participants SET last_read_sequence=greatest(last_read_sequence,$3),last_read_at=now() WHERE conversation_id=$1 AND user_id=$2',[id,user.id,sequence]);return {success:true};
  });
 }
 async removeMessage(id:string,messageId:string,user:AuthenticatedUser){
  uuid(messageId);return this.db.transaction(async client=>{
   await this.access(id,user,client);
   const row=(await client.query('UPDATE chat_messages SET deleted_at=coalesce(deleted_at,now()) WHERE conversation_id=$1 AND id=$2 AND sender_id=$3 RETURNING id',[id,messageId,user.id])).rows[0];
   if(!row)throw new NotFoundException('Own message not found');
   await this.audit.recordAuditIntent({action:'CHAT_MESSAGE_DELETED',entityType:'chat_message',entityId:messageId,actorId:user.id},client);return {success:true};
  });
 }
 async leave(id:string,user:AuthenticatedUser){return this.db.transaction(async client=>{await this.access(id,user,client);await client.query('UPDATE chat_participants SET left_at=now() WHERE conversation_id=$1 AND user_id=$2',[id,user.id]);return {success:true};});}
 async block(id:string,user:AuthenticatedUser){
  return this.db.transaction(async client=>{
   const conv=await this.access(id,user,client);if(conv.conversation_type!=='DIRECT')throw new BadRequestException('Only direct conversations can be blocked');
   await client.query('INSERT INTO chat_blocks(blocker_id,blocked_id) SELECT $2,user_id FROM chat_participants WHERE conversation_id=$1 AND user_id<>$2 ON CONFLICT DO NOTHING',[id,user.id]);return {success:true};
  });
 }
}
