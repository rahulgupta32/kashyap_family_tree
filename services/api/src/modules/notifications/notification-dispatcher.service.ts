import { randomUUID } from 'crypto';
import { Injectable, Logger, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SMS_PROVIDER, ISmsProvider } from '../auth/sms/sms-provider.interface';
import { DatabaseService } from '../../database/database.service';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationFollowsService } from './notification-follows.service';
import { broadcastEligibility } from './broadcast-eligibility';
import { calendarNoticeEligibility } from '../calendar/calendar-eligibility';
import { communityNoticeEligibility } from '../community/community-notice-eligibility';
import { notificationCategoryEnabled } from './notification-policy';
import { notificationGatewayUrl } from './notification-gateway.policy';
import { PushTokensService } from './push-tokens.service';
import { PushDeliveryService } from './push-delivery.service';
import { MigrationService } from '../../database/migration.service';
import { directParticipantsEligible } from '../chat/direct-chat-safety';

// Never persist/log external exception text: providers may echo credentials or private payloads.
const DELIVERY_FAILURE = 'NOTIFICATION_DELIVERY_UNAVAILABLE';

export interface NotificationDispatchResult {
  outboxId: string;
  recipientUserId: string;
  channel: 'PUSH' | 'SMS' | 'EMAIL';
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'SIMULATED' | 'RECONCILIATION_REQUIRED';
  error?: string;
}

