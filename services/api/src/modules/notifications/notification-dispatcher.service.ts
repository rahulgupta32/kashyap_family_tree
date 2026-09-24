import { Injectable, Logger, Inject, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SMS_PROVIDER, ISmsProvider } from '../auth/sms/sms-provider.interface';
import { DatabaseService } from '../../database/database.service';
import { NotificationInboxService } from './notification-inbox.service';

export interface NotificationDispatchResult {
  outboxId: string;
  recipientUserId: string;
  channel: 'PUSH' | 'SMS' | 'EMAIL';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
}

@Injectable()
export class NotificationDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private workerInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(SMS_PROVIDER)
    private readonly smsProvider?: ISmsProvider,
    private readonly inbox?: NotificationInboxService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.workerInterval = setInterval(async () => {
        try {
          await this.processOutboxBatch(20);
          await this.recoverStrandedJobs();
          await this.retryFailedDispatches(5);
        } catch (err: any) {
          this.logger.error(`Notification worker error: ${err.message}`);
        }
      }, 5000);
    }
  }

  onModuleDestroy() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Polls audit outbox events specifically for notification delivery using the independent
   * notification_status column (decoupled from the audit logger drain).
   * Generates deduplicated, durable delivery jobs in notification_dispatches and executes delivery.
   */
  async processOutboxBatch(batchSize: number = 20): Promise<NotificationDispatchResult[]> {
    const results: NotificationDispatchResult[] = [];

    // Query independent notification_status, NEVER relying on audit drain status
    const outboxRes = await this.db.query(
      `SELECT * FROM audit_outbox 
       WHERE notification_status = 'PENDING' OR (notification_status = 'FAILED'
         AND notification_processed_at < NOW() - INTERVAL '30 seconds')
       ORDER BY created_at ASC 
       LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    for (const record of outboxRes.rows) {
      try {
        const dispatches = await this.processRecord(record);
        results.push(...dispatches);

        // Update independent notification_status
        await this.db.query(
          "UPDATE audit_outbox SET notification_status = 'PROCESSED', notification_processed_at = NOW() WHERE id = $1",
          [record.id],
        );
      } catch (err: any) {
        this.logger.error(`Failed to process notification outbox record ${record.id}: ${err.message}`, err.stack);
        await this.db.query(
          "UPDATE audit_outbox SET notification_status = 'FAILED', notification_processed_at = NOW() WHERE id = $1",
          [record.id],
        );
      }
    }

    return results;
  }

  async processRecord(record: any): Promise<NotificationDispatchResult[]> {
    const action = record.action;
    const recipientUserIds: string[] = [];

    const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

    // Reconcile claim action names: CLAIM_DISPUTED, CLAIM_DISPUTE, DISPUTE_FILED
    if (action.startsWith('CLAIM_') || action === 'DISPUTE_FILED') {
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
      if (record.entity_type === 'GENEALOGY_CHANGE_REQUEST' && isUuid(record.entity_id)) {
        const reqRes = await this.db.query('SELECT requester_user_id FROM genealogy_change_requests WHERE id = $1', [record.entity_id]);
        if (reqRes.rows[0]?.requester_user_id) {
          recipientUserIds.push(reqRes.rows[0].requester_user_id);
        }
      }
      if (record.actor_id && !recipientUserIds.includes(record.actor_id)) {
        recipientUserIds.push(record.actor_id);
      }
    } else if (action === 'CHAT_MESSAGE_CREATED' && isUuid(record.entity_id)) {
      // Resolve current recipients from membership; notification text never contains private message content.
      const recipients = await this.db.query(`SELECT p.user_id FROM chat_messages m
        JOIN chat_conversations c ON c.id=m.conversation_id
        JOIN chat_participants p ON p.conversation_id=c.id AND p.left_at IS NULL
        JOIN user_accounts u ON u.id=p.user_id AND u.is_active=true AND u.is_suspended=false AND u.deleted_at IS NULL
        WHERE m.id=$1 AND m.deleted_at IS NULL AND p.user_id<>m.sender_id
          AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role NOT IN ('GUEST','REGISTERED_USER')
            AND (c.branch_id IS NULL OR r.branch_id=c.branch_id OR r.role IN ('SUPER_ADMIN','CENTRAL_ADMIN')))
          AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE (b.blocker_id=p.user_id AND b.blocked_id=m.sender_id)
            OR (b.blocker_id=m.sender_id AND b.blocked_id=p.user_id))`, [record.entity_id]);
      recipientUserIds.push(...recipients.rows.map(r => r.user_id));
    } else if (action === 'USER_ACCOUNT_DELETED_GENEALOGY_PRESERVED') {
      return [];
    } else if (record.actor_id) {
      recipientUserIds.push(record.actor_id);
    }

    if (recipientUserIds.length === 0) {
      return [];
    }

    const results: NotificationDispatchResult[] = [];

    for (const userId of recipientUserIds) {
      const prefRes = await this.db.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId],
      );
      const prefs = prefRes.rows[0] || {
        push_enabled: true,
        sms_enabled: true,
        email_enabled: false,
      };

      // Persist a member-facing notice before trying external gateways. A provider
      // outage cannot remove inbox history; the unique key makes replay safe.
      await this.inbox?.record(record,userId,prefs);

      const payload = {
        action,
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
          const providerOutcome = await this.deliverNotification(channel, userId, payload);
          const finalStatus = providerOutcome?.status === 'SIMULATED' ? 'SIMULATED' : 'SENT';

          await this.db.query(
            "UPDATE notification_dispatches SET delivery_status = $1, dispatched_at = NOW(), provider_response = $2 WHERE id = $3",
            [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, dispatchId],
          );

          results.push({
            outboxId: record.id,
            recipientUserId: userId,
            channel,
            status: finalStatus as any,
          });
        } catch (err: any) {
          this.logger.warn(`Delivery failed for dispatch outbox=${record.id} channel=${channel}: ${err.message}`);
          await this.db.query(
            `UPDATE notification_dispatches 
             SET delivery_status = 'FAILED', retry_count = retry_count + 1, error_message = $1 
             WHERE outbox_id = $2 AND recipient_user_id = $3 AND channel = $4`,
            [err.message, record.id, userId, channel],
          );

          results.push({
            outboxId: record.id,
            recipientUserId: userId,
            channel,
            status: 'FAILED',
            error: err.message,
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
        const providerOutcome = await this.deliverNotification(job.channel, job.recipient_user_id, job.payload);
        const finalStatus = providerOutcome?.status === 'SIMULATED' ? 'SIMULATED' : 'SENT';
        await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, dispatched_at = NOW(), worker_id = NULL, lease_expires_at = NULL, provider_response = $2 
           WHERE id = $3`,
          [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, job.id],
        );
        retried++;
      } catch (err: any) {
        const newRetryCount = (job.retry_count || 0) + 1;
        const backoffSec = Math.min(Math.pow(2, newRetryCount), 300); // 2s, 4s, 8s, 16s... max 5m
        const newStatus = 'FAILED';
        await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, retry_count = $2, error_message = $3, worker_id = NULL, lease_expires_at = NULL,
               next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL,
               provider_response = $5
           WHERE id = $6`,
          [newStatus, newRetryCount, err.message, String(backoffSec), JSON.stringify({ error: err.message, timestamp: new Date().toISOString() }), job.id],
        );
      }
    }
    return retried;
  }

  private async deliverNotification(channel: string, userId: string, payload: any): Promise<any> {
    if (channel === 'SMS') {
      if (!this.smsProvider) {
        throw new Error('SMS provider is not configured. Cannot deliver SMS notification.');
      }
      const userRes = await this.db.query('SELECT phone_number FROM user_accounts WHERE id = $1', [userId]);
      const phone = userRes.rows[0]?.phone_number;
      if (!phone) {
        throw new Error(`User account ${userId} does not have a phone number for SMS delivery`);
      }
      const result = await this.smsProvider.sendOtp(phone, payload.message);
      if (!result || !result.success) {
        throw new Error(result?.error || 'SMS provider delivery failed');
      }
      this.logger.log(`[DISPATCH][SMS] Dispatched notification to ${phone} via ${result.provider}`);
      const isSimulated = Boolean((result as any).simulated || result.provider === 'TestSmsProviderAdapter');
      return {
        status: isSimulated ? 'SIMULATED' : 'DELIVERED',
        provider: result.provider,
        messageId: result.messageId,
        simulated: isSimulated,
      };
    }

    if (channel === 'PUSH') {
      const pushGateway = process.env.PUSH_GATEWAY_URL || process.env.FCM_SERVER_KEY;
      if (pushGateway && (pushGateway.startsWith('http://') || pushGateway.startsWith('https://'))) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(pushGateway, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, payload }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) {
            throw new Error(`Push gateway HTTP ${response.status}: ${response.statusText}`);
          }
          return { status: 'DELIVERED', provider: 'PUSH_GATEWAY', messageId: `push_${Date.now()}` };
        } catch (err: any) {
          clearTimeout(timeout);
          throw new Error(`Push gateway delivery failed: ${err.message}`);
        }
      }
      if (process.env.ALLOW_SIMULATED_NOTIFICATIONS === 'true') {
        this.logger.log(`[DISPATCH][PUSH] Delivering simulated push notification to user ${userId}: ${payload.message}`);
        return { status: 'SIMULATED', provider: 'SIMULATED_PUSH_GATEWAY', messageId: `sim_push_${Date.now()}`, simulated: true };
      }
      throw new Error('Push notification gateway is not configured or URL is invalid. Cannot deliver PUSH notification.');
    }

    if (channel === 'EMAIL') {
      const emailGateway = process.env.EMAIL_GATEWAY_URL || process.env.SMTP_HOST;
      if (emailGateway && (emailGateway.startsWith('http://') || emailGateway.startsWith('https://'))) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(emailGateway, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, payload }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) {
            throw new Error(`Email gateway HTTP ${response.status}: ${response.statusText}`);
          }
          return { status: 'DELIVERED', provider: 'EMAIL_GATEWAY', messageId: `email_${Date.now()}` };
        } catch (err: any) {
          clearTimeout(timeout);
          throw new Error(`Email gateway delivery failed: ${err.message}`);
        }
      }
      if (process.env.ALLOW_SIMULATED_NOTIFICATIONS === 'true') {
        this.logger.log(`[DISPATCH][EMAIL] Delivering simulated email notification to user ${userId}: ${payload.message}`);
        return { status: 'SIMULATED', provider: 'SIMULATED_EMAIL_GATEWAY', messageId: `sim_email_${Date.now()}`, simulated: true };
      }
      throw new Error('Email notification gateway is not configured or URL is invalid. Cannot deliver EMAIL notification.');
    }
    return { status: 'DELIVERED', provider: `CUSTOM_${channel}_GATEWAY`, messageId: `${channel.toLowerCase()}_${Date.now()}` };
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
        const providerOutcome = await this.deliverNotification(job.channel, job.recipient_user_id, job.payload);
        const finalStatus = providerOutcome?.status === 'SIMULATED' ? 'SIMULATED' : 'SENT';
        await this.db.query(
          "UPDATE notification_dispatches SET delivery_status = $1, dispatched_at = NOW(), worker_id = NULL, lease_expires_at = NULL, provider_response = $2 WHERE id = $3",
          [finalStatus, providerOutcome ? JSON.stringify(providerOutcome) : null, job.id],
        );
        recovered++;
      } catch (err: any) {
        const nextRetry = (job.retry_count || 0) + 1;
        const backoffSec = Math.min(Math.pow(2, nextRetry), 300);
        const newStatus = 'FAILED';
        await this.db.query(
          `UPDATE notification_dispatches 
           SET delivery_status = $1, retry_count = $2, error_message = $3, worker_id = NULL, lease_expires_at = NULL,
               next_retry_at = NOW() + ($4 || ' seconds')::INTERVAL
           WHERE id = $5`,
          [newStatus, nextRetry, err.message, String(backoffSec), job.id],
        );
      }
    }
    return recovered;
  }

  private formatNotificationMessage(action: string, record: any): string {
    switch (action) {
      case 'CLAIM_SUBMIT':
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
        return 'वंशवृक्ष संशोधन अनुरोध दर्ता भएको छ। (Genealogy change request submitted)';
      case 'CHANGE_REQUEST_APPROVED_AND_APPLIED':
        return 'वंशवृक्ष संशोधन अनुरोध स्वीकृत भई लागू भएको छ। (Change request approved and applied)';
      case 'CHANGE_REQUEST_REJECTED':
        return 'वंशवृक्ष संशोधन अनुरोध अस्वीकृत भएको छ। (Change request rejected)';
      case 'CHAT_MESSAGE_CREATED':
        return 'नयाँ निजी सन्देश आएको छ। (You have a new private message)';
      case 'CALENDAR_EVENT_CREATED':
        return 'नयाँ सांस्कृतिक/पारिवारिक कार्यक्रम थपिएको छ। (New calendar event added)';
      default:
        return `सूचना: ${action}`;
    }
  }
}
