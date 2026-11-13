export const PUSH_NOTIFICATION_PROVIDER = Symbol('PUSH_NOTIFICATION_PROVIDER');
export type PushProviderOutcome =
  | { status: 'ACCEPTED'; receiptHash: string }
  | { status: 'INVALID_TOKEN' | 'REJECTED' | 'UNKNOWN' | 'SKIPPED' };

/** Acceptance is an authenticated provider acknowledgement, never device delivery. */
export interface PushNotificationProvider {
  send(token: string, deliveryId: string, authorize: () => Promise<boolean>): Promise<PushProviderOutcome>;
}
