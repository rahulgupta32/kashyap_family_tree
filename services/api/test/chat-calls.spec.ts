import { ChatCallsService } from '../src/modules/chat/chat-calls.service';

describe('Chat call signaling controls', () => {
  const user = { id: 'member' } as any;
  const id = 'e47d9af9-71d9-4913-92d1-890cf04ed380';
  const env = process.env;
  beforeEach(() => { process.env = { ...env, CHAT_CALLS_ENABLED: 'true' }; });
  afterEach(() => { process.env = env; });

  it('checks the feature flag and action before touching the database', async () => {
    const db = { transaction: jest.fn() };
    const calls = new ChatCallsService(db as any, {} as any);
    delete process.env.CHAT_CALLS_ENABLED;
    await expect(calls.manage(id, user)).rejects.toThrow('Calls unavailable');
    process.env.CHAT_CALLS_ENABLED = 'true';
    await expect(calls.manage(id, user, { action: 'VIEW' })).rejects.toThrow('Invalid call action');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('checks direct-chat blocks before creating a call', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ blocked: true }] });
    const db = { transaction: (work: Function) => work({ query }) };
    const chat = { access: jest.fn().mockResolvedValue({ conversation_type: 'DIRECT' }) };
    const calls = new ChatCallsService(db as any, chat as any);
    await expect(calls.manage(id, user, { action: 'START', media: 'VOICE' })).rejects.toThrow('Calling is blocked');
    expect(chat.access).toHaveBeenCalledWith(id, user, { query });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO chat_calls'))).toBe(false);
  });

  it('persists a ringing direct call and joins the caller atomically', async () => {
    const ringUntil = new Date();
    const query = jest.fn(async (sql: string) => ({
      rows: sql.includes('INSERT INTO chat_calls')
        ? [{ id, caller_id: user.id, media: 'VIDEO', state: 'RINGING', ring_until: ringUntil }]
        : sql.includes('ORDER BY user_id') ? [{ user_id: user.id }] : [],
    }));
    const db = { transaction: (work: Function) => work({ query }) };
    const chat = { access: jest.fn().mockResolvedValue({ conversation_type: 'DIRECT' }) };
    const calls = new ChatCallsService(db as any, chat as any);
    await expect(calls.manage(id, user, { action: 'START', media: 'VIDEO' })).resolves.toEqual({
      call: { id, media: 'VIDEO', state: 'RINGING', startedByMe: true, ringUntil, joined: true, participantCount: 1 },
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO chat_call_participants'))).toBe(true);
  });
});
