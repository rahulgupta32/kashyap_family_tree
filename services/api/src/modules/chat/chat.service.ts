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
   WHERE c.id=$1 AND p.user_id=$2 AND p.left_at IS NULL AND p.removed_at IS NULL
   AND EXISTS(SELECT 1 FROM user_accounts u WHERE u.id=p.user_id AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL)
   AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.user_id AND r.role NOT IN ('GUEST','REGISTERED_USER')
     AND (c.branch_id IS NULL OR r.branch_id=c.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN'))) `+(client?' FOR UPDATE OF c':''),[id,user.id],client);
  const row=result.rows[0];if(!row)throw new NotFoundException('Conversation not found');
  branchAccess(user,row.branch_id);
  return row;
 }
 async list(user:AuthenticatedUser) {
  member(user);
  return (await this.db.query(`SELECT c.id,c.title,c.conversation_type AS type,c.branch_id AS "branchId",c.updated_at AS "updatedAt",c.version,p.group_role AS "myRole",c.description,
   p.left_at IS NULL AND p.id IS NOT NULL AS "isParticipant",
   (SELECT count(*)::int FROM chat_messages m WHERE m.conversation_id=c.id AND m.deleted_at IS NULL AND m.sender_id<>$1 AND m.sequence>greatest(coalesce(p.last_read_sequence,0),coalesce(p.history_from_sequence,0))) AS "unreadCount"
   FROM chat_conversations c LEFT JOIN chat_participants p ON p.conversation_id=c.id AND p.user_id=$1
   WHERE (p.id IS NOT NULL AND p.left_at IS NULL AND p.removed_at IS NULL OR c.conversation_type='FAMILY_BRANCH' AND c.branch_id=ANY($2::uuid[]) AND p.removed_at IS NULL)
     AND ($3 OR c.branch_id IS NULL OR c.branch_id=ANY($2::uuid[])) ORDER BY c.updated_at DESC,c.id LIMIT 100`,[user.id,user.branchIds,globalAdmin(user)])).rows;
 }
 async create(user:AuthenticatedUser,body:any) {
  allowedFields(body,['type','personId','branchId','title','description','memberPersonIds']);member(user);
  if(body.type==='GROUP')return this.createGroup(user,body);
  if(body.memberPersonIds!==undefined||body.description!==undefined)throw new BadRequestException('Private group fields require GROUP');
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
   const previous=(await client.query('SELECT removed_at,left_at FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[row.id,user.id])).rows[0];
   if(previous?.removed_at)throw new ForbiddenException('Group administrator must restore removed membership');
   await client.query(`INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2)
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL`,[row.id,user.id]);
   if(row.created_by===user.id)await client.query(`UPDATE chat_participants SET group_role='OWNER' WHERE conversation_id=$1 AND user_id=$2
    AND NOT EXISTS(SELECT 1 FROM chat_participants WHERE conversation_id=$1 AND group_role='OWNER' AND left_at IS NULL)`,[row.id,user.id]);
   if(!previous&&row.created_by!==user.id||previous?.left_at){const changed=await this.groupChange(row,user,'CHAT_MEMBER_JOINED',{memberUserId:user.id},client);row.version=changed.version;}
   else await this.audit.recordAuditIntent({action:'CHAT_CONVERSATION_CREATED',entityType:'chat_conversation',entityId:row.id,actorId:user.id},client);
   return {id:row.id,type:'FAMILY_BRANCH',title:row.title,isParticipant:true,version:row.version};
  });
 }
 async join(id:string,user:AuthenticatedUser) {
  member(user);uuid(id);
  return this.db.transaction(async client=>{
   const row=(await client.query("SELECT * FROM chat_conversations WHERE id=$1 AND conversation_type='FAMILY_BRANCH' FOR UPDATE",[id])).rows[0];
   if(!row)throw new NotFoundException('Branch conversation not found');branchAccess(user,row.branch_id);
   const existing=(await client.query('SELECT * FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[id,user.id])).rows[0];
   if(existing?.removed_at)throw new ForbiddenException('Group administrator must restore removed membership');
   if(!existing||existing.left_at){
    await client.query(`INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2)
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL,group_role='MEMBER'`,[id,user.id]);
    await this.groupChange(row,user,'CHAT_MEMBER_JOINED',{memberUserId:user.id},client);
   }
   return {success:true};
  });
 }
 async messages(id:string,user:AuthenticatedUser,after=0,before=0) {
  await this.access(id,user);
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(before)||before<0||(after>0&&before>0))throw new BadRequestException('Invalid message cursor');
  const rows=(await this.db.query(`SELECT m.id,m.conversation_id AS "conversationId",m.sender_id AS "senderUserId",m.sequence::float8 AS sequence,
   CASE WHEN m.deleted_at IS NULL THEN m.message_text ELSE '' END AS content,m.deleted_at IS NOT NULL AS "isDeleted",m.created_at AS "createdAt",
   CASE WHEN m.deleted_at IS NULL THEN (SELECT json_build_object('id',a.id,'mimeType',a.mime_type,'byteSize',a.byte_size,'fileName',a.file_name) FROM chat_message_attachments link JOIN media_assets a ON a.id=link.asset_id WHERE link.message_id=m.id AND a.retention_status='ACTIVE' AND a.quarantine_status='CLEAN') ELSE NULL END AS attachment,
   ARRAY(SELECT p.user_id FROM chat_participants p WHERE p.conversation_id=m.conversation_id AND p.left_at IS NULL AND p.removed_at IS NULL AND p.last_read_sequence>=m.sequence AND m.sequence>p.history_from_sequence) AS "readByUserIds",
   ARRAY(SELECT p.user_id FROM chat_participants p WHERE p.conversation_id=m.conversation_id
    AND p.left_at IS NULL AND p.removed_at IS NULL AND m.sequence>p.history_from_sequence
    AND (p.last_read_sequence>=m.sequence OR EXISTS(SELECT 1 FROM chat_message_deliveries receipt WHERE receipt.message_id=m.id AND receipt.user_id=p.user_id))) AS "deliveredToUserIds"
   FROM chat_messages m JOIN chat_participants viewer ON viewer.conversation_id=m.conversation_id AND viewer.user_id=$4
   WHERE m.conversation_id=$1 AND viewer.left_at IS NULL AND viewer.removed_at IS NULL AND m.sequence>viewer.history_from_sequence AND ($2::bigint=0 OR m.sequence>$2) AND ($3::bigint=0 OR m.sequence<$3) ORDER BY m.sequence ${after>0?'ASC':'DESC'} LIMIT 100`,[id,after,before,user.id])).rows;
  return after>0?rows:rows.reverse();
 }
 async send(id:string,user:AuthenticatedUser,body:any,transactionClient?:PoolClient) {
  allowedFields(body,['content','clientMessageId']);const content=textField(body.content,'Message',4000),retry=uuid(body.clientMessageId,'client message');
  const work=async (client:PoolClient)=>{
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
  };
  return transactionClient?work(transactionClient):this.db.transaction(work);
 }
 /** Delivery means an authenticated client acknowledges specific received records,
  * never that a socket write or an external push provider succeeded. */
 async delivered(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['messageIds']);
  const ids=body.messageIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>100||new Set(ids).size!==ids.length)throw new BadRequestException('Acknowledge 1 to 100 distinct messages');
  ids.forEach(value=>uuid(value,'message'));
  return this.db.transaction(async client=>{
   await this.access(id,user,client);
   const visible=(await client.query(`SELECT m.id FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=$2
    WHERE m.conversation_id=$1 AND m.id=ANY($3::uuid[]) AND m.sequence>p.history_from_sequence`,[id,user.id,ids])).rows;
   if(visible.length!==ids.length)throw new BadRequestException('Only received conversation history can be acknowledged');
   await client.query(`INSERT INTO chat_message_deliveries(message_id,user_id) SELECT id,$2 FROM chat_messages WHERE id=ANY($1::uuid[])
    ON CONFLICT(message_id,user_id) DO NOTHING`,[ids,user.id]);
   return {success:true};
  });
 }
 async read(id:string,user:AuthenticatedUser,sequence:number){
  if(!Number.isSafeInteger(sequence)||sequence<0)throw new BadRequestException('Invalid read cursor');
  return this.db.transaction(async client=>{
   await this.access(id,user,client);
   if(sequence===0)return {success:true};
   const visible=(await client.query(`SELECT m.id FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=$2
    WHERE m.conversation_id=$1 AND m.sequence=$3 AND m.sequence>p.history_from_sequence`,[id,user.id,sequence])).rows[0];
   if(!visible)throw new BadRequestException('Cannot acknowledge unavailable or future messages');
   // Read is a cumulative acknowledgement of authorized history through this
   // record. It also implies delivery; delivery alone never changes unread state.
   await client.query(`INSERT INTO chat_message_deliveries(message_id,user_id)
    SELECT m.id,$2 FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=$2
    WHERE m.conversation_id=$1 AND m.sequence<=$3 AND m.sequence>p.history_from_sequence
    ON CONFLICT(message_id,user_id) DO NOTHING`,[id,user.id,sequence]);
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
 async leave(id:string,user:AuthenticatedUser){
  return this.db.transaction(async client=>{
   const row=await this.access(id,user,client);
   const p=(await client.query('SELECT group_role FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[id,user.id])).rows[0];
   if(row.is_group&&p.group_role==='OWNER')throw new ConflictException('Transfer ownership before leaving the group');
   await client.query("UPDATE chat_participants SET left_at=NOW(),group_role='MEMBER' WHERE conversation_id=$1 AND user_id=$2",[id,user.id]);
   if(row.is_group)await this.groupChange(row,user,'CHAT_MEMBER_LEFT',{memberUserId:user.id},client);
   return {success:true};
  });
 }
 async block(id:string,user:AuthenticatedUser){
  return this.db.transaction(async client=>{
   const conv=await this.access(id,user,client);if(conv.conversation_type!=='DIRECT')throw new BadRequestException('Only direct conversations can be blocked');
   await client.query('INSERT INTO chat_blocks(blocker_id,blocked_id) SELECT $2,user_id FROM chat_participants WHERE conversation_id=$1 AND user_id<>$2 ON CONFLICT DO NOTHING',[id,user.id]);return {success:true};
  });
 }

 /** Group authority is conversation-specific. Platform administrators cannot
  * inspect or manage a private group without active membership. */
 private async eligiblePerson(personId:string,user:AuthenticatedUser,client:PoolClient){
  const person=await this.genealogy.getPersonById(uuid(personId,'person'),{
   userId:user.id,personId:user.personId,roles:user.roles,roleAssignments:user.roleAssignments,branchIds:user.branchIds,isVerifiedMember:true,
  });
  const row=(await client.query(`SELECT p.*,u.id AS account_id FROM user_accounts u JOIN persons p ON p.id=u.person_id
   WHERE p.id=$1 AND p.is_archived=FALSE AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER'))`,[person.id])).rows[0];
  if(!row||this.privacy.isMinorOrUncertainAge(row))throw new BadRequestException('This profile is unavailable for group chat');
  return row;
 }
 private async groupChange(row:any,user:AuthenticatedUser,action:string,value:any,client:PoolClient){
  const updated=(await client.query('UPDATE chat_conversations SET version=version+1,updated_at=NOW() WHERE id=$1 RETURNING version',[row.id])).rows[0];
  await this.audit.recordAuditIntent({action,entityType:'chat_conversation',entityId:row.id,actorId:user.id,
   newValue:{...value,version:updated.version}},client);
  return {success:true,version:updated.version};
 }
 private async groupAuthority(id:string,user:AuthenticatedUser,client:PoolClient,version?:number,ownerOnly=false){
  const row=await this.access(id,user,client);
  if(!row.is_group)throw new BadRequestException('Group action requires a group conversation');
  const role=(await client.query('SELECT group_role FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[id,user.id])).rows[0].group_role;
  if(!['OWNER','ADMIN'].includes(role)||ownerOnly&&role!=='OWNER')throw new ForbiddenException(ownerOnly?'Group owner authority required':'Group administrator authority required');
  if(!Number.isInteger(version)||version!==row.version)throw new ConflictException('Group changed; reload before managing it');
  return {...row,actor_group_role:role};
 }
 async createGroup(user:AuthenticatedUser,body:any){
  if(body.personId||body.branchId)throw new BadRequestException('Private groups use selected member profiles');
  const title=textField(body.title,'Title',150);
  const description=body.description===undefined?'':textField(body.description,'Description',1000,0);
  const ids=body.memberPersonIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>49||new Set(ids).size!==ids.length)throw new BadRequestException('Select 1 to 49 distinct other members');
  ids.forEach(id=>uuid(id,'person'));
  return this.db.transaction(async client=>{
   const self=(await client.query('SELECT person_id FROM user_accounts WHERE id=$1',[user.id])).rows[0];
   if(!self?.person_id)throw new ForbiddenException('A verified adult profile is required to create a group');
   await this.eligiblePerson(self.person_id,user,client);
   const members=[];
   for(const id of ids){
    const target=await this.eligiblePerson(id,user,client);
    if(target.account_id===user.id)throw new BadRequestException('The creator is already the group owner');
    if(members.includes(target.account_id))throw new BadRequestException('Select distinct eligible members; merged profiles may identify the same account');
    if((await client.query('SELECT 1 FROM chat_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[user.id,target.account_id])).rows.length)throw new ForbiddenException('Group invitation is blocked');
    members.push(target.account_id);
   }
   const row=(await client.query(`INSERT INTO chat_conversations(conversation_type,is_group,created_by,title,description)
    VALUES('GROUP',TRUE,$1,$2,$3) RETURNING *`,[user.id,title,description])).rows[0];
   await client.query("INSERT INTO chat_participants(conversation_id,user_id,group_role) VALUES($1,$2,'OWNER')",[row.id,user.id]);
   for(const id of members)await client.query("INSERT INTO chat_participants(conversation_id,user_id) VALUES($1,$2)",[row.id,id]);
   await this.audit.recordAuditIntent({action:'CHAT_GROUP_CREATED',entityType:'chat_conversation',entityId:row.id,actorId:user.id,
    newValue:{memberUserIds:members,version:1}},client);
   return {id:row.id,type:'GROUP',title:row.title,description:row.description,isParticipant:true,myRole:'OWNER',version:1};
  });
 }
 async info(id:string,user:AuthenticatedUser){
  const row=await this.access(id,user);
  const role=(await this.db.query('SELECT group_role FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[id,user.id])).rows[0].group_role;
  const members=(await this.db.query(`SELECT p.user_id AS "userId",p.group_role AS role,
   CASE WHEN person.is_archived=FALSE AND person.is_minor_protected=FALSE AND
    (person.profile_visibility IN ('PUBLIC','VERIFIED_COMMUNITY') OR u.id=$2) THEN COALESCE(n.full_name,'Member') ELSE 'Member' END AS name
   FROM chat_participants p JOIN user_accounts u ON u.id=p.user_id LEFT JOIN persons person ON person.id=u.person_id
   LEFT JOIN LATERAL(SELECT full_name FROM person_names WHERE person_id=person.id ORDER BY is_primary DESC,id LIMIT 1)n ON TRUE
   WHERE p.conversation_id=$1 AND p.left_at IS NULL AND p.removed_at IS NULL
   ORDER BY CASE p.group_role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,p.user_id LIMIT 200`,[id,user.id])).rows;
  const count=(await this.db.query('SELECT count(*)::int AS count FROM chat_participants WHERE conversation_id=$1 AND left_at IS NULL AND removed_at IS NULL',[id])).rows[0].count;
  return {id:row.id,type:row.conversation_type,title:row.title,description:row.description,version:row.version,
   myRole:role,canManage:row.is_group&&['OWNER','ADMIN'].includes(role),isOwner:row.is_group&&role==='OWNER',members,memberCount:count};
 }
 async updateGroup(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','title','description']);
  if(body.title===undefined&&body.description===undefined)throw new BadRequestException('Group settings are required');
  const title=body.title===undefined?undefined:textField(body.title,'Title',150);
  const description=body.description===undefined?undefined:textField(body.description,'Description',1000,0);
  return this.db.transaction(async client=>{
   const row=await this.groupAuthority(id,user,client,body.version);
   await client.query('UPDATE chat_conversations SET title=$2,description=$3 WHERE id=$1',[id,title??row.title,description??row.description]);
   return this.groupChange(row,user,'CHAT_GROUP_SETTINGS_CHANGED',{},client);
  });
 }
 async addMember(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','personId']);uuid(body.personId,'person');
  return this.db.transaction(async client=>{
   const row=await this.groupAuthority(id,user,client,body.version);
   const target=await this.eligiblePerson(body.personId,user,client);
   if(row.branch_id&&!(await client.query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND
    (branch_id=$2 OR role IN ('SUPER_ADMIN','CENTRAL_ADMIN')) AND role NOT IN ('GUEST','REGISTERED_USER')`,[target.account_id,row.branch_id])).rows.length)throw new ForbiddenException('Member is outside the group branch');
   if((await client.query('SELECT 1 FROM chat_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[user.id,target.account_id])).rows.length)throw new ForbiddenException('Group invitation is blocked');
   const previous=(await client.query('SELECT * FROM chat_participants WHERE conversation_id=$1 AND user_id=$2',[id,target.account_id])).rows[0];
   if(previous&&!previous.left_at)throw new ConflictException('Member is already in the group');
   if(row.conversation_type==='GROUP'&&(await client.query('SELECT count(*)::int AS count FROM chat_participants WHERE conversation_id=$1 AND left_at IS NULL',[id])).rows[0].count>=50)throw new ConflictException('Private groups support up to 50 members');
   const boundary=row.conversation_type==='GROUP'?(await client.query('SELECT COALESCE(MAX(sequence),0) AS sequence FROM chat_messages WHERE conversation_id=$1',[id])).rows[0].sequence:0;
   await client.query(`INSERT INTO chat_participants(conversation_id,user_id,history_from_sequence) VALUES($1,$2,$3)
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL,removed_at=NULL,group_role='MEMBER',joined_at=NOW(),history_from_sequence=$3`,[id,target.account_id,boundary]);
   return this.groupChange(row,user,'CHAT_GROUP_MEMBER_ADDED',{memberUserId:target.account_id},client);
  });
 }
 async removeMember(id:string,targetId:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version']);uuid(targetId,'member');
  return this.db.transaction(async client=>{
   const row=await this.groupAuthority(id,user,client,body.version);
   const target=(await client.query('SELECT * FROM chat_participants WHERE conversation_id=$1 AND user_id=$2 AND left_at IS NULL',[id,targetId])).rows[0];
   if(!target)throw new NotFoundException('Current group member not found');
   if(targetId===user.id||target.group_role==='OWNER'||row.actor_group_role==='ADMIN'&&target.group_role!=='MEMBER')throw new ForbiddenException('Cannot remove this member; transfer ownership or leave instead');
   await client.query("UPDATE chat_participants SET left_at=NOW(),removed_at=NOW(),group_role='MEMBER' WHERE conversation_id=$1 AND user_id=$2",[id,targetId]);
   return this.groupChange(row,user,'CHAT_GROUP_MEMBER_REMOVED',{memberUserId:targetId},client);
  });
 }
 async setMemberRole(id:string,targetId:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','role']);uuid(targetId,'member');
  if(!['ADMIN','MEMBER'].includes(body.role))throw new BadRequestException('Choose ADMIN or MEMBER; ownership uses transfer');
  return this.db.transaction(async client=>{
   const row=await this.groupAuthority(id,user,client,body.version,true);
   if(body.role==='ADMIN'){
    const target=(await client.query('SELECT u.person_id FROM chat_participants p JOIN user_accounts u ON u.id=p.user_id WHERE p.conversation_id=$1 AND p.user_id=$2 AND p.left_at IS NULL',[id,targetId])).rows[0];
    if(!target?.person_id)throw new NotFoundException('Eligible current member not found');
    await this.eligiblePerson(target.person_id,user,client);
    if(row.branch_id&&!(await client.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND (branch_id=$2 OR role IN ('SUPER_ADMIN','CENTRAL_ADMIN')) AND role NOT IN ('GUEST','REGISTERED_USER')",[targetId,row.branch_id])).rows.length)throw new ForbiddenException('Member is outside the group branch');
   }
   const changed=(await client.query(`UPDATE chat_participants SET group_role=$3 WHERE conversation_id=$1 AND user_id=$2
    AND left_at IS NULL AND removed_at IS NULL AND group_role<>'OWNER' RETURNING user_id`,[id,targetId,body.role])).rows[0];
   if(!changed)throw new NotFoundException('Eligible current member not found');
   return this.groupChange(row,user,'CHAT_GROUP_ROLE_CHANGED',{memberUserId:targetId,role:body.role},client);
  });
 }
 async transferOwner(id:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['version','userId']);uuid(body.userId,'member');
  return this.db.transaction(async client=>{
   const row=await this.groupAuthority(id,user,client,body.version,true);
   if(body.userId===user.id)throw new BadRequestException('Choose another current member');
   const target=(await client.query(`SELECT u.person_id FROM chat_participants p JOIN user_accounts u ON u.id=p.user_id
    WHERE p.conversation_id=$1 AND p.user_id=$2 AND p.left_at IS NULL AND p.removed_at IS NULL`,[id,body.userId])).rows[0];
   if(!target?.person_id)throw new NotFoundException('Eligible current member not found');
   await this.eligiblePerson(target.person_id,user,client);
   if(row.branch_id&&!(await client.query("SELECT 1 FROM user_roles WHERE user_id=$1 AND (branch_id=$2 OR role IN ('SUPER_ADMIN','CENTRAL_ADMIN')) AND role NOT IN ('GUEST','REGISTERED_USER')",[body.userId,row.branch_id])).rows.length)throw new ForbiddenException('Member is outside the group branch');
   await client.query("UPDATE chat_participants SET group_role='ADMIN' WHERE conversation_id=$1 AND user_id=$2",[id,user.id]);
   await client.query("UPDATE chat_participants SET group_role='OWNER' WHERE conversation_id=$1 AND user_id=$2",[id,body.userId]);
   return this.groupChange(row,user,'CHAT_GROUP_OWNER_TRANSFERRED',{previousOwnerUserId:user.id,ownerUserId:body.userId},client);
  });
 }
 async reportMessage(id:string,messageId:string,user:AuthenticatedUser,body:any){
  allowedFields(body,['reason']);uuid(messageId,'message');
  const reason=textField(body.reason,'Report reason',1000);
  return this.db.transaction(async client=>{
   await this.access(id,user,client);
   const message=(await client.query(`SELECT m.id FROM chat_messages m JOIN chat_participants p ON p.conversation_id=m.conversation_id AND p.user_id=$3
    WHERE m.conversation_id=$1 AND m.id=$2 AND m.deleted_at IS NULL AND m.sequence>p.history_from_sequence`,[id,messageId,user.id])).rows[0];
   if(!message)throw new NotFoundException('Visible message not found');
   const report=(await client.query(`INSERT INTO chat_message_reports(message_id,reporter_id,reason) VALUES($1,$2,$3)
    ON CONFLICT(message_id,reporter_id) DO NOTHING RETURNING id,status`,[messageId,user.id,reason])).rows[0];
   if(!report)return {alreadyReported:true};
   await this.audit.recordAuditIntent({action:'CHAT_MESSAGE_REPORTED',entityType:'chat_report',entityId:report.id,actorId:user.id},client);
   return {...report,alreadyReported:false};
  });
 }
 async reviewReports(user:AuthenticatedUser){
  member(user);
  if(!canModerate(user))throw new ForbiddenException('Central moderation authority required');
  // Only the explicitly reported record is disclosed, never surrounding history.
  return (await this.db.query(`SELECT r.id,r.reason,r.status,r.created_at AS "createdAt",r.resolved_at AS "resolvedAt",
   EXISTS(SELECT 1 FROM chat_message_attachments link JOIN media_assets a ON a.id=link.asset_id WHERE link.message_id=m.id AND m.deleted_at IS NULL AND a.quarantine_status='CLEAN' AND a.retention_status='ACTIVE') AS "hasAttachment",
   CASE WHEN m.deleted_at IS NULL THEN m.message_text ELSE '' END AS content,m.deleted_at IS NOT NULL AS "isDeleted"
   FROM chat_message_reports r JOIN chat_messages m ON m.id=r.message_id
   ORDER BY r.created_at DESC,r.id LIMIT 100`)).rows;
 }
 async resolveReport(reportId:string,user:AuthenticatedUser,body:any){
  member(user);uuid(reportId,'report');allowedFields(body,['decision','note']);
  if(!canModerate(user))throw new ForbiddenException('Central moderation authority required');
  if(!['DISMISSED','REMOVED'].includes(body.decision))throw new BadRequestException('Choose DISMISSED or REMOVED');
  const note=textField(body.note,'Moderation note',1000);
  return this.db.transaction(async client=>{
   const report=(await client.query('SELECT * FROM chat_message_reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
   if(!report)throw new NotFoundException('Report not found');
   if(report.status!=='OPEN')throw new ConflictException('Report already resolved');
   if(report.reporter_id===user.id)throw new ForbiddenException('Another moderator must review your report');
   const message=(await client.query('SELECT sender_id FROM chat_messages WHERE id=$1 FOR UPDATE',[report.message_id])).rows[0];
   if(message.sender_id===user.id)throw new ForbiddenException('Another moderator must review your message');
   if(body.decision==='REMOVED')await client.query('UPDATE chat_messages SET deleted_at=coalesce(deleted_at,NOW()) WHERE id=$1',[report.message_id]);
   await client.query('UPDATE chat_message_reports SET status=$2,resolved_by=$3,resolved_at=NOW(),resolution_note=$4 WHERE id=$1',[reportId,body.decision,user.id,note]);
   await this.audit.recordAuditIntent({action:'CHAT_REPORT_RESOLVED',entityType:'chat_report',entityId:reportId,actorId:user.id,newValue:{decision:body.decision}},client);
   return {success:true};
  });
 }

}
