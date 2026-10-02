import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { eventVisibility } from './calendar-eligibility';

@Injectable()
export class CalendarDeliveryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy=false;
  private readonly logger=new Logger(CalendarDeliveryService.name);
  constructor(private readonly db:DatabaseService,private readonly audit:AuditOutboxRepository){}
  onModuleInit(){
    if(process.env.NODE_ENV!=='test')this.timer=setInterval(async()=>{
      if(this.busy)return;this.busy=true;
      try{await this.emitDueReminders();}catch{this.logger.error('Calendar reminder transaction failed; pending reminders will retry');}
      finally{this.busy=false;}
    },15000);
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async recordNotice(event:any,action:string,actorId:string,client:any,onlyUser?:string){
    const record=await this.audit.recordAuditIntent({action,entityType:'CALENDAR_EVENT',entityId:event.id,actorId,
      newValue:{eventVersion:event.version,lifecycleState:event.lifecycle_state}},client);
    await client.query(`INSERT INTO calendar_notification_recipients(outbox_id,user_id,event_id,event_version)
      SELECT $1,u.id,e.id,e.version FROM calendar_events e JOIN user_accounts u ON
        (u.id=e.host_user_id OR EXISTS(SELECT 1 FROM event_invitations i
          WHERE i.event_id=e.id AND i.invited_user_id=u.id AND i.revoked_at IS NULL))
      WHERE e.id=$2 AND ($3::uuid IS NULL OR u.id=$3) AND ${eventVisibility()}
      ON CONFLICT DO NOTHING`,[record.id,event.id,onlyUser??null]);
    return record.id;
  }

  async reschedule(event:any,client:any){
    await client.query("UPDATE calendar_event_reminders SET status='CANCELLED' WHERE event_id=$1 AND status='PENDING'",[event.id]);
    if(event.lifecycle_state!=='ACTIVE'||!event.starts_at||!event.reminder_offsets?.length)return;
    await client.query(`INSERT INTO calendar_event_reminders(event_id,event_version,recipient_user_id,offset_minutes,due_at)
      SELECT e.id,e.version,u.id,minutes,e.starts_at-(minutes*INTERVAL '1 minute')
      FROM calendar_events e CROSS JOIN UNNEST(e.reminder_offsets) minutes JOIN user_accounts u ON
        (u.id=e.host_user_id OR EXISTS(SELECT 1 FROM event_invitations i WHERE i.event_id=e.id AND i.invited_user_id=u.id
          AND i.revoked_at IS NULL AND i.rsvp_status<>'DECLINED'))
      WHERE e.id=$1 AND e.starts_at>NOW() AND ${eventVisibility()}
        AND e.starts_at-(minutes*INTERVAL '1 minute')>NOW()
      ON CONFLICT(event_id,event_version,recipient_user_id,offset_minutes) DO NOTHING`,[event.id]);
  }

  async emitDueReminders():Promise<number>{
    // Event lock comes first everywhere, avoiding reminder/update lock inversion.
    return this.db.transaction(async client=>{
      const events=(await client.query(`SELECT e.* FROM calendar_events e
        WHERE EXISTS(SELECT 1 FROM calendar_event_reminders s WHERE s.event_id=e.id AND s.status='PENDING' AND s.due_at<=NOW())
        ORDER BY e.id LIMIT 20 FOR UPDATE OF e SKIP LOCKED`)).rows;
      let emitted=0;
      for(const e of events){
        const jobs=(await client.query("SELECT * FROM calendar_event_reminders WHERE event_id=$1 AND status='PENDING' AND due_at<=NOW() ORDER BY id FOR UPDATE",[e.id])).rows;
        for(const job of jobs){
          const eligible=(await client.query(`SELECT 1 FROM calendar_events e JOIN user_accounts u ON u.id=$2
            WHERE e.id=$1 AND e.version=$3 AND e.lifecycle_state='ACTIVE' AND e.starts_at>NOW()
              AND ${eventVisibility()} AND (u.id=e.host_user_id OR EXISTS(SELECT 1 FROM event_invitations i
                WHERE i.event_id=e.id AND i.invited_user_id=u.id AND i.revoked_at IS NULL AND i.rsvp_status<>'DECLINED'))`,
            [e.id,job.recipient_user_id,job.event_version])).rows.length;
          if(!eligible){await client.query("UPDATE calendar_event_reminders SET status='SKIPPED' WHERE id=$1",[job.id]);continue;}
          const outbox=await this.recordNotice(e,'CALENDAR_EVENT_REMINDER_DUE',e.host_user_id,client,job.recipient_user_id);
          await client.query("UPDATE calendar_event_reminders SET status='EMITTED',outbox_id=$2 WHERE id=$1",[job.id,outbox]);emitted++;
        }
      }
      return emitted;
    });
  }
}