@Injectable()
export class NotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private workerInterval: NodeJS.Timeout | null = null;
  private workerCycle: Promise<void> | null = null;
  private stopped = false;
  private initialization?: Promise<void>;
  private lifecycle: 'STARTING'|'RUNNING'|'TEST_DISABLED'|'STOPPED' = 'STARTING';
  private lastStartedAt: string|null = null;
  private lastCompletedAt: string|null = null;
  private lastFailureAt: string|null = null;
  private lastFailureCodes: string[] = [];

  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(SMS_PROVIDER)
    private readonly smsProvider?: ISmsProvider,
    private readonly inbox?: NotificationInboxService,
    private readonly follows?: NotificationFollowsService,
    @Optional() private readonly pushTokens?: PushTokensService,
    @Optional() private readonly pushDelivery?: PushDeliveryService,
    @Optional() private readonly migrations?: MigrationService,
  ) {}

  onModuleInit(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (process.env.NODE_ENV === 'test') {this.lifecycle='TEST_DISABLED';return Promise.resolve();}
    if (this.initialization) return this.initialization;
    this.initialization=(async()=>{
      await this.migrations?.runMigrations();
      if (this.stopped || this.workerInterval) return;
      this.workerInterval = setInterval(() => {
        // A slow provider must not create another cycle every five seconds.
        if (this.stopped || this.workerCycle) return;
        this.workerCycle = this.runWorkerCycle().finally(() => { this.workerCycle = null; });
      }, 5000);
      this.workerInterval.unref();
      this.lifecycle='RUNNING';
    })();
    return this.initialization;
  }

  private async runWorkerCycle(): Promise<void> {
    this.lastStartedAt=new Date().toISOString();
    const failures:string[]=[];
    try { await this.pushTokens?.retireStale(); }
    catch { failures.push('PUSH_TOKEN_RETENTION_UNAVAILABLE');this.logger.error('PUSH_TOKEN_RETENTION_UNAVAILABLE'); }
    try { await this.pushDelivery?.reconcileConfirmed(); }
    catch { failures.push('PUSH_PROVIDER_RECONCILIATION_UNAVAILABLE');this.logger.error('PUSH_PROVIDER_RECONCILIATION_UNAVAILABLE'); }
    try {
      await this.processOutboxBatch(20);
      await this.recoverStrandedJobs();
      await this.retryFailedDispatches(5);
    } catch {
      failures.push('NOTIFICATION_WORKER_UNAVAILABLE');
      this.logger.error('NOTIFICATION_WORKER_UNAVAILABLE');
    }
    this.lastFailureCodes=failures;
    if (failures.length) this.lastFailureAt=new Date().toISOString();
    else this.lastCompletedAt=new Date().toISOString();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped=true;this.lifecycle='STOPPED';
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
    await this.workerCycle;
  }

  workerStatus() {
    return {scope:'THIS_API_PROCESS',lifecycle:this.lifecycle,inFlight:!!this.workerCycle,
      intervalSeconds:5,outboxBatchSize:20,retryBatchSize:5,lastStartedAt:this.lastStartedAt,
      lastCompletedAt:this.lastCompletedAt,lastFailureAt:this.lastFailureAt,lastFailureCodes:[...this.lastFailureCodes]};
  }

  /**
   * Polls audit outbox events specifically for notification delivery using the independent
   * notification_status column (decoupled from the audit logger drain).
   * Generates deduplicated, durable delivery jobs in notification_dispatches and executes delivery.
   */
  async processOutboxBatch(batchSize: number = 20): Promise<NotificationDispatchResult[]> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      throw new Error('Invalid notification batch size');
    }
    const results: NotificationDispatchResult[] = [];
    // Claim one event just before processing; later batch entries cannot expire while waiting.
    for (let index = 0; index < batchSize; index++) {
      const claimId = randomUUID();
      const claimed = await this.db.query(`WITH candidate AS (
        SELECT id FROM audit_outbox WHERE notification_status='PENDING'
          OR (notification_status='FAILED' AND (notification_processed_at IS NULL
            OR notification_processed_at<CURRENT_TIMESTAMP-INTERVAL '30 seconds'))
          OR (notification_status='PROCESSING' AND notification_lease_expires_at<=CURRENT_TIMESTAMP)
        ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE audit_outbox o SET notification_status='PROCESSING',notification_claim_id=$1,
          notification_lease_expires_at=CURRENT_TIMESTAMP+INTERVAL '2 minutes'
        FROM candidate c WHERE o.id=c.id RETURNING o.*`, [claimId]);
      const record = claimed.rows[0];
      if (!record) break;
      try {
        const dispatches = await this.processRecord(record);
        if (await this.finishNotificationClaim(record.id, claimId, 'PROCESSED')) results.push(...dispatches);
        else this.logger.warn('NOTIFICATION_CLAIM_OWNERSHIP_LOST');
      } catch {
        this.logger.error('NOTIFICATION_OUTBOX_UNAVAILABLE');
        // A lost acknowledgement must never undo a possibly committed completion or another owner's claim.
        await this.finishNotificationClaim(record.id, claimId, 'FAILED');
      }
    }
    return results;
  }

  private async finishNotificationClaim(id: string, claimId: string, status: 'PROCESSED' | 'FAILED'): Promise<boolean> {
    const updated = await this.db.query(`UPDATE audit_outbox SET notification_status=$3,
      notification_processed_at=CURRENT_TIMESTAMP,notification_claim_id=NULL,notification_lease_expires_at=NULL
      WHERE id=$1 AND notification_claim_id=$2 AND notification_status='PROCESSING'
        AND notification_lease_expires_at>CURRENT_TIMESTAMP RETURNING id`, [id, claimId, status]);
    return updated.rows.length === 1;
  }

  async processRecord(record: any): Promise<NotificationDispatchResult[]> {
    const action = record.action;
    const recipientUserIds: string[] = [];

    const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // Reconcile claim action names: CLAIM_DISPUTED, CLAIM_DISPUTE, DISPUTE_FILED
    if (action === 'COMMUNITY_POST_MODERATED') {
      const recipients=await this.db.query(`SELECT u.id FROM audit_outbox o JOIN community_posts p ON p.id::text=o.entity_id
        JOIN user_accounts u ON u.id=p.author_user_id WHERE o.id=$1 AND ${communityNoticeEligibility()}`,[record.id]);
      recipientUserIds.push(...recipients.rows.map(r=>r.id));
    } else if (action.startsWith('CLAIM_') || action === 'DISPUTE_FILED') {
      if (record.entity_type === 'PROFILE_CLAIM' && isUuid(record.entity_id)) {
        const claimRes = await this.db.query('SELECT claimant_user_id FROM profile_claims WHERE id = $1', [record.entity_id]);
        if (claimRes.rows[0]?.claimant_user_id) {
          recipientUserIds.push(claimRes.rows[0].claimant_user_id);
        }
      } else if (record.entity_type === 'CLAIM_DISPUTE' && isUuid(record.entity_id)) {
        const dispRes = await this.db.query(
          `SELECT d.disputant_user_id, c.claimant_user_id 
           FROM claim_disputes d 
           JOIN profile_claims c ON d.claim_id = c.id 
           WHERE d.id = $1`,
          [record.entity_id],
        );
        if (dispRes.rows[0]) {
          if (dispRes.rows[0].claimant_user_id) recipientUserIds.push(dispRes.rows[0].claimant_user_id);
          if (dispRes.rows[0].disputant_user_id && !recipientUserIds.includes(dispRes.rows[0].disputant_user_id)) {
            recipientUserIds.push(dispRes.rows[0].disputant_user_id);
          }
        }
      }
      if (record.actor_id && !recipientUserIds.includes(record.actor_id)) {
        recipientUserIds.push(record.actor_id);
      }
    } else if (action.startsWith('CHANGE_REQUEST_')) {
      if (['GENEALOGY_CHANGE_REQUEST', 'CHANGE_REQUEST'].includes(record.entity_type) && isUuid(record.entity_id)) {
        const reqRes = await this.db.query('SELECT requester_user_id FROM genealogy_change_requests WHERE id = $1', [record.entity_id]);
        if (reqRes.rows[0]?.requester_user_id) {
          recipientUserIds.push(reqRes.rows[0].requester_user_id);
        }
        if (action === 'CHANGE_REQUEST_APPROVED_AND_MERGED' && reqRes.rows.length) {
          const target = await this.db.query('SELECT target_person_id FROM genealogy_change_requests WHERE id=$1', [record.entity_id]);
          if (target.rows[0]?.target_person_id) {
            recipientUserIds.push(...((await this.follows?.recipientsForPerson(target.rows[0].target_person_id)) ?? []));
          }
        }
      }
      if (record.actor_id && !recipientUserIds.includes(record.actor_id)) {
        recipientUserIds.push(record.actor_id);
      }
    } else if (['CALENDAR_EVENT_CREATED','CALENDAR_EVENT_UPDATED','CALENDAR_EVENT_CANCELLED','CALENDAR_EVENT_REMINDER_DUE'].includes(action)) {
      const recipients=await this.db.query(`SELECT u.id FROM calendar_notification_recipients nr
        JOIN audit_outbox o ON o.id=nr.outbox_id JOIN calendar_events e ON e.id=nr.event_id
        JOIN user_accounts u ON u.id=nr.user_id WHERE nr.outbox_id=$1 AND ${calendarNoticeEligibility()}`, [record.id]);
      recipientUserIds.push(...recipients.rows.map(r=>r.id));
    } else if (action === 'NOTIFICATION_BROADCAST_CREATED' && record.entity_type === 'NOTIFICATION_BROADCAST' && isUuid(record.entity_id)) {
      const recipients = await this.db.query(`SELECT r.user_id FROM notification_broadcast_recipients r
        JOIN notification_broadcasts b ON b.id=r.broadcast_id
        JOIN user_accounts u ON u.id=r.user_id
        WHERE r.broadcast_id=$1 AND ${broadcastEligibility()}`, [record.entity_id]);
      recipientUserIds.push(...recipients.rows.map(r => r.user_id));
    } else if (action === 'CHAT_MESSAGE_CREATED' && isUuid(record.entity_id)) {
      // Resolve current recipients from membership; notification text never contains private message content.
      const recipients = await this.db.query(`SELECT p.user_id,c.id AS conversation_id,c.conversation_type FROM chat_messages m
        JOIN chat_conversations c ON c.id=m.conversation_id
        JOIN chat_participants p ON p.conversation_id=c.id AND p.left_at IS NULL
        JOIN user_accounts u ON u.id=p.user_id AND u.is_active=true AND u.is_suspended=false AND u.deleted_at IS NULL
        WHERE m.id=$1 AND m.deleted_at IS NULL AND m.sequence>p.history_from_sequence AND p.user_id<>m.sender_id
          AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER')
            AND (c.branch_id IS NULL OR r.branch_id=c.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')))
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=p.user_id AND b.blocked_id=m.sender_id)
            OR (b.blocker_id=m.sender_id AND b.blocked_id=p.user_id))`, [record.entity_id]);
      if(recipients.rows[0]?.conversation_type!=='DIRECT'||await directParticipantsEligible(this.db,recipients.rows[0].conversation_id))recipientUserIds.push(...recipients.rows.map(r => r.user_id));
    } else if (action === 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED') {
      return [];
    } else if (record.actor_id) {
      recipientUserIds.push(record.actor_id);
    }

    if (recipientUserIds.length === 0) {
      return [];
    }

    const results: NotificationDispatchResult[] = [];

    for (const userId of new Set(recipientUserIds)) {
      const prefRes = await this.db.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId],
      );
      const prefs = prefRes.rows[0] || {
        push_enabled: true,
        sms_enabled: true,
        email_enabled: false,
      };

      if (!notificationCategoryEnabled(action, prefs)) continue;

      // Persist a member-facing notice before trying external gateways. A provider
      // outage cannot remove inbox history; the unique key makes replay safe.
      await this.inbox?.record(record,userId,prefs);

      const payload = {
        action,
        outboxId: record.id,
        entityType: record.entity_type,
        entityId: record.entity_id,
        timestamp: new Date().toISOString(),
        message: this.formatNotificationMessage(action, record),
      };

      const channels: ('PUSH' | 'SMS' | 'EMAIL')[] = [];
      if (prefs.push_enabled) channels.push('PUSH');
      if (prefs.sms_enabled) channels.push('SMS');
      if (prefs.email_enabled) channels.push('EMAIL');

      for (const channel of channels) {
        try {
          // Atomic job creation with deduplication constraint on (outbox_id, recipient_user_id, channel)
          const insRes = await this.db.query(
            `INSERT INTO notification_dispatches (
              outbox_id, recipient_user_id, channel, event_type, payload, delivery_status
            ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
            ON CONFLICT (outbox_id, recipient_user_id, channel) DO NOTHING
            RETURNING id`,
            [record.id, userId, channel, action, JSON.stringify(payload)],
          );

          if (insRes.rows.length === 0) {
            // Deduplicated job already registered
            results.push({
              outboxId: record.id,
              recipientUserId: userId,
              channel,
              status: 'SKIPPED',
            });
            continue;
          }

          const dispatchId = insRes.rows[0].id;

          // Perform delivery
          const providerOutcome = await this.deliverNotification(channel, userId, payload, dispatchId);
          const finalStatus = this.deliveryStatus(providerOutcome);

          const finalized = await this.db.query(
            `UPDATE notification_dispatches SET delivery_status = $1, dispatched_at = NOW(), provider_response = $2
             WHERE id = $3 AND (channel <> 'PUSH' OR delivery_status NOT IN ('SENT','SKIPPED')) RETURNING delivery_status`,
            [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, dispatchId],
          );
          const persistedStatus = finalized.rows[0]?.delivery_status ??
            (await this.db.query('SELECT delivery_status FROM notification_dispatches WHERE id=$1',[dispatchId])).rows[0]?.delivery_status;

          results.push({
            outboxId: record.id,
            recipientUserId: userId,
            channel,
            status: (persistedStatus ?? finalStatus) as NotificationDispatchResult['status'],
          });
        } catch (err: any) {
          this.logger.warn(DELIVERY_FAILURE);
          const finalized = await this.db.query(
            `UPDATE notification_dispatches 
             SET delivery_status = 'FAILED', retry_count = retry_count + 1, error_message = $1 
             WHERE outbox_id = $2 AND recipient_user_id = $3 AND channel = $4
               AND (channel <> 'PUSH' OR delivery_status NOT IN ('SENT','SKIPPED')) RETURNING delivery_status`,
            [DELIVERY_FAILURE, record.id, userId, channel],
          );
          const persistedStatus = finalized.rows[0]?.delivery_status ??
            (await this.db.query('SELECT delivery_status FROM notification_dispatches WHERE outbox_id=$1 AND recipient_user_id=$2 AND channel=$3',
              [record.id,userId,channel])).rows[0]?.delivery_status;

          results.push({
            outboxId: record.id,
            recipientUserId: userId,
            channel,
            status: (persistedStatus ?? 'FAILED') as NotificationDispatchResult['status'],
            ...(persistedStatus === 'SENT' || persistedStatus === 'SKIPPED' ? {} : {error: DELIVERY_FAILURE}),
          });
        }
      }
    }

    return results;
  }

  private readonly workerId = `worker-${process.pid}-${Math.floor(Math.random() * 10000)}`;

  /**
   * Independent retry worker: recovers and drains any failed or pending jobs
   * with exponential backoff, worker leases, and max 5 attempts.
   */
  async retryFailedDispatches(maxRetries: number = 5): Promise<number> {
    // Transactionally claim jobs eligible for retry whose lease has expired and next_retry_at is reached
    const claimRes = await this.db.query(
      `UPDATE notification_dispatches
       SET worker_id = $1,
           lease_expires_at = NOW() + INTERVAL '60 seconds',
           delivery_status = 'PROCESSING'
       WHERE id IN (
         SELECT id FROM notification_dispatches
         WHERE delivery_status = 'FAILED'
           AND retry_count < $2
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
         ORDER BY created_at ASC
         LIMIT 50
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [this.workerId, maxRetries],
    );

    let retried = 0;
    for (const job of claimRes.rows) {
      try {
        const providerOutcome = await this.deliverNotification(job.channel, job.recipient_user_id, job.payload, job.id);
        const finalStatus = this.deliveryStatus(providerOutcome);
        const finalized = await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, dispatched_at = NOW(), worker_id = NULL, lease_expires_at = NULL, provider_response = $2 
           WHERE id = $3 AND worker_id = $4 AND delivery_status = 'PROCESSING' RETURNING id`,
          [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, job.id, this.workerId],
        );
        retried+=finalized.rows.length;
      } catch (err: any) {
        const newRetryCount = (job.retry_count || 0) + 1;
        const backoffSec = Math.min(Math.pow(2, newRetryCount), 300); // 2s, 4s, 8s, 16s... max 5m
        const newStatus = 'FAILED';
        await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, retry_count = $2, error_message = $3, worker_id = NULL, lease_expires_at = NULL,
               next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL,
               provider_response = $5
           WHERE id = $6 AND worker_id = $7 AND delivery_status = 'PROCESSING'`,
          [newStatus, newRetryCount, DELIVERY_FAILURE, String(backoffSec), JSON.stringify({ error: DELIVERY_FAILURE, timestamp: new Date().toISOString() }), job.id, this.workerId],
        );
      }
    }
    return retried;
  }

  private deliveryStatus(outcome: any): NotificationDispatchResult['status'] {
    return outcome?.status==='RECONCILIATION_REQUIRED'?'RECONCILIATION_REQUIRED':outcome?.status==='SIMULATED'?'SIMULATED':outcome?.status==='SKIPPED'?'SKIPPED':'SENT';
  }

  private async deliverNotification(channel: string, userId: string, payload: any, dispatchId?: string, eligibilityOnly=false): Promise<any> {
    if (!['PUSH', 'SMS', 'EMAIL'].includes(channel)) throw new Error(DELIVERY_FAILURE);
    // Recheck at the last delivery boundary, including retries and stranded jobs.
    // A saved job is not continuing permission to contact a former participant.
    const current = (await this.db.query(`SELECT u.id,p.push_enabled,p.sms_enabled,p.email_enabled,
      p.workflow_enabled,p.chat_enabled,p.family_events_enabled,p.community_posts_enabled
      FROM user_accounts u LEFT JOIN notification_preferences p ON p.user_id=u.id
      WHERE u.id=$1 AND u.is_active=TRUE AND u.is_suspended=FALSE AND u.deleted_at IS NULL`, [userId])).rows[0];
    if (!current) return { status: 'SKIPPED', reason: 'Account is no longer active' };
    if (!notificationCategoryEnabled(payload.action, current)) return { status: 'SKIPPED', reason: 'Notification category disabled' };
    const enabled = channel === 'PUSH' ? current.push_enabled !== false
      : channel === 'SMS' ? current.sms_enabled !== false
      : channel === 'EMAIL' ? current.email_enabled === true : false;
    if (!enabled) return { status: 'SKIPPED', reason: 'Delivery channel disabled' };

    if(payload.action==='COMMUNITY_POST_MODERATED'){
      const allowed=await this.db.query(`SELECT 1 FROM audit_outbox o JOIN community_posts p ON p.id::text=o.entity_id
        JOIN user_accounts u ON u.id=$2 WHERE o.id=$1 AND ${communityNoticeEligibility()}`,[payload.outboxId,userId]);
      if(!allowed.rows.length)return {status:'SKIPPED',reason:'Community decision or access changed'};
    }
    if (['CALENDAR_EVENT_CREATED','CALENDAR_EVENT_UPDATED','CALENDAR_EVENT_CANCELLED','CALENDAR_EVENT_REMINDER_DUE'].includes(payload.action)) {
      const eligible=await this.db.query(`SELECT 1 FROM calendar_notification_recipients nr
        JOIN audit_outbox o ON o.id=nr.outbox_id JOIN calendar_events e ON e.id=nr.event_id
        JOIN user_accounts u ON u.id=nr.user_id WHERE nr.outbox_id=$1 AND nr.user_id=$2 AND ${calendarNoticeEligibility()}`,
        [payload.outboxId,userId]);
      if(!eligible.rows.length)return {status:'SKIPPED',reason:'Event access or revision revoked'};
    }
    if (payload.action === 'CHAT_MESSAGE_CREATED') {
      const eligible = await this.db.query(`SELECT c.id AS conversation_id,c.conversation_type FROM chat_messages m
        JOIN chat_conversations c ON c.id=m.conversation_id
        JOIN chat_participants p ON p.conversation_id=c.id AND p.user_id=$2 AND p.left_at IS NULL
        WHERE m.id=$1 AND m.deleted_at IS NULL AND m.sequence>p.history_from_sequence AND m.sender_id<>$2
          AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=$2 AND r.role NOT IN ('GUEST','REGISTERED_USER')
            AND (c.branch_id IS NULL OR r.branch_id=c.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')))
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=m.sender_id)
            OR (b.blocker_id=m.sender_id AND b.blocked_id=$2))`, [payload.entityId, userId]);
      if (!eligible.rows.length) return { status: 'SKIPPED', reason: 'Chat access revoked' };
      if(eligible.rows[0].conversation_type==='DIRECT'&&!await directParticipantsEligible(this.db,eligible.rows[0].conversation_id))return {status:'SKIPPED',reason:'Chat access revoked'};
    }
    if (payload.action === 'NOTIFICATION_BROADCAST_CREATED') {
      const eligible = await this.db.query(`SELECT 1 FROM notification_broadcast_recipients r
        JOIN notification_broadcasts b ON b.id=r.broadcast_id JOIN user_accounts u ON u.id=r.user_id
        WHERE r.broadcast_id=$1 AND r.user_id=$2 AND ${broadcastEligibility()}`,
        [payload.entityId, userId]);
      if (!eligible.rows.length) return { status: 'SKIPPED', reason: 'Audience membership revoked' };
    }
    if (eligibilityOnly) return {status:'ELIGIBLE'};
    if (channel === 'SMS') {
      if (!this.smsProvider) {
        throw new Error('SMS provider is not configured. Cannot deliver SMS notification.');
      }
      const userRes = await this.db.query('SELECT phone_number FROM user_accounts WHERE id = $1', [userId]);
      const phone = userRes.rows[0]?.phone_number;
      if (!phone) {
        throw new Error(`User account ${userId} does not have a phone number for SMS delivery`);
      }
      const result = await this.smsProvider.sendNotification(phone, payload.message);
      if (!result || !result.success) {
        throw new Error(DELIVERY_FAILURE);
      }
      this.logger.log('NOTIFICATION_SMS_ACCEPTED');
      const isSimulated = Boolean((result as any).simulated || result.provider === 'TestSmsProviderAdapter');
      return {
        status: isSimulated ? 'SIMULATED' : 'DELIVERED',
        provider: 'SMS_PROVIDER',
        simulated: isSimulated,
      };
    }

    if (channel === 'PUSH') {
      if (process.env.PUSH_PROVIDER==='fcm') {
        if (!this.pushDelivery || !dispatchId) throw new Error(DELIVERY_FAILURE);
        return this.pushDelivery.send(userId,dispatchId,async()=>
          (await this.deliverNotification('PUSH',userId,payload,dispatchId,true)).status==='ELIGIBLE');
      }
      // Unverified user-ID proxy acknowledgements are not production provider evidence.
      if (process.env.NODE_ENV==='production') throw new Error(DELIVERY_FAILURE);
      const pushGateway = notificationGatewayUrl(process.env.PUSH_GATEWAY_URL, process.env.NODE_ENV === 'production');
      if (pushGateway) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(pushGateway, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, payload }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok || response.redirected) {
            throw new Error(DELIVERY_FAILURE);
          }
          return { status: 'DELIVERED', provider: 'PUSH_GATEWAY', messageId: `push_${Date.now()}` };
        } catch (err: any) {
          clearTimeout(timeout);
          throw new Error(DELIVERY_FAILURE);
        }
      }
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SIMULATED_NOTIFICATIONS === 'true') {
        this.logger.log('NOTIFICATION_PUSH_SIMULATED');
        return { status: 'SIMULATED', provider: 'SIMULATED_PUSH_GATEWAY', messageId: `sim_push_${Date.now()}`, simulated: true };
      }
      throw new Error(DELIVERY_FAILURE);
    }

    if (channel === 'EMAIL') {
      const emailGateway = notificationGatewayUrl(process.env.EMAIL_GATEWAY_URL, process.env.NODE_ENV === 'production');
      if (emailGateway) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(emailGateway, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, payload }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok || response.redirected) {
            throw new Error(DELIVERY_FAILURE);
          }
          return { status: 'DELIVERED', provider: 'EMAIL_GATEWAY', messageId: `email_${Date.now()}` };
        } catch (err: any) {
          clearTimeout(timeout);
          throw new Error(DELIVERY_FAILURE);
        }
      }
      if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_SIMULATED_NOTIFICATIONS === 'true') {
        this.logger.log('NOTIFICATION_EMAIL_SIMULATED');
        return { status: 'SIMULATED', provider: 'SIMULATED_EMAIL_GATEWAY', messageId: `sim_email_${Date.now()}`, simulated: true };
      }
      throw new Error(DELIVERY_FAILURE);
    }
    throw new Error(DELIVERY_FAILURE);
  }

  /**
   * Recovers stranded PROCESSING or PENDING jobs whose lease has expired
   * and resets or retries them.
   */
  async recoverStrandedJobs(): Promise<number> {
    const strandedRes = await this.db.query(
      `UPDATE notification_dispatches
       SET worker_id = $1,
           lease_expires_at = NOW() + INTERVAL '60 seconds',
           delivery_status = 'PROCESSING'
       WHERE id IN (
         SELECT id FROM notification_dispatches 
         WHERE (delivery_status = 'PROCESSING' AND lease_expires_at < NOW())
            OR (delivery_status = 'PENDING' AND created_at < NOW() - INTERVAL '2 minutes' AND (lease_expires_at IS NULL OR lease_expires_at < NOW()))
         ORDER BY created_at ASC
         LIMIT 50
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [this.workerId],
    );

    let recovered = 0;
    for (const job of strandedRes.rows) {
      try {
        const providerOutcome = await this.deliverNotification(job.channel, job.recipient_user_id, job.payload, job.id);
        const finalStatus = this.deliveryStatus(providerOutcome);
        const finalized = await this.db.query(
          `UPDATE notification_dispatches SET delivery_status = $1, dispatched_at = NOW(), worker_id = NULL, lease_expires_at = NULL, provider_response = $2
           WHERE id = $3 AND worker_id = $4 AND delivery_status = 'PROCESSING' RETURNING id`,
          [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, job.id, this.workerId],
        );
        recovered+=finalized.rows.length;
      } catch (err: any) {
        const nextRetry = (job.retry_count || 0) + 1;
        const backoffSec = Math.min(Math.pow(2, nextRetry), 300);
        const newStatus = 'FAILED';
        await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, retry_count = $2, error_message = $3, worker_id = NULL, lease_expires_at = NULL,
               next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL
           WHERE id = $5 AND worker_id = $6 AND delivery_status = 'PROCESSING'`,
          [newStatus, nextRetry, DELIVERY_FAILURE, String(backoffSec), job.id, this.workerId],
        );
      }
    }
    return recovered;
  }

  private formatNotificationMessage(action: string, record: any): string {
    if(action==='COMMUNITY_POST_MODERATED') return 'A community post review update is available. Open the app to review it.';
    switch (action) {
      case 'NOTIFICATION_BROADCAST_CREATED':
        return 'प्रशासनिक सूचना उपलब्ध छ। (An official notice is available)';
      case 'CLAIM_SUBMIT':
      case 'CLAIM_SUBMITTED':
        return 'तपाईंको प्रोफाइल दाबी दर्ता गरिएको छ। (Your profile claim has been submitted)';
      case 'CLAIM_TIER1_VOUCHED':
        return 'तपाईंको दाबी तह १ बाट सिफारिस भएको छ। (Claim vouched at Tier 1)';
      case 'CLAIM_TIER1_CORRECTION_REQUIRED':
        return 'दाबीमा संशोधन आवश्यक छ। (Correction requested for your claim)';
      case 'CLAIM_TIER1_REJECTED':
      case 'CLAIM_TIER2_REJECTED':
        return 'तपाईंको दाबी अस्वीकृत भएको छ। (Your claim was rejected)';
      case 'CLAIM_TIER1_ESCALATED':
        return 'तपाईंको दाबी उच्च तहमा पठाइएको छ। (Your claim has been escalated)';
      case 'CLAIM_APPROVED_AND_LINKED':
        return 'बधाई छ! तपाईंको प्रोफाइल दाबी स्वीकृत भई खाता जोडिएको छ। (Profile claim approved and linked)';
      case 'CLAIM_DISPUTED':
      case 'CLAIM_DISPUTE':
      case 'DISPUTE_FILED':
        return 'प्रोफाइल दाबी विरुद्ध उजुरी परेको छ। (A dispute has been filed regarding this claim)';
      case 'CHANGE_REQUEST_SUBMIT':
      case 'CHANGE_REQUEST_SUBMITTED':
        return 'वंशवृक्ष संशोधन अनुरोध दर्ता भएको छ। (Genealogy change request submitted)';
      case 'CHANGE_REQUEST_APPROVED_AND_APPLIED':
      case 'CHANGE_REQUEST_APPROVED_AND_MERGED':
        return 'वंशवृक्ष संशोधन स्वीकृत भई लागू भएको छ। (An approved genealogy change was applied)';
      case 'CHANGE_REQUEST_REJECTED':
        return 'वंशवृक्ष संशोधन अनुरोध अस्वीकृत भएको छ। (Change request rejected)';
      case 'CHAT_MESSAGE_CREATED':
        return 'नयाँ निजी सन्देश आएको छ। (You have a new private message)';
      case 'CALENDAR_EVENT_UPDATED':
        return 'कार्यक्रम अपडेट उपलब्ध छ। (An event update is available)';
      case 'CALENDAR_EVENT_CANCELLED':
        return 'कार्यक्रम रद्द भएको छ। (An event was cancelled)';
      case 'CALENDAR_EVENT_REMINDER_DUE':
        return 'कार्यक्रमको सम्झना उपलब्ध छ। (An event reminder is available)';
      case 'CALENDAR_EVENT_CREATED':
        return 'नयाँ सांस्कृतिक/पारिवारिक कार्यक्रम थपिएको छ। (New calendar event added)';
      default:
        return `सूचना: ${action}`;
    }
  }
}
