import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AuditOutboxRepository } from '../../database/repositories/audit-outbox.repository';
import { PushTokensService } from './push-tokens.service';
import { openPushToken } from './push-token.crypto';
import { PUSH_NOTIFICATION_PROVIDER, PushNotificationProvider, PushProviderOutcome } from './push-provider.interface';

const ELIGIBLE_REGISTRATION = `r.expires_at>clock_timestamp()
 AND u.is_active AND NOT u.is_suspended AND u.deleted_at IS NULL
 AND COALESCE(p.push_enabled,true)
 AND EXISTS(SELECT 1 FROM user_sessions s WHERE s.user_id=r.user_id AND s.session_family_id=r.session_family_id
  AND s.revoked_at IS NULL AND s.owner_revoked_at IS NULL AND s.expires_at>clock_timestamp())`;

@Injectable()
export class PushDeliveryService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditOutboxRepository,
    private readonly tokens: PushTokensService,
    @Inject(PUSH_NOTIFICATION_PROVIDER) private readonly provider: PushNotificationProvider) {}

  private async registration(userId: string, attempt: any) {
    return (await this.db.query(`SELECT r.* FROM push_token_registrations r JOIN user_accounts u ON u.id=r.user_id
      LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE r.user_id=$1 AND r.id=$2 AND r.generation=$3
      AND ${ELIGIBLE_REGISTRATION}`, [userId,attempt.registration_id,attempt.token_generation])).rows[0];
  }

  private async plan(userId: string, dispatchId: string) {
    return this.db.transaction(async client=>{
      const dispatch=(await client.query("SELECT id FROM notification_dispatches WHERE id=$1 AND recipient_user_id=$2 AND channel='PUSH' FOR UPDATE",[dispatchId,userId])).rows[0];
      if (!dispatch) throw new Error('PUSH_DELIVERY_UNAVAILABLE');
      const prior=(await client.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1 ORDER BY id',[dispatchId])).rows;
      if (prior.length) return prior; // Roster is immutable, including across token rotation/retries.
      const registrations=(await client.query(`SELECT r.id,r.generation FROM push_token_registrations r JOIN user_accounts u ON u.id=r.user_id
        LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE r.user_id=$1 AND ${ELIGIBLE_REGISTRATION}
        ORDER BY r.id LIMIT 51`,[userId])).rows;
      if (registrations.length>50) throw new Error('PUSH_DELIVERY_UNAVAILABLE');
      for (const registration of registrations) await client.query(`INSERT INTO push_delivery_attempts(dispatch_id,registration_id,token_generation)
        VALUES($1,$2,$3) ON CONFLICT(dispatch_id,registration_id) DO NOTHING`,[dispatchId,registration.id,registration.generation]);
      return (await client.query('SELECT * FROM push_delivery_attempts WHERE dispatch_id=$1 ORDER BY id',[dispatchId])).rows;
    });
  }

  private async finish(userId: string, attempt: any, claim: string, outcome: PushProviderOutcome) {
    await this.db.transaction(async client=>{
      const row=(await client.query('SELECT * FROM push_delivery_attempts WHERE id=$1 AND claim_id=$2 FOR UPDATE',[attempt.id,claim])).rows[0];
      if (!row) throw new Error('PUSH_DELIVERY_UNAVAILABLE');
      const hash=outcome.status==='ACCEPTED'?outcome.receiptHash:null;
      const inserted=await client.query(`INSERT INTO push_provider_observations(attempt_id,claim_id,outcome,receipt_hash)
        VALUES($1,$2,$3,$4) ON CONFLICT(attempt_id,claim_id) DO NOTHING RETURNING id`,[attempt.id,claim,outcome.status,hash]);
      if (row.status==='SENDING') await client.query(`UPDATE push_delivery_attempts SET
        status=CASE WHEN lease_expires_at>clock_timestamp() THEN $3 ELSE 'UNKNOWN' END,
        receipt_hash=$4,completed_at=clock_timestamp() WHERE id=$1 AND claim_id=$2 AND status='SENDING'`,[attempt.id,claim,outcome.status,hash]);
      if (inserted.rows.length) {
        if (outcome.status==='INVALID_TOKEN') await this.tokens.invalidate(attempt.registration_id,attempt.token_generation,client);
        await this.audit.recordAuditIntent({action:'PUSH_PROVIDER_OUTCOME',entityType:'push_delivery_attempts',entityId:attempt.id,
          actorId:userId,actorRole:'SYSTEM',newValue:{outcome:outcome.status}},client);
      }
    });
  }

  private async effective(dispatchId: string) {
    return (await this.db.query(`SELECT a.status, o.outcome FROM push_delivery_attempts a
      LEFT JOIN push_provider_observations o ON o.attempt_id=a.id AND o.claim_id=a.claim_id WHERE a.dispatch_id=$1`,[dispatchId])).rows;
  }

  private result(rows: any[]) {
    const statuses=rows.map(row=>row.status==='UNKNOWN' && row.outcome ? row.outcome : row.status);
    const accepted=statuses.filter(s=>s==='ACCEPTED').length;
    const unresolved=statuses.filter(s=>!['ACCEPTED','INVALID_TOKEN','SKIPPED'].includes(s)).length;
    return {status:unresolved?'RECONCILIATION_REQUIRED':accepted?'ACCEPTED':'SKIPPED',provider:'FCM',acceptedDevices:accepted,
      skippedDevices:statuses.length-accepted-unresolved,unresolvedDevices:unresolved};
  }

  async send(userId: string, dispatchId: string, authorize: () => Promise<boolean>) {
    try {
      const attempts=await this.plan(userId,dispatchId);
      for (const attempt of attempts) {
        await this.db.query(`UPDATE push_delivery_attempts SET status='UNKNOWN',completed_at=clock_timestamp()
          WHERE id=$1 AND status='SENDING' AND lease_expires_at<=clock_timestamp()`,[attempt.id]);
        const claim=randomUUID();
        const row=(await this.db.query(`UPDATE push_delivery_attempts SET status='SENDING',claim_id=$2,
          lease_expires_at=clock_timestamp()+INTERVAL '2 minutes' WHERE id=$1 AND status='PLANNED' RETURNING *`,[attempt.id,claim])).rows[0];
        if (!row) continue;
        let outcome: PushProviderOutcome={status:'REJECTED'};
        // Definite pre-send failures and ambiguous provider failures stay distinct.
        let registration: any, token: string;
        try {
          registration=await this.registration(userId,row);
          if (!registration || !await authorize()) outcome={status:'SKIPPED'};
          else {
            token=openPushToken(registration.token_envelope,JSON.stringify([registration.id,userId,registration.session_family_id,registration.platform,registration.generation]));
            try {
              outcome=await this.provider.send(token,dispatchId,async()=>!!await this.registration(userId,row) && await authorize());
              if (!outcome || !['ACCEPTED','INVALID_TOKEN','REJECTED','UNKNOWN','SKIPPED'].includes(outcome.status) ||
                (outcome.status==='ACCEPTED' && !/^[a-f0-9]{64}$/.test(outcome.receiptHash))) outcome={status:'UNKNOWN'};
            } catch {outcome={status:'UNKNOWN'};}
          }
        } catch {outcome={status:'REJECTED'};}
        await this.finish(userId,row,claim,outcome);
      }
      return this.result(await this.effective(dispatchId));
    } catch {throw new Error('NOTIFICATION_DELIVERY_UNAVAILABLE');}
  }

  /** Resolve only committed provider proof. Never calls a provider or reactivates an uncertain attempt. */
  async reconcileConfirmed() {
    const result=await this.db.query(`WITH confirmed AS (
      SELECT d.id, CASE WHEN bool_or(a.status='ACCEPTED' OR (a.status='UNKNOWN' AND o.outcome='ACCEPTED')) THEN 'SENT' ELSE 'SKIPPED' END AS status
      FROM notification_dispatches d JOIN push_delivery_attempts a ON a.dispatch_id=d.id
      LEFT JOIN push_provider_observations o ON o.attempt_id=a.id AND o.claim_id=a.claim_id
      WHERE d.channel='PUSH' AND d.delivery_status IN ('PENDING','PROCESSING','FAILED','RECONCILIATION_REQUIRED')
      GROUP BY d.id HAVING bool_and(a.status IN ('ACCEPTED','INVALID_TOKEN','SKIPPED') OR
        (a.status='UNKNOWN' AND COALESCE(o.outcome IN ('ACCEPTED','INVALID_TOKEN','SKIPPED'),false)))
      ORDER BY d.id LIMIT 50
    ) UPDATE notification_dispatches d SET delivery_status=c.status,dispatched_at=clock_timestamp(),
      worker_id=NULL,lease_expires_at=NULL,error_message=NULL,
      provider_response=jsonb_build_object('provider','FCM','reconciled',true,'acceptanceOnly',true)
      FROM confirmed c WHERE d.id=c.id RETURNING d.id`);
    return {reconciled:result.rows.length};
  }
}
