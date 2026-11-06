// Exact durable dispute actions emitted by ClaimsService; unknown audit actions stay silent.
export function claimDisputeNotice(action: string): boolean {
  return ['DISPUTE_FILED', 'DISPUTE_RESOLVED', 'DISPUTE_DISMISSED'].includes(action);
}

// Category switches apply to every channel. Audit-only events do not notify members.
export function notificationCategoryEnabled(action: string, prefs: any): boolean {
  if (action === 'NOTIFICATION_BROADCAST_CREATED') return true;
  if (action === 'COMMUNITY_POST_MODERATED') return prefs.community_posts_enabled !== false && prefs.workflow_enabled !== false;
  if (action === 'CHAT_MESSAGE_CREATED') return prefs.chat_enabled !== false;
  if (['CALENDAR_EVENT_CREATED','CALENDAR_EVENT_UPDATED','CALENDAR_EVENT_CANCELLED','CALENDAR_EVENT_REMINDER_DUE'].includes(action)) return prefs.family_events_enabled !== false;
  if (/^(CLAIM_|CHANGE_REQUEST_)/.test(action) || claimDisputeNotice(action)) {
    return prefs.workflow_enabled !== false;
  }
  return false;
}
