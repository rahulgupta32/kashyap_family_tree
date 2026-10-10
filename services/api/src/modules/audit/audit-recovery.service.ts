import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Role } from '@kashyap/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { privilegedSessionExpired } from '../auth/privileged-session.policy';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
@Injectable()
export class AuditRecoveryService {
 constructor(private readonly db:DatabaseService,private readonly outbox:AuditOutboxRepository,private readonly audit:AuditRepository){}
 private id(value:unknown):string {
  if(typeof value!=='string'||!uuid.test(value))throw new BadRequestException('Invalid recovery identifier');
  return value.toLowerCase();
 }
 private async authorized(tx:any,user:AuthenticatedUser){
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('authenticator:' || $1::text))",[user.id]);
  const account=(await tx.query('SELECT * FROM user_accounts WHERE id=$1 FOR SHARE',[user.id])).rows[0];
  const session=(await tx.query('SELECT * FROM user_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',[user.sessionId,user.id])).rows[0];
  const roles=(await tx.query('SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE',[user.id])).rows.map((r:any)=>r.role);
  const factor=(await tx.query('SELECT generation,enabled_at FROM account_authenticators WHERE user_id=$1 FOR SHARE',[user.id])).rows[0];
  if(!account?.is_active||account.is_suspended||account.deleted_at||!session||session.revoked_at||new Date(session.expires_at).getTime()<=Date.now()
   ||!roles.includes(Role.SUPER_ADMIN)||privilegedSessionExpired(roles,session.authenticated_at))throw new ForbiddenException('Current Super Admin authority and fresh authentication required');
  // This sensitive recovery operation requires MFA even for non-production fixtures.
  if(!factor?.enabled_at||!session.mfa_verified_at||session.mfa_generation!==factor.generation)throw new ForbiddenException('Current authenticator verification required');
 }
 private async transaction<T>(user:AuthenticatedUser,work:(tx:any)=>Promise<T>):Promise<T>{
  try{return await this.db.transaction(async tx=>{await this.authorized(tx,user);return work(tx);});}
  catch(error){if(error instanceof HttpException)throw error;throw new ServiceUnavailableException({message:'Recovery result is unconfirmed. Refresh before retrying.',messageNepali:'पुनः प्रयासको नतिजा पुष्टि भएको छैन। अवस्था ताजा गरी पुनः जाँच गर्नुहोस्।'});}
 }
 async list(user:AuthenticatedUser){
  return this.transaction(user,async tx=>({
   exhausted:(await tx.query("SELECT id,created_at,retry_count FROM audit_outbox WHERE status='FAILED' AND retry_count>=10 ORDER BY created_at,id LIMIT 20")).rows,
   requests:(await tx.query(`SELECT r.id,r.outbox_id,r.proposed_by,r.reason_code,r.created_at,r.expires_at,
     d.approved_by,d.outcome FROM audit_delivery_recovery_requests r LEFT JOIN audit_delivery_recovery_decisions d ON d.request_id=r.id
     ORDER BY r.created_at DESC,r.id LIMIT 20`)).rows,
  }));
 }
 async propose(user:AuthenticatedUser,outboxId:string,body:unknown){
  const event=this.id(outboxId);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestId','reasonCode'].includes(k)))throw new BadRequestException('Invalid recovery proposal');
  const input=body as any,id=this.id(input.requestId),reason=input.reasonCode;
  if(!['DEPENDENCY_RECOVERED','DELIVERY_CONFIGURATION_REPAIRED'].includes(reason))throw new BadRequestException('Invalid recovery reason');
  return this.transaction(user,async tx=>{
   // Serialize proposals for the event, including concurrent requests with the same ID.
   const eventRow=(await tx.query('SELECT id,status,retry_count FROM audit_outbox WHERE id=$1 FOR UPDATE',[event])).rows[0];
   if(!eventRow)throw new NotFoundException('Retained event not found');
   const existing=(await tx.query('SELECT * FROM audit_delivery_recovery_requests WHERE id=$1',[id])).rows[0];
   if(existing){if(existing.outbox_id!==event||existing.proposed_by!==user.id||existing.reason_code!==reason)throw new ConflictException('Recovery identifier belongs to a different proposal');return {id,alreadyProposed:true};}
   if(eventRow.status!=='FAILED'||eventRow.retry_count<10)throw new ConflictException('Only exhausted retained events require recovery');
   if((await tx.query(`SELECT r.id FROM audit_delivery_recovery_requests r WHERE r.outbox_id=$1 AND r.expires_at>clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM audit_delivery_recovery_decisions d WHERE d.request_id=r.id)`,[event])).rows.length)throw new ConflictException('A current recovery proposal already exists');
   await tx.query('INSERT INTO audit_delivery_recovery_requests(id,outbox_id,proposed_by,reason_code) VALUES($1,$2,$3,$4)',[id,event,user.id,reason]);
   await this.outbox.recordAuditIntent({action:'AUDIT_RECOVERY_PROPOSED',entityType:'audit_delivery_recovery_requests',entityId:id,actorId:user.id,actorRole:Role.SUPER_ADMIN,newValue:{retainedEventId:event,reasonCode:reason}},tx);
   return {id,alreadyProposed:false};
  });
 }
 async approve(user:AuthenticatedUser,requestId:string){
  const id=this.id(requestId);
  return this.transaction(user,async tx=>{
   const proposal=(await tx.query('SELECT * FROM audit_delivery_recovery_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!proposal)throw new NotFoundException('Recovery proposal not found');
   if(proposal.proposed_by===user.id)throw new ForbiddenException('A different Super Admin must approve recovery');
   const decided=(await tx.query('SELECT approved_by,outcome FROM audit_delivery_recovery_decisions WHERE request_id=$1',[id])).rows[0];
   if(decided){if(decided.approved_by!==user.id)throw new ConflictException('Another approver already decided this request');return {id,outcome:decided.outcome,alreadyDecided:true};}
   if((await tx.query('SELECT expires_at<=clock_timestamp() AS expired FROM audit_delivery_recovery_requests WHERE id=$1',[id])).rows[0].expired)throw new ConflictException('Recovery proposal expired');
   const proposer=(await tx.query(`SELECT a.id FROM user_accounts a JOIN user_roles r ON r.user_id=a.id
    WHERE a.id=$1 AND a.is_active AND NOT a.is_suspended AND a.deleted_at IS NULL AND r.role='SUPER_ADMIN' FOR SHARE OF a,r`,[proposal.proposed_by])).rows[0];
   if(!proposer)throw new ForbiddenException('Proposing administrator no longer has authority');
   const event=(await tx.query('SELECT status,retry_count FROM audit_outbox WHERE id=$1 FOR UPDATE',[proposal.outbox_id])).rows[0];
   let outcome='ALREADY_PROCESSED';
   if(event.status!=='PROCESSED'){
    if(event.status!=='FAILED'||event.retry_count<10)throw new ConflictException('Retained event changed; review again');
    await tx.query('SAVEPOINT recovery_delivery');
    try{await this.outbox.processOutboxEntry(proposal.outbox_id,this.audit,tx);await tx.query('RELEASE SAVEPOINT recovery_delivery');outcome='PROCESSED';}
    catch{await tx.query('ROLLBACK TO SAVEPOINT recovery_delivery');await this.outbox.markFailed(proposal.outbox_id,'AUDIT_RECOVERY_DELIVERY_FAILED',tx);await tx.query('RELEASE SAVEPOINT recovery_delivery');outcome='FAILED';}
   }
   await tx.query('INSERT INTO audit_delivery_recovery_decisions(request_id,approved_by,outcome) VALUES($1,$2,$3)',[id,user.id,outcome]);
   await this.outbox.recordAuditIntent({action:'AUDIT_RECOVERY_DECIDED',entityType:'audit_delivery_recovery_requests',entityId:id,actorId:user.id,actorRole:Role.SUPER_ADMIN,newValue:{retainedEventId:proposal.outbox_id,outcome}},tx);
   return {id,outcome,alreadyDecided:false};
  });
 }
}
