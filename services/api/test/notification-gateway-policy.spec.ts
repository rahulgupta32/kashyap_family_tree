import { notificationGatewayUrl } from '../src/modules/notifications/notification-gateway.policy';

describe('Private notification gateway configuration', () => {
  it('requires HTTPS in production while permitting a local HTTP test gateway', () => {
    expect(notificationGatewayUrl('https://gateway.invalid/send', true)).toBe('https://gateway.invalid/send');
    expect(notificationGatewayUrl('http://localhost:8080/send', false)).toBe('http://localhost:8080/send');
    expect(() => notificationGatewayUrl('http://gateway.invalid/send', true)).toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
    expect(notificationGatewayUrl(undefined, true)).toBeNull();
  });
  it.each(['not a URL', 'file:///private', 'https://secret@gateway.invalid/send',
    'https://user:secret@gateway.invalid/send', 'https://gateway.invalid/send#secret'])('rejects unsafe configuration without echoing %s', value => {
    expect(() => notificationGatewayUrl(value, false)).toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
  });
});
