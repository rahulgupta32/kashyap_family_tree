import { ApplicationSettingsService } from '../application-settings/application-settings.service';
import { CalendarAudienceService } from './calendar-audience.service';
import { calendarPeriod,periodCursor } from './calendar-period';
import { isValidBsDate } from '@kashyap/localization';
import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateCalendarEventDto, CalendarEventDetailDto, CalendarEventRsvpDto, EventAudienceScope, ErrorCode, Role, EventType } from '@kashyap/contracts';
import { CalendarDeliveryService } from './calendar-delivery.service';
import { eventVisibility } from './calendar-eligibility';
import { allowedFields, textField, uuid } from '../community/community-policy';

const keys=['title','description','eventType','audienceScope','branchId','location','solarDate','tithiYearBs','tithiMonthBs','tithiPaksha','tithiNumber','invitedUserIds','startsAt','reminderOffsets','version','audienceSelection','audiencePreviewId'];

@Injectable()
export class CalendarService {
  constructor(private readonly db:DatabaseService,private readonly delivery:CalendarDeliveryService,private readonly audiences:CalendarAudienceService,private readonly settings:ApplicationSettingsService){}
  private validateBsYear(year?:number|null){
    if(year!==undefined&&year!==null&&(!Number.isInteger(year)||year<2000||year>2090))
      throw new BadRequestException(`Bikram Sambat year ${year} is outside supported range (BS 2000 - BS 2090)`);
  }
  private validateDate(dto:any){
    if(dto.startsAt){
      if(dto.solarDate||dto.tithiYearBs||dto.tithiMonthBs||dto.tithiPaksha||dto.tithiNumber)
        throw new BadRequestException('Use an explicit Gregorian time or a BS/Tithi source date; no inferred conversion is supported');
      const date=validateGregorianInstant(dto.startsAt);
      return {dateBs:null,startsAt:date,provenance:{source:'ORGANIZER_SUPPLIED_AD',originalValue:dto.startsAt,conversionStatus:'NOT_CONVERTED'}};
    }
    if(dto.solarDate){
      if(typeof dto.solarDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(dto.solarDate))throw new BadRequestException('Invalid solarDate format. Expected YYYY-MM-DD');
      const [year,month,day]=dto.solarDate.split('-').map(Number);this.validateBsYear(year);
      if(!isValidBsDate(year,month,day))throw new BadRequestException(`Invalid Bikram Sambat date: ${dto.solarDate}`);
      return {dateBs:dto.solarDate,startsAt:null,provenance:{source:'SOLAR_BS',dateBs:dto.solarDate}};
    }
    if(!dto.tithiYearBs||!dto.tithiMonthBs||!dto.tithiPaksha||!dto.tithiNumber)throw new BadRequestException('Complete valid Tithi metadata is mandatory when solarDate is not provided');
    this.validateBsYear(dto.tithiYearBs);
    if(!Number.isInteger(dto.tithiMonthBs)||dto.tithiMonthBs<1||dto.tithiMonthBs>12)throw new BadRequestException('tithiMonthBs must be between 1 and 12');
    if(typeof dto.tithiPaksha!=='string'||!['SHUKLA','KRISHNA'].includes(dto.tithiPaksha.toUpperCase()))throw new BadRequestException('Must be SHUKLA or KRISHNA');
    if(!Number.isInteger(dto.tithiNumber)||dto.tithiNumber<1||dto.tithiNumber>15)throw new BadRequestException('tithiNumber: Must be between 1 and 15');
    return {dateBs:null,startsAt:null,provenance:{source:'TITHI_ONLY',conversionStatus:'UNAVAILABLE',reason:'Authority-approved HG-004 conversion is required'}};
  }
  private validate(dto:any){
    allowedFields(dto,keys);
    if(dto.audienceSelection!==undefined){
      this.audiences.selection(dto.audienceSelection);
      if(dto.invitedUserIds!==undefined)throw new BadRequestException('Use genealogy selection or explicit invitees, not both');
    }else if(dto.audiencePreviewId!==undefined)throw new BadRequestException('Audience selection required with its preview');
    textField(dto.title,'Title',255);if(dto.description!==undefined&&dto.description!==null&&dto.description!=='')textField(dto.description,'Description',10000);
    if(!Object.values(EventType).includes(dto.eventType))throw new BadRequestException('Unsupported event type');
    if(!Object.values(EventAudienceScope).includes(dto.audienceScope))throw new BadRequestException('Invalid event audience');
    if(dto.branchId)uuid(dto.branchId,'branch');
    if(dto.location!==undefined&&dto.location!==null&&dto.location!=='')textField(dto.location,'Venue',255);
    const date=this.validateDate(dto);
    const offsets=dto.reminderOffsets??[];
    if(!Array.isArray(offsets)||offsets.length>3||new Set(offsets).size!==offsets.length||offsets.some((x:any)=>![30,60,1440,10080].includes(x)))throw new BadRequestException('Choose up to three distinct reminder offsets: 30, 60, 1440 or 10080 minutes');
    if(offsets.length&&(!date.startsAt||new Date(date.startsAt).getTime()<=Date.now()))throw new BadRequestException('Reminders require an explicit future Gregorian event time; BS/Tithi conversion is unavailable');
    return {...date,offsets};
  }
  private async actor(userId:string,client?:any){
    const u=(await this.db.query(`SELECT u.*,ARRAY(SELECT role FROM user_roles r WHERE r.user_id=u.id) roles
      FROM user_accounts u WHERE u.id=$1 AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL`,[userId],client)).rows[0];
    if(!u)throw new ForbiddenException('Active account required');return u;
  }
  private async authorizeScope(userId:string,dto:any,client:any){
    const u=await this.actor(userId,client);
    if(dto.audienceScope===EventAudienceScope.BRANCH){
      if(!dto.branchId)throw new BadRequestException('Branch audience requires a branch');
      if(!(await client.query(`SELECT 1 FROM branches b WHERE b.id=$1 AND
        (EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=$2 AND r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN'))
        OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=$2 AND r.branch_id=b.id AND r.role NOT IN ('GUEST','REGISTERED_USER')))`,[dto.branchId,userId])).rows.length)
        throw new ForbiddenException('Branch is outside current membership');
    }
    return u;
  }
  async previewInvitations(userId:string,body:any,client?:any){
    if(body?.audienceSelection!==undefined)return this.audiences.preview(userId,body);
    allowedFields(body,['invitedUserIds','audienceScope','branchId']);
    const ids=body.invitedUserIds??[];
    if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length)throw new BadRequestException('Select up to 100 distinct invitees');
    for(const id of ids)uuid(id,'invitee');
    if(body.audienceScope!==undefined&&!Object.values(EventAudienceScope).includes(body.audienceScope))throw new BadRequestException('Invalid event audience');
    if(body.branchId)uuid(body.branchId,'branch');
    const run=async(tx:any)=>{
      const actor=await this.authorizeScope(userId,body,tx);
      const policy=await this.settings.calendarPolicy(tx);
      if(ids.length>policy.maxInvitees)throw new BadRequestException(`Select up to ${policy.maxInvitees} distinct invitees`);
      if(!ids.length)return {recipientCount:0,recipients:[]};
      if(!actor.roles.some((r:string)=>!['GUEST','REGISTERED_USER'].includes(r)))throw new ForbiddenException('Verified membership required to send invitations');
      const rows=(await tx.query(`SELECT u.id AS "userId",p.id AS "personId",COALESCE(n.full_name,'Member') AS name
        FROM user_accounts u JOIN persons p ON p.id=u.person_id
        LEFT JOIN LATERAL(SELECT full_name FROM person_names WHERE person_id=p.id ORDER BY is_primary DESC,id LIMIT 1)n ON TRUE
        WHERE u.id=ANY($1::uuid[]) AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL
          AND p.is_archived=FALSE AND p.is_minor_protected=FALSE
          AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER'))
          AND (p.profile_visibility IN ('PUBLIC','VERIFIED_COMMUNITY') OR u.id=$2)
          AND ($3::text<>'BRANCH' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.branch_id=$4 AND r.role NOT IN ('GUEST','REGISTERED_USER')))
        ORDER BY u.id`,[ids,userId,body.audienceScope??'PRIVATE',body.branchId??null])).rows;
      if(rows.length!==ids.length)throw new ForbiddenException('One or more selected invitees are unavailable in this scope');
      return {recipientCount:rows.length,recipients:rows};
    };
    return client?run(client):this.db.transaction(run);
  }
  async availableInvitees(userId:string,query:any){
    allowedFields(query,['q','audienceScope','branchId']);
    const q=textField(query.q,'Search',100,2);
    const actor=await this.actor(userId);
    if(!actor.roles.some((r:string)=>!['GUEST','REGISTERED_USER'].includes(r)))throw new ForbiddenException('Verified membership required');
    const body={audienceScope:query.audienceScope??'PRIVATE',branchId:query.branchId};
    if(!Object.values(EventAudienceScope).includes(body.audienceScope))throw new BadRequestException('Invalid event audience');
    if(body.branchId)uuid(body.branchId,'branch');
    return this.db.transaction(async client=>{
      await this.authorizeScope(userId,body,client);
      const policy=await this.settings.calendarPolicy(client);
      const candidates=(await client.query(`SELECT DISTINCT u.id FROM user_accounts u JOIN persons p ON p.id=u.person_id
        JOIN person_names n ON n.person_id=p.id WHERE n.full_name ILIKE $1
        AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL AND p.is_archived=FALSE AND p.is_minor_protected=FALSE
        AND p.profile_visibility IN ('PUBLIC','VERIFIED_COMMUNITY')
        AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER'))
        AND ($2::text<>'BRANCH' OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.branch_id=$3 AND r.role NOT IN ('GUEST','REGISTERED_USER')))
        ORDER BY u.id LIMIT $4`,['%'+q.replace(/[\\%_]/g,'\\$&')+'%',body.audienceScope,body.branchId??null,Math.min(20,policy.maxInvitees)])).rows;
      return (await this.previewInvitations(userId,{...body,invitedUserIds:candidates.map((r:any)=>r.id)},client)).recipients;
    });
  }
  private async saveInvitations(eventId:string,ids:string[],client:any){
    await client.query('UPDATE event_invitations SET revoked_at=NOW() WHERE event_id=$1 AND revoked_at IS NULL AND NOT(invited_user_id=ANY($2::uuid[]))',[eventId,ids]);
    for(const id of ids)await client.query(`INSERT INTO event_invitations(event_id,invited_user_id,rsvp_status) VALUES($1,$2,'INVITED')
      ON CONFLICT(event_id,invited_user_id) DO UPDATE SET rsvp_status=CASE WHEN event_invitations.revoked_at IS NOT NULL THEN 'INVITED' ELSE event_invitations.rsvp_status END,
        revoked_at=NULL,updated_at=NOW()`,[eventId,id]);
  }
  private async revision(event:any,action:string,actorId:string,client:any){
    const ids=(await client.query('SELECT invited_user_id FROM event_invitations WHERE event_id=$1 AND revoked_at IS NULL ORDER BY invited_user_id',[event.id])).rows.map((x:any)=>x.invited_user_id);
    await client.query('INSERT INTO calendar_event_revisions(event_id,version,actor_id,action,snapshot) VALUES($1,$2,$3,$4,$5)',
      [event.id,event.version,actorId,action,JSON.stringify({...event,invitedUserIds:ids})]);
    await this.delivery.recordNotice(event,action,actorId,client);
    await this.delivery.reschedule(event,client);
  }
  private async selectionTransaction<T>(run:(client:any)=>Promise<T>):Promise<T>{
    try{return await this.db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await client.query("SET LOCAL statement_timeout='5s'");return run(client);
    });}catch(error:any){if(error.code==='40001'||error.code==='40P01')throw new ConflictException('Concurrent change; reload and preview again');throw error;}
  }
  async createEvent(userId:string,dto:CreateCalendarEventDto):Promise<CalendarEventDetailDto>{
    const date=this.validate(dto);
    return this.selectionTransaction(async client=>{
      await this.authorizeScope(userId,dto,client);
      const confirmed=dto.audienceSelection!==undefined?await this.audiences.confirm(userId,dto,client):null;
      const preview=confirmed??await this.previewInvitations(userId,{invitedUserIds:dto.invitedUserIds??[],audienceScope:dto.audienceScope,branchId:dto.branchId},client);
      const e=(await client.query(`INSERT INTO calendar_events(host_user_id,title,description,event_type,audience_scope,branch_id,location,
        date_bs,tithi_year_bs,tithi_month_bs,tithi_paksha,tithi_number,is_public,provenance,starts_at,reminder_offsets)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [userId,dto.title.trim(),dto.description??null,dto.eventType,dto.audienceScope,dto.branchId??null,dto.location??null,date.dateBs,
          dto.tithiYearBs??null,dto.tithiMonthBs??null,dto.tithiPaksha?.toUpperCase()??null,dto.tithiNumber??null,dto.audienceScope==='PUBLIC',JSON.stringify(date.provenance),date.startsAt,date.offsets])).rows[0];
      await this.saveInvitations(e.id,preview.recipients.map((r:any)=>r.userId),client);
      if(confirmed){
        await client.query('UPDATE calendar_events SET audience_preview_id=$2 WHERE id=$1',[e.id,confirmed.id]);e.audience_preview_id=confirmed.id;
        await this.audiences.consume(confirmed,e,userId,client);
      }
      await this.revision(e,'CALENDAR_EVENT_CREATED',userId,client);
      return this.detail(e,userId,client);
    });
  }
  private async manageable(e:any,userId:string,client?:any){
    if(e.host_user_id===userId)return true;
    return !!(await this.db.query(`SELECT 1 FROM user_roles r WHERE r.user_id=$1 AND
      (r.role='SUPER_ADMIN' OR (r.role='BRANCH_ADMIN' AND r.branch_id=$2))`,[userId,e.branch_id],client)).rows.length;
  }
  private async locked(eventId:string,actor:AuthenticatedUser,client:any,version?:number){
    const e=(await client.query('SELECT * FROM calendar_events WHERE id=$1 FOR UPDATE',[uuid(eventId)])).rows[0];
    if(!e)throw new NotFoundException('Calendar event not found');
    await this.actor(actor.id,client);
    if(!await this.manageable(e,actor.id,client))throw new ForbiddenException({errorCode:ErrorCode.FORBIDDEN,message:'Only the host or scoped administrator may edit this event'});
    if(version!==undefined&&(!Number.isInteger(version)||version!==e.version))throw new ConflictException('Event changed; reload before editing');
    if(e.lifecycle_state==='CANCELLED')throw new ConflictException('Cancelled events cannot be changed');return e;
  }
  async updateEvent(eventId:string,actor:AuthenticatedUser,dto:Partial<CreateCalendarEventDto>):Promise<CalendarEventDetailDto>{
    allowedFields(dto,keys);
    return this.selectionTransaction(async client=>{
      const e=await this.locked(eventId,actor,client,dto.version);
      const current={title:e.title,description:e.description,eventType:e.event_type,audienceScope:e.audience_scope,branchId:e.branch_id,
        location:e.location,solarDate:e.date_bs,tithiYearBs:e.tithi_year_bs,tithiMonthBs:e.tithi_month_bs,tithiPaksha:e.tithi_paksha,tithiNumber:e.tithi_number,
        startsAt:e.starts_at?new Date(e.starts_at).toISOString():undefined,reminderOffsets:e.reminder_offsets};
      const next={...current,...dto};
      const date=this.validate(next);await this.authorizeScope(actor.id,next,client);
      if(e.audience_preview_id&&(dto.audienceScope!==undefined||dto.branchId!==undefined)&&dto.audienceSelection===undefined&&dto.invitedUserIds===undefined)
        throw new BadRequestException('Visibility changed; preview the genealogy audience again');
      const confirmed=dto.audienceSelection!==undefined?await this.audiences.confirm(actor.id,next,client):null;
      if(confirmed)await this.saveInvitations(e.id,confirmed.recipients.map((r:any)=>r.userId),client);
      if(dto.invitedUserIds!==undefined){
        const preview=await this.previewInvitations(actor.id,{invitedUserIds:dto.invitedUserIds,audienceScope:next.audienceScope,branchId:next.branchId},client);
        await this.saveInvitations(e.id,preview.recipients.map((r:any)=>r.userId),client);
      }
      const updated=(await client.query(`UPDATE calendar_events SET title=$2,description=$3,event_type=$4,audience_scope=$5,branch_id=$6,location=$7,
        date_bs=$8,tithi_year_bs=$9,tithi_month_bs=$10,tithi_paksha=$11,tithi_number=$12,is_public=$13,provenance=$14,starts_at=$15,reminder_offsets=$16,
        version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
        [e.id,next.title.trim(),next.description??null,next.eventType,next.audienceScope,next.branchId??null,next.location??null,date.dateBs,
          next.tithiYearBs??null,next.tithiMonthBs??null,next.tithiPaksha?.toUpperCase()??null,next.tithiNumber??null,next.audienceScope==='PUBLIC',JSON.stringify(date.provenance),date.startsAt,date.offsets])).rows[0];
      if(confirmed||dto.invitedUserIds!==undefined){
        updated.audience_preview_id=confirmed?.id??null;
        await client.query('UPDATE calendar_events SET audience_preview_id=$2 WHERE id=$1',[e.id,updated.audience_preview_id]);
        if(confirmed)await this.audiences.consume(confirmed,updated,actor.id,client);
      }
      await this.revision(updated,'CALENDAR_EVENT_UPDATED',actor.id,client);return this.detail(updated,actor.id,client);
    });
  }
  async cancelEvent(id:string,actor:AuthenticatedUser,body:any){
    allowedFields(body,['version','reason']);textField(body.reason,'Cancellation reason',1000,5);
    if(!Number.isInteger(body.version))throw new BadRequestException('Current event version required');
    return this.db.transaction(async client=>{
      const e=await this.locked(id,actor,client,body.version);
      const updated=(await client.query("UPDATE calendar_events SET lifecycle_state='CANCELLED',version=version+1,updated_at=NOW(),provenance=provenance||jsonb_build_object('cancellationReason',$2::text) WHERE id=$1 RETURNING *",[e.id,body.reason])).rows[0];
      await this.revision(updated,'CALENDAR_EVENT_CANCELLED',actor.id,client);return this.detail(updated,actor.id,client);
    });
  }
  async history(id:string,actor:AuthenticatedUser){
    return this.db.transaction(async client=>{
      const e=(await client.query('SELECT * FROM calendar_events WHERE id=$1',[uuid(id)])).rows[0];
      if(!e||!await this.manageable(e,actor.id,client))throw new NotFoundException('Event history unavailable');
      await this.actor(actor.id,client);
      const rows=(await client.query(`SELECT r.version,r.action,r.actor_id AS "actorId",r.snapshot,r.created_at AS "createdAt",
        CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('previewId',p.id,'basis',p.basis,'previewContext',p.preview_context,'sendContext',p.send_context,'eventVersion',p.event_version) END AS "audienceEvidence"
        FROM calendar_event_revisions r LEFT JOIN calendar_audience_previews p ON p.id::text=r.snapshot->>'audience_preview_id'
        WHERE r.event_id=$1 ORDER BY r.version DESC LIMIT 100`,[id])).rows;
      for(const row of rows)if(row.audienceEvidence)await this.audiences.historyAccess(actor.id,row.audienceEvidence.basis,client);
      if(rows.some(r=>r.audienceEvidence))await this.audiences.recordHistoryRead(actor.id,e,client);
      return rows;
    });
  }
  async listEvents(actor:AuthenticatedUser,options?:{yearBs?:number;monthBs?:number;branchId?:string;audienceScope?:EventAudienceScope}):Promise<CalendarEventDetailDto[]>{
    this.validateBsYear(options?.yearBs);
    if(options?.monthBs!==undefined&&(!Number.isInteger(options.monthBs)||options.monthBs<1||options.monthBs>12))throw new BadRequestException('monthBs must be 1..12');
    if(options?.branchId)uuid(options.branchId,'branch');
    if(options?.audienceScope&&!Object.values(EventAudienceScope).includes(options.audienceScope))throw new BadRequestException('Invalid event audience');
    const rows=(await this.db.query(`SELECT e.* FROM calendar_events e JOIN user_accounts u ON u.id=$1
      WHERE (${eventVisibility()} OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='SUPER_ADMIN'))
      AND ($2::int IS NULL OR left(e.date_bs,4)=$2::text OR e.tithi_year_bs=$2)
      AND ($3::int IS NULL OR substring(e.date_bs,6,2)=$3::text OR substring(e.date_bs,6,2)=LPAD($3::text,2,'0') OR e.tithi_month_bs=$3)
      AND ($4::uuid IS NULL OR e.branch_id=$4)
      AND ($5::text IS NULL OR e.audience_scope=$5)
      ORDER BY COALESCE(e.starts_at::text,e.date_bs,e.created_at::text),e.id LIMIT 100`,
      [actor.id,options?.yearBs??null,options?.monthBs??null,options?.branchId??null,options?.audienceScope??null])).rows;
    return Promise.all(rows.map(e=>this.detail(e,actor.id)));
  }
  async browseEvents(actor:AuthenticatedUser,options?:{yearBs?:number;monthBs?:number;branchId?:string;audienceScope?:EventAudienceScope;before?:string}){
    const before=options?.before;
    if(before!==undefined&&(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw new BadRequestException('Invalid calendar cursor');
    this.validateBsYear(options?.yearBs);
    if(options?.monthBs!==undefined&&(!Number.isInteger(options.monthBs)||options.monthBs<1||options.monthBs>12))throw new BadRequestException('monthBs must be 1..12');
    if(options?.branchId)uuid(options.branchId,'branch');
    if(options?.audienceScope&&!Object.values(EventAudienceScope).includes(options.audienceScope))throw new BadRequestException('Invalid event audience');
    const rows=(await this.db.query(`SELECT e.* FROM calendar_events e JOIN user_accounts u ON u.id=$1
      WHERE (${eventVisibility()} OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='SUPER_ADMIN'))
      AND ($2::int IS NULL OR left(e.date_bs,4)=$2::text OR e.tithi_year_bs=$2)
      AND ($3::int IS NULL OR substring(e.date_bs,6,2)=$3::text OR substring(e.date_bs,6,2)=LPAD($3::text,2,'0') OR e.tithi_month_bs=$3)
      AND ($4::uuid IS NULL OR e.branch_id=$4)
      AND ($5::text IS NULL OR e.audience_scope=$5)
      AND ($6::bigint IS NULL OR e.browse_sequence<$6)
      ORDER BY e.browse_sequence DESC LIMIT 51`,
      [actor.id,options?.yearBs??null,options?.monthBs??null,options?.branchId??null,options?.audienceScope??null,before??null])).rows;
    return {items:await Promise.all(rows.slice(0,50).map(e=>this.detail(e,actor.id))),nextBefore:rows.length>50?String(rows[49].browse_sequence):null};
  }
  async periodEvents(actor:AuthenticatedUser,options:{source?:string;view?:string;date?:string;before?:string}){
    const period=calendarPeriod(options.source,options.view,options.date),cursor=periodCursor(options.before,period);
    const dateFilter=period.source==='AD'?"e.starts_at>=(bounds.period_start::date::timestamp AT TIME ZONE 'Asia/Kathmandu') AND e.starts_at<(bounds.period_end::date::timestamp AT TIME ZONE 'Asia/Kathmandu')":
      period.view==='DAY'?"e.date_bs=bounds.period_start":"left(e.date_bs,7)=bounds.period_start OR (e.date_bs IS NULL AND e.tithi_year_bs=bounds.period_year AND e.tithi_month_bs=bounds.period_month)";
    const displayDate=period.source==='AD'?"to_char(e.starts_at AT TIME ZONE 'Asia/Kathmandu','YYYY-MM-DD')":"e.date_bs";
    const eligible=`SELECT e.*,${displayDate} AS display_date FROM calendar_events e JOIN user_accounts u ON u.id=$1
      CROSS JOIN (SELECT $2::text AS period_start,$3::text AS period_end,$4::int AS period_year,$5::int AS period_month) bounds
      WHERE (${eventVisibility()} OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='SUPER_ADMIN')) AND (${dateFilter})`;
    const params=[actor.id,period.source==='AD'?period.start:period.view==='DAY'?period.date:period.prefix,period.end,period.year,period.month];
    const counts=(await this.db.query(`WITH eligible AS (${eligible}) SELECT display_date,count(*)::int AS count FROM eligible GROUP BY display_date`,params)).rows;
    const rows=(await this.db.query(`WITH eligible AS (${eligible}) SELECT * FROM eligible
      WHERE ($6::text IS NULL OR ($6='UNDATED' AND display_date IS NULL AND browse_sequence<$7::bigint)
        OR ($6<>'UNDATED' AND (display_date>$6 OR (display_date=$6 AND browse_sequence<$7::bigint) OR display_date IS NULL)))
      ORDER BY display_date ASC NULLS LAST,browse_sequence DESC LIMIT 51`,[...params,cursor.date,cursor.sequence])).rows;
    const days=(period.view==='DAY'?[period.day]:Array.from({length:period.daysInMonth},(_,i)=>i+1)).map(day=>{
      const date=`${period.prefix}-${String(day).padStart(2,'0')}`;return {date,count:counts.find(r=>r.display_date===date)?.count??0};
    });
    return {period,days,undatedCount:counts.find(r=>r.display_date===null)?.count??0,
      items:await Promise.all(rows.slice(0,50).map(async e=>({...await this.detail(e,actor.id),displayDate:e.display_date}))),
      nextBefore:rows.length>50?`${rows[49].display_date??'UNDATED'}|${rows[49].browse_sequence}`:null};
  }
  async getEventById(id:string,actor:AuthenticatedUser){return this.getEvent(id,actor);}
  async getEvent(id:string,actor:AuthenticatedUser):Promise<CalendarEventDetailDto>{
    const e=(await this.db.query('SELECT * FROM calendar_events WHERE id=$1',[uuid(id)])).rows[0];
    if(!e)throw new NotFoundException('Calendar event not found');
    if(!await this.canViewEvent(e,actor))throw new ForbiddenException({errorCode:ErrorCode.FORBIDDEN,message:'You do not have access to view this calendar event'});
    return this.detail(e,actor.id);
  }
  private async canViewEvent(e:any,actor:AuthenticatedUser,client?:any){
    if(actor.roles.includes(Role.SUPER_ADMIN))return true;
    return !!(await this.db.query(`SELECT 1 FROM calendar_events e JOIN user_accounts u ON u.id=$2 WHERE e.id=$1 AND ${eventVisibility()}`,[e.id,actor.id],client)).rows.length;
  }
  async rsvpEvent(id:string,userId:string,dto:CalendarEventRsvpDto):Promise<{success:boolean;myRsvp:string}>{
    allowedFields(dto,['response','note']);if(!['GOING','MAYBE','DECLINED'].includes(dto.response))throw new BadRequestException('Invalid RSVP');
    if(dto.note!==undefined)textField(dto.note,'RSVP note',1000);
    return this.db.transaction(async client=>{
      const e=(await client.query('SELECT * FROM calendar_events WHERE id=$1 FOR UPDATE',[uuid(id)])).rows[0];
      if(!e)throw new NotFoundException('Event not found');
      if(!await this.canViewEvent(e,{id:userId,roles:[]} as any,client))throw new ForbiddenException({errorCode:ErrorCode.FORBIDDEN,message:'Cannot RSVP to an event you cannot view'});
      if(e.lifecycle_state==='CANCELLED')throw new ConflictException('Event is cancelled');
      await client.query(`INSERT INTO event_invitations(event_id,invited_user_id,rsvp_status,notes) VALUES($1,$2,$3,$4)
        ON CONFLICT(event_id,invited_user_id) DO UPDATE SET rsvp_status=$3,notes=$4,revoked_at=NULL,updated_at=NOW()`,[id,userId,dto.response,dto.note??null]);
      if(dto.response==='DECLINED')await client.query("UPDATE calendar_event_reminders SET status='CANCELLED' WHERE event_id=$1 AND recipient_user_id=$2 AND status='PENDING'",[id,userId]);
      // Re-enabled attendance must not replay reminders already emitted.
      else{
        await client.query(`UPDATE calendar_event_reminders SET status='PENDING' WHERE event_id=$1 AND recipient_user_id=$2 AND event_version=$3
          AND status='CANCELLED' AND due_at>NOW()`,[id,userId,e.version]);
        await client.query(`INSERT INTO calendar_event_reminders(event_id,event_version,recipient_user_id,offset_minutes,due_at)
          SELECT e.id,e.version,$2,minutes,e.starts_at-(minutes*INTERVAL '1 minute') FROM calendar_events e CROSS JOIN UNNEST(e.reminder_offsets) minutes
          WHERE e.id=$1 AND e.starts_at-(minutes*INTERVAL '1 minute')>NOW() ON CONFLICT DO NOTHING`,[id,userId]);
      }
      return {success:true,myRsvp:dto.response};
    });
  }
  private async detail(e:any,userId:string,client?:any):Promise<CalendarEventDetailDto>{
    const invitation=(await this.db.query('SELECT rsvp_status FROM event_invitations WHERE event_id=$1 AND invited_user_id=$2 AND revoked_at IS NULL',[e.id,userId],client)).rows[0];
    const canManage=await this.manageable(e,userId,client);
    let counts:any;
    const selection=canManage&&e.audience_preview_id?(await this.db.query('SELECT selection FROM calendar_audience_previews WHERE id=$1',[e.audience_preview_id],client)).rows[0]?.selection:undefined;
    if(canManage)counts=(await this.db.query(`SELECT count(*) FILTER(WHERE rsvp_status='GOING')::int AS going,
      count(*) FILTER(WHERE rsvp_status='MAYBE')::int AS maybe,count(*) FILTER(WHERE rsvp_status='DECLINED')::int AS declined
      FROM event_invitations WHERE event_id=$1 AND revoked_at IS NULL`,[e.id],client)).rows[0];
    return {audienceSelection:selection,id:e.id,createdByUserId:e.host_user_id,title:e.title,description:e.description??undefined,eventType:e.event_type,
      audienceScope:e.audience_scope,branchId:e.branch_id,location:e.location,isAllDay:!e.starts_at,solarDate:e.date_bs,
      tithiYearBs:e.tithi_year_bs,tithiMonthBs:e.tithi_month_bs,tithiPaksha:e.tithi_paksha,tithiNumber:e.tithi_number,
      startsAt:e.starts_at?new Date(e.starts_at).toISOString():null,reminderOffsets:e.reminder_offsets,version:e.version,lifecycleState:e.lifecycle_state,
      invitedUserIds:canManage?(await this.db.query('SELECT invited_user_id FROM event_invitations WHERE event_id=$1 AND revoked_at IS NULL ORDER BY invited_user_id',[e.id],client)).rows.map(r=>r.invited_user_id):undefined,
      canManage,rsvpCounts:counts,myRsvp:invitation?.rsvp_status,createdAt:e.created_at,updatedAt:e.updated_at};
  }
}

export function validateGregorianInstant(value:unknown):string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new BadRequestException('Gregorian event time requires an ISO timestamp with timezone');
  const [hour,minute,second]=value.slice(11,19).split(':').map(Number);
  if(hour>23||minute>59||second>59)throw new BadRequestException('Invalid Gregorian event time');
  const [y,m,d]=value.slice(0,10).split('-').map(Number);
  const check=new Date(Date.UTC(y,m-1,d));
  if(y<1900||y>2100||check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d||!Number.isFinite(Date.parse(value)))throw new BadRequestException('Invalid Gregorian event time');
  return new Date(value).toISOString();
}
