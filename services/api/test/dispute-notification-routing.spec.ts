import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { claimDisputeNotice, notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';

const disputeId = '00000000-0000-4000-8000-000000000021';
describe('Terminal dispute notifications', () => {
  it.each(['DISPUTE_RESOLVED_EXTRA', 'DISPUTE_DISMISSED_EXTRA', 'DISPUTE_UNKNOWN'])('keeps unrecognized dispute audit action %s silent', action => {
    expect(claimDisputeNotice(action)).toBe(false);
    expect(notificationCategoryEnabled(action, { workflow_enabled: true })).toBe(false);
  });

  it.each(['CLAIM_CORRECTION_REQUESTED', 'CLAIM_TIER1_CORRECTION_REQUESTED'])('formats the emitted correction action %s without private notes', action => {
    const dispatcher = new NotificationDispatcherService({} as any);
    const message = (dispatcher as any).formatNotificationMessage(action, { new_value: { notes: 'PRIVATE NOTE' } });
    expect(message).toContain('Correction requested'); expect(message).not.toContain('PRIVATE NOTE');
  });
  it.each(['DISPUTE_RESOLVED', 'DISPUTE_DISMISSED'])('%s reaches both parties without exposing adjudication content', async action => {
    const db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM claim_disputes')) return { rows: [{ claimant_user_id: 'claimant', disputant_user_id: 'disputant' }] };
      if (sql.includes('notification_preferences')) return { rows: [{ push_enabled: false, sms_enabled: false, email_enabled: false }] };
      throw new Error('Unexpected database access');
    }) };
    const inbox = { record: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = new NotificationDispatcherService(db as any, undefined, inbox as any);
    const record = { id: 'event', action, entity_type: 'CLAIM_DISPUTE', entity_id: disputeId, actor_id: 'adjudicator',
      new_value: { resolutionNotes: 'PRIVATE FAMILY EVIDENCE' } };
    await dispatcher.processRecord(record);
    expect(inbox.record.mock.calls.map(call => call[1]).sort()).toEqual(['adjudicator','claimant','disputant']);
    expect(notificationCategoryEnabled(action, { workflow_enabled: false })).toBe(false);
    expect(notificationCategoryEnabled(action, { workflow_enabled: true })).toBe(true);
    const message = (dispatcher as any).formatNotificationMessage(action, record);
    expect(message).toContain('dispute'); expect(message).not.toContain('PRIVATE FAMILY EVIDENCE');
  });
});
