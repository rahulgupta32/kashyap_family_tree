import { NotificationDispatcherService } from '../src/modules/notifications/notification-dispatcher.service';

describe('Notification retry ownership at the external-send boundary', () => {
  type Job = { id: string; channel: string; recipient_user_id: string; payload: any; retry_count: number;
    status: string; owner?: string; active: boolean };
  function setup(mode: 'retry' | 'stranded', count = 1) {
    const jobs: Job[] = Array.from({ length: count }, (_, index) => ({ id: `job-${index}`, channel: 'SMS',
      recipient_user_id: `recipient-${index}`, payload: { action: 'CLAIM_APPROVED_AND_LINKED', message: 'Generic fictional notice' },
      retry_count: 1, status: mode === 'retry' ? 'FAILED' : 'PROCESSING', active: false }));
    let beforeSend: (() => void) | undefined;
    const claims: string[] = [];
    const query = jest.fn(async (sql: string, args: any[] = []) => {
      if (sql.includes('SET worker_id = $1') && sql.includes('RETURNING *')) {
        const candidates = jobs.filter(job => mode === 'retry' ? job.status === 'FAILED' : job.status === 'PROCESSING' && !job.active);
        const selected = Boolean(/\bLIMIT\s+1\b/.test(sql)) ? candidates.slice(0, 1) : candidates;
        for (const job of selected) { job.status = 'PROCESSING'; job.owner = args[0]; job.active = true; claims.push(args[0]); }
        return { rows: selected.map(job => ({ ...job })) };
      }
      if (sql.includes('FROM user_accounts u')) return { rows: [{ id: args[0], sms_enabled: true, workflow_enabled: true }] };
      if (sql.includes('SELECT phone_number')) { beforeSend?.(); beforeSend = undefined; return { rows: [{ phone_number: args[0] }] }; }
      if (sql.includes('SELECT id FROM notification_dispatches')) {
        const job = jobs.find(job => job.id === args[0]);
        return { rows: job?.owner === args[1] && job.active && job.status === 'PROCESSING' ? [{ id: job.id }] : [] };
      }
      if (sql.includes('dispatched_at')) {
        const job = jobs.find(job => job.id === args[2]);
        const requiresActive = /lease_expires_at\s*>\s*clock_timestamp\(\)/.test(sql);
        if (job?.owner === args[3] && job.status === 'PROCESSING' && (!requiresActive || job.active)) { job.status = args[0]; return { rows: [{ id: job.id }] }; }
      }
      return { rows: [] };
    });
    const sms = { sendOtp: jest.fn(), sendNotification: jest.fn(async () => ({ success: true, provider: 'TestSmsProviderAdapter', simulated: true })) };
    const service = new NotificationDispatcherService({ query } as any, sms);
    const run = () => mode === 'retry' ? service.retryFailedDispatches() : service.recoverStrandedJobs();
    return { jobs, claims, query, sms, service, run, beforeSend: (work: () => void) => { beforeSend = work; } };
  }

  it.each(['retry', 'stranded'] as const)('does not send a later %s batch row after another worker takes its lease', async mode => {
    const f = setup(mode, 2);
    f.sms.sendNotification.mockImplementationOnce(async () => {
      f.jobs[1].status = 'PROCESSING'; f.jobs[1].owner = 'replacement-worker'; f.jobs[1].active = true;
      return { success: true, provider: 'TestSmsProviderAdapter', simulated: true };
    });
    expect(await f.run()).toBe(1);
    expect(f.sms.sendNotification).toHaveBeenCalledTimes(1);
    expect(f.jobs[1]).toMatchObject({ status: 'PROCESSING', owner: 'replacement-worker' });
  });

  it.each(['retry', 'stranded'] as const)('rechecks the %s lease after recipient lookup and before contacting SMS', async mode => {
    const f = setup(mode);
    f.beforeSend(() => { f.jobs[0].owner = 'replacement-worker'; });
    expect(await f.run()).toBe(0);
    expect(f.sms.sendNotification).not.toHaveBeenCalled();
    expect(f.jobs[0]).toMatchObject({ status: 'PROCESSING', owner: 'replacement-worker' });
  });

  it.each(['retry', 'stranded'] as const)('uses a fresh %s claim identity for each independently selected job', async mode => {
    const f = setup(mode, 2);
    expect(await f.run()).toBe(2);
    expect(f.sms.sendNotification).toHaveBeenCalledTimes(2);
    expect(f.claims).toHaveLength(2);
    expect(new Set(f.claims).size).toBe(2);
  });
  it.each(['retry', 'stranded'] as const)('retains a known late %s success when no replacement has taken the claim', async mode => {
    const f = setup(mode);
    f.sms.sendNotification.mockImplementationOnce(async () => {
      f.jobs[0].active = false; // The send began under a valid lease; its acknowledgement arrives late.
      return { success: true, provider: 'TestSmsProviderAdapter', simulated: true };
    });
    expect(await f.run()).toBe(1);
    expect(f.sms.sendNotification).toHaveBeenCalledTimes(1);
    expect(f.jobs[0].status).toBe('SIMULATED');
  });

  it.each(['retry', 'stranded'] as const)('does not let late %s success overwrite an actual replacement claim', async mode => {
    const f = setup(mode);
    f.sms.sendNotification.mockImplementationOnce(async () => {
      f.jobs[0].owner = 'replacement-worker';
      return { success: true, provider: 'TestSmsProviderAdapter', simulated: true };
    });
    expect(await f.run()).toBe(0);
    expect(f.sms.sendNotification).toHaveBeenCalledTimes(1);
    expect(f.jobs[0]).toMatchObject({ status: 'PROCESSING', owner: 'replacement-worker' });
  });

});
