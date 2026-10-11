import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';
import { SparrowSmsProviderAdapter } from '../src/modules/auth/sms/sparrow-sms-provider.adapter';
const secret = 'private-phone-otp-token-message\nforged-log';
const failure = 'NOTIFICATION_DELIVERY_UNAVAILABLE';
const payload = { action: 'CLAIM_APPROVED_AND_LINKED', message: secret };
describe('External notification metadata privacy', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });
  function setup() {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_accounts u')) return { rows: [{ id: 'owner', email_enabled: true }] };
      if (sql.includes('SELECT phone_number')) return { rows: [{ phone_number: secret }] };
      if (sql.includes('notification_preferences')) return { rows: [{ sms_enabled: true }] };
      if (sql.includes('RETURNING id')) return { rows: [{ id: 'dispatch' }] };
      return { rows: [] };
    });
    const sms = { sendNotification: jest.fn(), sendOtp: jest.fn() };
    const service = new NotificationDispatcherService({ query } as any, sms);
    const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    return { query, sms, service, log, warn };
  }
  it('redacts initial failure results, durable errors and logs', async () => {
    const { query, sms, service, warn } = setup();
    sms.sendNotification.mockRejectedValue(new Error(secret));
    const result = await service.processRecord({ id: 'outbox', actor_id: 'owner', action: payload.action });
    expect(result).toMatchObject([{ status: 'FAILED', error: failure }]);
    const update = query.mock.calls.find(call => call[0].includes("delivery_status = 'FAILED'"));
    expect(update?.[1][0]).toBe(failure);
    expect(JSON.stringify([result, update, warn.mock.calls])).not.toContain(secret);
  });
  it.each(['retryFailedDispatches', 'recoverStrandedJobs'] as const)('%s retains retries without saving provider details', async method => {
    const { query, sms, service } = setup();
    query.mockResolvedValueOnce({ rows: [{ id: 'dispatch', channel: 'SMS', recipient_user_id: 'owner', payload, retry_count: 2 }] });
    sms.sendNotification.mockResolvedValue({ success: false, provider: secret, error: secret });
    expect(await service[method]()).toBe(0);
    const update = query.mock.calls.find(call => call[0].includes('retry_count = $2'));
    expect(update?.[1].slice(0, 4)).toEqual(['FAILED', 3, failure, '8']);
    expect(JSON.stringify(update)).not.toContain(secret);
    if (method === 'retryFailedDispatches') expect(JSON.parse(update?.[1][4]).error).toBe(failure);
  });
  it('omits recipient phones and untrusted success metadata', async () => {
    const { sms, service, log } = setup();
    sms.sendNotification.mockResolvedValue({ success: true, provider: secret, messageId: secret });
    expect(await (service as any).deliverNotification('SMS', 'owner', payload)).toEqual({ status: 'DELIVERED', provider: 'SMS_PROVIDER', simulated: false });
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('NOTIFICATION_SMS_ACCEPTED');
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it.each(['PUSH', 'EMAIL'])('redacts %s rejection and transport exceptions', async channel => {
    const { service } = setup();
    process.env[`${channel}_GATEWAY_URL`] = 'https://gateway.invalid';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 503, statusText: secret } as Response).mockRejectedValueOnce(new Error(secret));
    for (let i = 0; i < 2; i++) await expect((service as any).deliverNotification(channel, 'owner', payload)).rejects.toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['PUSH', 'EMAIL'])('does not log private %s simulated payloads', async channel => {
    const { service, log } = setup();
    delete process.env[`${channel}_GATEWAY_URL`]; delete process.env.FCM_SERVER_KEY; delete process.env.SMTP_HOST;
    process.env.ALLOW_SIMULATED_NOTIFICATIONS = 'true';
    expect(await (service as any).deliverNotification(channel, 'owner', payload)).toMatchObject({ status: 'SIMULATED', simulated: true });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it.each(['PUSH', 'EMAIL'])('rejects %s redirects and forbids redirect following', async channel => {
    const { service } = setup();
    process.env[`${channel}_GATEWAY_URL`] = 'https://gateway.invalid/send';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, redirected: true } as Response);
    await expect((service as any).deliverNotification(channel, 'owner', payload)).rejects.toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });
  it.each(['PUSH', 'EMAIL'])('forbids production %s simulation even when opted in', async channel => {
    const { service, log } = setup();
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_SIMULATED_NOTIFICATIONS = 'true';
    delete process.env[`${channel}_GATEWAY_URL`];
    const fetch = jest.spyOn(global, 'fetch');
    await expect((service as any).deliverNotification(channel, 'owner', payload)).rejects.toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it('never reports delivery for an unsupported channel', async () => {
    const { service } = setup();
    await expect((service as any).deliverNotification('UNKNOWN', 'owner', payload)).rejects.toThrow(/^NOTIFICATION_DELIVERY_UNAVAILABLE$/);
  });
  it.each(['rejected', 'thrown'])('redacts Sparrow %s responses', async mode => {
    process.env.SPARROW_SMS_TOKEN = secret;
    const adapter = new SparrowSmsProviderAdapter();
    const log = jest.spyOn((adapter as any).logger, 'error').mockImplementation(() => undefined);
    const fetch = jest.spyOn(global, 'fetch');
    if (mode === 'rejected') fetch.mockResolvedValue({ ok: false, json: async () => ({ response: secret, token: secret }) } as Response);
    else fetch.mockRejectedValue(new Error(secret));
    const result = await adapter.sendNotification(secret, secret);
    expect(result).toEqual({ success: false, provider: 'SparrowSMS', error: mode === 'rejected' ? 'SMS_PROVIDER_REJECTED' : 'SMS_PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(secret);
  });
});
