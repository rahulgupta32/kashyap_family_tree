// Category switches apply to every channel. Audit-only events do not notify members.
export function notificationCategoryEnabled(action: string, prefs: any): boolean {
  if (action === 'NOTIFICATION_BROADCAST_CREATED') return true;
  if (action === 'CHAT_MESSAGE_CREATED') return prefs.chat_enabled !== false;
  if (action === 'CALENDAR_EVENT_CREATED') return prefs.family_events_enabled !== false;
  if (/^(CLAIM_|CHANGE_REQUEST_|DISPUTE_FILED|DISPUTE_RESOLVED)/.test(action)) {
    return prefs.workflow_enabled !== false;
  }
  return false;
}
