import { ApplicationSettingsService } from '../application-settings/application-settings.service';
import { Injectable, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { allowedFields, uuid } from '../community/community-policy';
import { EventAudienceScope, GenealogyAudienceSelection } from '@kashyap/contracts';

const visible="p.is_archived=FALSE AND p.is_minor_protected=FALSE AND p.profile_visibility IN ('PUBLIC','VERIFIED_COMMUNITY')";

@Injectable()
export class CalendarAudienceService {
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository,private readonly settings:ApplicationSettingsService){}
 selection(input:any):GenealogyAudienceSelection {
  allowedFields(input,['type','branchId','generation','ancestorPersonId']);
  if(input.type==='BRANCH'){
   allowedFields(input,['type','branchId']);return {type:'BRANCH',branchId:uuid(input.branchId,'branch').toLowerCase()};
  }
  if(input.type==='GENERATION'){
   allowedFields(input,['type','branchId','generation']);
   if(!Number.isInteger(input.generation)||input.generation<1||input.generation>100)throw new BadRequestException('Generation must be 1..100');
   return {type:'GENERATION',branchId:uuid(input.branchId,'branch').toLowerCase(),generation:input.generation};
  }
  if(input.type==='DESCENDANTS'){
   allowedFields(input,['type','ancestorPersonId']);return {type:'DESCENDANTS',ancestorPersonId:uuid(input.ancestorPersonId,'ancestor').toLowerCase()};
  }
  throw new BadRequestException('Choose branch, generation or verified descendants; authority-defined groups are unavailable');
 }
 private async member(userId:string,tx:any){
  const u=(await tx.query(`SELECT u.id,ARRAY(SELECT role FROM user_roles WHERE user_id=u.id ORDER BY role,branch_id) roles,
   ARRAY(SELECT role||':'||COALESCE(branch_id::text,'') FROM user_roles WHERE user_id=u.id ORDER BY role,branch_id) role_assignments
   FROM user_accounts u WHERE u.id=$1 AND u.is_active=TRUE AND u.is_phone_verified=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL`,[userId])).rows[0];
  if(!u||!u.roles.some((r:string)=>!['GUEST','REGISTERED_USER'].includes(r)))throw new ForbiddenException('Verified membership required');return u;
 }
 private async scope(userId:string,branchId:string|null,tx:any){
  if(branchId&&!(await tx.query('SELECT 1 FROM branches WHERE id=$1',[branchId])).rows.length)throw new ForbiddenException('Selection is outside current branch membership');
  if(!(await tx.query(`SELECT 1 FROM user_roles r WHERE r.user_id=$1 AND
   (r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN') OR (r.branch_id=$2 AND r.role NOT IN ('GUEST','REGISTERED_USER'))) LIMIT 1`,[userId,branchId])).rows.length)
   throw new ForbiddenException('Selection is outside current branch membership');
 }
 private async context(tx:any){return (await tx.query("SELECT txid_current_snapshot()::text AS snapshot,clock_timestamp() AS captured_at")).rows[0];}
 async resolve(userId:string,selection:GenealogyAudienceSelection,audienceScope:string,branchId:string|null,tx:any){
  const actor=await this.member(userId,tx);
  const policy=await this.settings.calendarPolicy(tx);
  if(!Object.values(EventAudienceScope).includes(audienceScope as EventAudienceScope))throw new BadRequestException('Invalid event audience');
  if(branchId)uuid(branchId,'branch');
  if(audienceScope==='BRANCH'){
   if(!branchId)throw new BadRequestException('Branch visibility requires a branch');await this.scope(userId,branchId,tx);
  }
  let nodes:any[],edges:any[]=[];
  if(selection.type==='DESCENDANTS'){
   const root=(await tx.query(`SELECT p.id,p.branch_id FROM persons p WHERE p.id=$1 AND ${visible}`,[selection.ancestorPersonId])).rows[0];
   if(!root)throw new ForbiddenException('Ancestor is unavailable');await this.scope(userId,root.branch_id,tx);
   // UNION deduplicates nodes and terminates cycles. No path-based exponential expansion.
   nodes=(await tx.query(`WITH RECURSIVE walk(id) AS (
    SELECT p.id FROM persons p WHERE p.id=$1 AND ${visible}
    UNION SELECT p.id FROM walk w JOIN parent_links l ON l.parent_id=w.id AND l.confidence='VERIFIED' AND l.parent_type IN ('BIOLOGICAL','ADOPTIVE')
     JOIN persons p ON p.id=l.child_id WHERE ${visible})
    SELECT p.id,p.version,p.branch_id,p.generation,p.profile_visibility,p.is_minor_protected,p.is_archived FROM walk w JOIN persons p ON p.id=w.id LIMIT $2`,[root.id,policy.maxPersons+1])).rows;
   if(nodes.length>policy.maxPersons)throw new BadRequestException(`Selection exceeds ${policy.maxPersons} visible Persons; select a narrower audience`);
   const ids=nodes.map(p=>p.id);
   edges=(await tx.query(`SELECT id,parent_id,child_id,parent_type,confidence FROM parent_links
    WHERE confidence='VERIFIED' AND parent_type IN ('BIOLOGICAL','ADOPTIVE') AND parent_id=ANY($1::uuid[]) AND child_id=ANY($1::uuid[]) ORDER BY id LIMIT $2`,[ids,policy.maxEdges+1])).rows;
   if(edges.length>policy.maxEdges)throw new BadRequestException('Selection graph is too large; select a narrower audience');
  }else{
   await this.scope(userId,selection.branchId,tx);
   nodes=(await tx.query(`SELECT p.id,p.version,p.branch_id,p.generation,p.profile_visibility,p.is_minor_protected,p.is_archived FROM persons p WHERE ${visible}
    AND p.branch_id=$1 AND ($2::int IS NULL OR p.generation=$2) ORDER BY p.id LIMIT $3`,[selection.branchId,selection.type==='GENERATION'?selection.generation:null,policy.maxPersons+1])).rows;
   if(nodes.length>policy.maxPersons)throw new BadRequestException(`Selection exceeds ${policy.maxPersons} visible Persons; select a narrower audience`);
  }
  nodes.sort((a,b)=>a.id.localeCompare(b.id));
  const recipientNodes=nodes.filter(p=>selection.type!=='DESCENDANTS'||p.id!==selection.ancestorPersonId).map(p=>p.id);
  const recipients=(await tx.query(`SELECT u.id AS "userId",p.id AS "personId",COALESCE(n.full_name,'Member') AS name,
   ARRAY(SELECT r.role||':'||COALESCE(r.branch_id::text,'') FROM user_roles r WHERE r.user_id=u.id ORDER BY r.role,r.branch_id) AS roles
   FROM user_accounts u JOIN persons p ON p.id=u.person_id
   LEFT JOIN LATERAL(SELECT full_name FROM person_names WHERE person_id=p.id ORDER BY is_primary DESC,id LIMIT 1)n ON TRUE
   WHERE p.id=ANY($1::uuid[]) AND ${visible} AND p.is_claimed=TRUE AND p.claimed_user_id=u.id
    AND u.is_active=TRUE AND u.is_phone_verified=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
    AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER'))
    AND ($2::text<>'BRANCH' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.branch_id=$3 AND r.role NOT IN ('GUEST','REGISTERED_USER')))
    AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND (r.branch_id=$4 OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')) AND r.role NOT IN ('GUEST','REGISTERED_USER')))
   ORDER BY u.id LIMIT $5`,[recipientNodes,audienceScope,branchId,selection.type==='DESCENDANTS'?null:selection.branchId,policy.maxInvitees+1])).rows;
  if(recipients.length>policy.maxInvitees)throw new BadRequestException(`Audience exceeds ${policy.maxInvitees} eligible accounts; select a narrower audience`);
  const basis={policyVersion:1,settings:policy,actorAuthority:{userId,roles:actor.role_assignments},selection,audienceScope,branchId,nodes,edges,recipients:recipients.map(({userId,personId,roles})=>({userId,personId,roles}))};
  const fingerprint=createHash('sha256').update(JSON.stringify(basis)).digest('hex');
  return {basis,fingerprint,policy,recipients:recipients.map(({roles,...rest})=>rest)};
 }
 async preview(userId:string,body:any){
  allowedFields(body,['audienceSelection','audienceScope','branchId']);
  const selection=this.selection(body.audienceSelection),scope=body.audienceScope??'INVITED_ONLY',branch=body.branchId===undefined||body.branchId===null?null:uuid(body.branchId,'branch').toLowerCase();
  return this.db.transaction(async tx=>{
   await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');await tx.query("SET LOCAL statement_timeout='5s'");
   // Serialize per-account preview creation to enforce the durable active-preview bound.
   await tx.query('SELECT id FROM user_accounts WHERE id=$1 FOR UPDATE',[userId]);
   if(Number((await tx.query('SELECT count(*) FROM calendar_audience_previews WHERE actor_id=$1 AND consumed_at IS NULL AND expires_at>NOW()',[userId])).rows[0].count)>=20)
    throw new BadRequestException('Too many active previews; wait for an earlier preview to expire');
   const resolved=await this.resolve(userId,selection,scope,branch,tx);
   const row=(await tx.query(`INSERT INTO calendar_audience_previews(actor_id,selection,audience_scope,branch_id,basis,fingerprint,preview_context,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+($8::int*INTERVAL '1 minute')) RETURNING id,expires_at`,[userId,JSON.stringify(selection),scope,branch,JSON.stringify(resolved.basis),resolved.fingerprint,JSON.stringify(await this.context(tx)),resolved.policy.previewTtlMinutes])).rows[0];
   await this.audit.recordAuditIntent({action:'CALENDAR_AUDIENCE_PREVIEWED',entityType:'CALENDAR_AUDIENCE',entityId:row.id,actorId:userId,newValue:{type:selection.type,recipientCount:resolved.recipients.length}},tx);
   return {previewId:row.id,expiresAt:row.expires_at,selection,recipientCount:resolved.recipients.length,recipients:resolved.recipients};
  }).catch((error:any)=>{if(error.code==='40001'||error.code==='40P01')throw new ConflictException('Concurrent selection change; preview again');throw error;});
 }
 async confirm(userId:string,body:any,tx:any){
  const id=uuid(body.audiencePreviewId,'audience preview'),selection=this.selection(body.audienceSelection);
  const row=(await tx.query('SELECT *,expires_at>clock_timestamp() AS unexpired FROM calendar_audience_previews WHERE id=$1 AND actor_id=$2 FOR UPDATE',[id,userId])).rows[0];
  if(!row||row.consumed_at||!row.unexpired)throw new ConflictException('Audience preview unavailable or expired; preview again');
  const scope=body.audienceScope??'INVITED_ONLY',branch=body.branchId===undefined||body.branchId===null?null:uuid(body.branchId,'branch').toLowerCase();
  if(JSON.stringify(this.selection(row.selection))!==JSON.stringify(selection))throw new ConflictException('Audience selection changed; preview again');
  const resolved=await this.resolve(userId,selection,scope,branch,tx);
  if(resolved.fingerprint!==row.fingerprint)throw new ConflictException('Genealogy or recipient eligibility changed; preview again');
  if(!resolved.recipients.length)throw new BadRequestException('No eligible invitees in this audience');
  return {id,recipients:resolved.recipients,context:await this.context(tx)};
 }
 async recordHistoryRead(userId:string,event:any,tx:any){
  await this.audit.recordAuditIntent({action:'CALENDAR_AUDIENCE_HISTORY_READ',entityType:'CALENDAR_EVENT',entityId:event.id,actorId:userId,newValue:{eventVersion:event.version}},tx);
 }
 async historyAccess(userId:string,basis:any,tx:any){
  await this.member(userId,tx);const selection=this.selection(basis.selection);
  const branch=selection.type==='DESCENDANTS'?basis.nodes.find((p:any)=>p.id===selection.ancestorPersonId)?.branch_id:selection.branchId;
  await this.scope(userId,branch??null,tx);
 }
 async consume(confirmed:any,event:any,userId:string,tx:any){
  const consumed=await tx.query(`UPDATE calendar_audience_previews SET event_id=$2,event_version=$3,consumed_at=clock_timestamp(),send_context=$4
   WHERE id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id`,[confirmed.id,event.id,event.version,JSON.stringify(confirmed.context)]);
  if(!consumed.rows.length)throw new ConflictException('Audience preview expired; preview again');
  await this.audit.recordAuditIntent({action:'CALENDAR_AUDIENCE_CONFIRMED',entityType:'CALENDAR_EVENT',entityId:event.id,actorId:userId,newValue:{eventVersion:event.version,previewId:confirmed.id,recipientCount:confirmed.recipients.length}},tx);
 }
}
