import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { notificationCategoryEnabled } from '../src/modules/notifications/notification-policy';

describe('Notification delivery boundary', () => {
  it.each([
    ['CHAT_MESSAGE_CREATED', 'chat_enabled'],
    ['CALENDAR_EVENT_CREATED', 'family_events_enabled'],
    ['CLAIM_APPROVED_AND_LINKED', 'workflow_enabled'],
    ['CHANGE_REQUEST_APPROVED_AND_MERGED', 'workflow_enabled'],
  ])('suppresses %s on every channel when its category is disabled', (action, key) => {
    expect(notificationCategoryEnabled(action, { [key]: false })).toBe(false);
    expect(notificationCategoryEnabled(action, { in_app_enabled: false })).toBe(true);
  });

  it('does not deliver audit-only events and preserves mandatory official notices', () => {
    expect(notificationCategoryEnabled('USER_ROLE_ASSIGNED', {})).toBe(false);
    expect(notificationCategoryEnabled('NOTIFICATION_BROADCAST_CREATED', { workflow_enabled: false })).toBe(true);
  });

  it.each([
    ['inactive account', [], 'CLAIM_APPROVED_AND_LINKED'],
    ['disabled category', [{ workflow_enabled: false }], 'CLAIM_APPROVED_AND_LINKED'],
    ['disabled channel', [{ push_enabled: false }], 'CLAIM_APPROVED_AND_LINKED'],
    ['revoked chat access', [{ push_enabled: true }], 'CHAT_MESSAGE_CREATED'],
  ])('skips a failed job after %s without contacting its provider', async (_label, rows, action) => {
    const job = { id: 'job', channel: 'PUSH', recipient_user_id: 'recipient', payload: { action, entityId: 'entity' } };
    let claimed = false;
    const query = jest.fn(async (sql: string, args?: any[]) => {
      if (sql.includes('RETURNING *')) {
        if (claimed) return { rows: [] };
        claimed = true; return { rows: [job] };
      }
      if (sql.includes('FROM user_accounts u')) return { rows };
      if (sql.includes('FROM chat_messages')) return { rows: [] };
      if (sql.includes('dispatched_at')) return { rows: [{ id: 'job' }] };
      return { rows: [] };
    });
    const dispatcher = new NotificationDispatcherService({ query } as any);
    const gateway = jest.spyOn(global, 'fetch');
    try {
      expect(await dispatcher.retryFailedDispatches()).toBe(1);
      expect(gateway).not.toHaveBeenCalled();
      const update = query.mock.calls.find(call => call[0].includes('dispatched_at'));
      expect(update?.[1]?.[0]).toBe('SKIPPED');
    } finally { gateway.mockRestore(); }
  });
});
