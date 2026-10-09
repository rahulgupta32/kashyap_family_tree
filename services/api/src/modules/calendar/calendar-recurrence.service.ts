import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { allowedFields, textField, uuid } from '../community/community-policy';
import { annualOccurrence, ANNUAL_RULE_VERSION } from './annual-occurrence';
import { CalendarDeliveryService } from './calendar-delivery.service';

@Injectable()
export class CalendarRecurrenceService implements OnModuleInit, OnModuleDestroy {
 private timer?:NodeJS.Timeout; private busy=false;
 private readonly logger=new Logger(CalendarRecurrenceService.name);
 constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository,private readonly delivery:CalendarDeliveryService){}
 onModuleInit(){if(process.env.NODE_ENV!=='test')this.timer=setInterval(async()=>{
  if(this.busy)return;this.busy=true;try{await this.materializeDue();}catch{this.logger.error('Annual recurrence transaction failed; work remains pending');}finally{this.busy=false;}
 },60000);}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private async actor(tx:any,id:string,review=false){
  const u=(await tx.query(`SELECT u.* FROM user_accounts u WHERE u.id=$1 AND u.is_active AND u.is_phone_verified
   AND NOT u.is_suspended AND u.deleted_at IS NULL FOR SHARE`,[id])).rows[0];
  const roles=(await tx.query('SELECT role FROM user_roles WHERE user_id=$1 FOR SHARE',[id])).rows.map((r:any)=>r.role);
  if(!u||!roles.some((r:string)=>review?r==='SUPER_ADMIN':!['GUEST','REGISTERED_USER'].includes(r)))throw new ForbiddenException('Current verified account and authority required');
  return {...u,isReviewer:roles.includes('SUPER_ADMIN')};
 }
 private async evidence(tx:any,actor:string,id:string,action:string,version:number){
  await this.audit.recordAuditIntent({actorId:actor,entityId:id,entityType:'CALENDAR_RECURRENCE',action,newValue:{version,ruleVersion:ANNUAL_RULE_VERSION}},tx);
 }
 private async source(tx:any,id:string,owner:string){
  const e=(await tx.query(`SELECT *,to_char(starts_at AT TIME ZONE 'Asia/Kathmandu','YYYY-MM-DD') AS source_date
   FROM calendar_events WHERE id=$1 FOR SHARE`,[uuid(id)])).rows[0];
  if(!e||e.host_user_id!==owner)throw new NotFoundException('Own source event unavailable');
  if(e.recurrence_rule_id||e.lifecycle_state!=='ACTIVE'||!['GENERAL_EVENT','COMMUNITY_MEETING'].includes(e.event_type)
   ||!e.starts_at||e.provenance?.source!=='ORGANIZER_SUPPLIED_AD')throw new BadRequestException('Only active, explicitly Gregorian general events or meetings may recur; cultural rules remain unavailable');
  return e;
 }
 private async rule(tx:any,id:string){const r=(await tx.query('SELECT * FROM calendar_recurrence_rules WHERE id=$1 FOR UPDATE',[uuid(id)])).rows[0];if(!r)throw new NotFoundException('Recurrence unavailable');return r;}
 private async recusal(tx:any,reviewer:any,ownerId:string){
  if(reviewer.id===ownerId)throw new ForbiddenException('Independent reviewer required');
  const owner=await this.actor(tx,ownerId);
  if(!reviewer.person_id||!owner.person_id)return;
  const family=(await tx.query(`SELECT 1 FROM parent_links WHERE (parent_id=$1 AND child_id=$2) OR (parent_id=$2 AND child_id=$1)
   UNION SELECT 1 FROM spouse_links WHERE (person_id=$1 AND spouse_id=$2) OR (person_id=$2 AND spouse_id=$1)`,[owner.person_id,reviewer.person_id])).rows.length;
  if(owner.person_id===reviewer.person_id||family)throw new ForbiddenException('Immediate family reviewer must recuse');
 }
 async propose(actor:string,b:any){allowedFields(b,['sourceEventId','sourceVersion','localTime','leapDayPolicy','sourceRef','consent']);
  const sourceRef=textField(b.sourceRef,'Verification evidence reference',500,10);
  if(b.consent!==true||!Number.isInteger(b.sourceVersion))throw new BadRequestException('Explicit private reminder consent and source version required');
  return this.db.transaction(async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`annual-proposal:${actor}`]);
   await this.actor(tx,actor);const e=await this.source(tx,b.sourceEventId,actor);
   if(e.version!==b.sourceVersion)throw new ConflictException('Source changed; review its current version');
   annualOccurrence(e.source_date,2028,b.localTime,b.leapDayPolicy);
   // Owner lock above serializes the quota and duplicate check.
   if(Number((await tx.query("SELECT count(*) FROM calendar_recurrence_rules WHERE owner_id=$1 AND state IN ('PENDING','APPROVED')",[actor])).rows[0].count)>=100)throw new ConflictException('Withdraw existing rules before adding more');
   if((await tx.query("SELECT 1 FROM calendar_recurrence_rules WHERE owner_id=$1 AND source_event_id=$2 AND state IN ('PENDING','APPROVED')",[actor,e.id])).rows.length)throw new ConflictException('Source already has an active proposal; withdraw it first');
   const r=(await tx.query(`INSERT INTO calendar_recurrence_rules(owner_id,source_event_id,source_version,source_date,local_time,leap_policy,rule_version,source_ref,consent_granted)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,[actor,e.id,e.version,e.source_date,b.localTime,b.leapDayPolicy,ANNUAL_RULE_VERSION,sourceRef])).rows[0];
   await tx.query("INSERT INTO calendar_recurrence_decisions(rule_id,version,actor_id,action,reason) VALUES($1,1,$2,'PROPOSED',$3)",[r.id,actor,sourceRef]);
   await this.evidence(tx,actor,r.id,'CALENDAR_RECURRENCE_PROPOSED',1);return r;
  });
 }
 async list(actor:string,q:any){allowedFields(q,['after','queue']);const after=q.after===undefined?null:uuid(q.after);
  if(q.queue!==undefined&&!['true','false'].includes(q.queue))throw new BadRequestException('Invalid queue filter');
  return this.db.transaction(async tx=>{await this.actor(tx,actor,q.queue==='true');
   const rows=(await tx.query(`SELECT * FROM calendar_recurrence_rules WHERE ($1::uuid IS NULL OR id>$1)
    AND (($3::boolean AND state='PENDING' AND owner_id<>$2) OR (NOT $3::boolean AND owner_id=$2)) ORDER BY id LIMIT 51`,[after,actor,q.queue==='true'])).rows;
   for(const r of rows.slice(0,50))await this.evidence(tx,actor,r.id,'CALENDAR_RECURRENCE_READ',r.version);
   return {items:rows.slice(0,50),nextAfter:rows.length>50?rows[49].id:null};
  });
 }
 async decide(actor:string,id:string,b:any){allowedFields(b,['version','decision','reason']);const reason=textField(b.reason,'Decision reason',1000,10);
  if(!Number.isInteger(b.version)||!['APPROVED','REJECTED','WITHDRAWN'].includes(b.decision))throw new BadRequestException('Version and explicit decision required');
  return this.db.transaction(async tx=>{
   const r=await this.rule(tx,id),u=await this.actor(tx,actor,b.decision!=='WITHDRAWN');
   if(b.decision==='WITHDRAWN'){if(r.owner_id!==actor)throw new ForbiddenException('Only owner may withdraw');}
   else{await this.recusal(tx,u,r.owner_id);if(r.state!=='PENDING')throw new ConflictException('Proposal already decided');}
   if(r.version!==b.version||['REJECTED','WITHDRAWN'].includes(r.state))throw new ConflictException('Proposal changed; reload');
   if(b.decision==='APPROVED'){const e=await this.source(tx,r.source_event_id,r.owner_id);if(e.version!==r.source_version)throw new ConflictException('Source changed; submit a fresh proposal');}
   const next=(await tx.query(`UPDATE calendar_recurrence_rules SET state=$2::varchar,version=version+1,
    reviewer_id=CASE WHEN $2::varchar='WITHDRAWN' THEN reviewer_id ELSE $3::uuid END,
    review_reason=CASE WHEN $2::varchar='WITHDRAWN' THEN review_reason ELSE $4::varchar END,next_check_at=NOW() WHERE id=$1 RETURNING *`,[r.id,b.decision,actor,reason])).rows[0];
   await tx.query('INSERT INTO calendar_recurrence_decisions(rule_id,version,actor_id,action,reason) VALUES($1,$2,$3,$4,$5)',[r.id,next.version,actor,b.decision,reason]);
   await this.evidence(tx,actor,r.id,`CALENDAR_RECURRENCE_${b.decision}`,next.version);return next;
  });
 }
 async preview(actor:string,id:string,q:any){allowedFields(q,['year']);if(typeof q.year!=='string'||!/^\d{4}$/.test(q.year))throw new BadRequestException('Explicit supported year required');
  return this.db.transaction(async tx=>{const u=await this.actor(tx,actor),r=await this.rule(tx,id);
   if(r.owner_id!==actor&&!u.isReviewer)throw new NotFoundException('Recurrence unavailable');
   await this.evidence(tx,actor,r.id,'CALENDAR_RECURRENCE_PREVIEW',r.version);
   const current=(await tx.query('SELECT calendar_recurrence_current($1) AS valid',[r.id])).rows[0].valid;
   return {ruleVersion:r.rule_version,state:r.state,current,year:Number(q.year),startsAt:annualOccurrence(r.source_date,Number(q.year),r.local_time,r.leap_policy),timezone:'Asia/Kathmandu',audienceScope:'PRIVATE',deliveryEnabled:current};
  });
 }
 async materializeDue():Promise<number>{return this.db.transaction(async tx=>{
  const rules=(await tx.query("SELECT * FROM calendar_recurrence_rules WHERE state='APPROVED' AND next_check_at<=NOW() ORDER BY next_check_at,id LIMIT 20 FOR UPDATE SKIP LOCKED")).rows;
  let created=0;const year=Number((await tx.query("SELECT to_char(NOW() AT TIME ZONE 'Asia/Kathmandu','YYYY') AS year")).rows[0].year);
  for(const r of rules){
   if((await tx.query('SELECT calendar_recurrence_current($1) AS valid',[r.id])).rows[0].valid){
    // Lock live inputs so approval/source revocation cannot race occurrence creation.
    await this.actor(tx,r.owner_id);const reviewer=await this.actor(tx,r.reviewer_id,true);await this.recusal(tx,reviewer,r.owner_id);
    const source=await this.source(tx,r.source_event_id,r.owner_id);
    if(source.version===r.source_version)for(const y of [year,year+1].filter(y=>y<=2090)){
     const at=annualOccurrence(r.source_date,y,r.local_time,r.leap_policy);if(!at||new Date(at).getTime()<=Date.now())continue;
     const e=(await tx.query(`INSERT INTO calendar_events(host_user_id,title,event_type,audience_scope,is_public,starts_at,reminder_offsets,provenance,recurrence_rule_id,recurrence_year)
      VALUES($1,'Private annual reminder','GENERAL_EVENT','PRIVATE',FALSE,$2,ARRAY[1440],$3,$4,$5)
      ON CONFLICT(recurrence_rule_id,recurrence_year) WHERE recurrence_rule_id IS NOT NULL DO NOTHING RETURNING *`,
      [r.owner_id,at,JSON.stringify({source:'APPROVED_AD_ANNUAL',ruleVersion:r.rule_version,sourceEventId:r.source_event_id,sourceVersion:r.source_version,ruleId:r.id,year:y}),r.id,y])).rows[0];
     if(e){await tx.query("INSERT INTO calendar_event_revisions(event_id,version,actor_id,action,snapshot) VALUES($1,1,$2,'CALENDAR_EVENT_CREATED',$3)",[e.id,r.owner_id,JSON.stringify({...e,invitedUserIds:[]})]);
      await this.evidence(tx,r.owner_id,r.id,'CALENDAR_RECURRENCE_MATERIALIZED',r.version);await this.delivery.recordNotice(e,'CALENDAR_EVENT_CREATED',r.owner_id,tx);await this.delivery.reschedule(e,tx);created++;}
    }
   }
   await tx.query("UPDATE calendar_recurrence_rules SET next_check_at=NOW()+INTERVAL '1 day' WHERE id=$1",[r.id]);
  }return created;
 });}
}
