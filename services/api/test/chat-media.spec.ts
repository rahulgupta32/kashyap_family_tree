import { createHmac } from 'node:crypto';
import { ChatMediaService } from '../src/modules/chat/chat-media.service';

describe('LiveKit call credential and removal contract', () => {
  const call = 'e47d9af9-71d9-4913-92d1-890cf04ed380';
  const participant = '7375cb6f-d20f-4998-8d85-0a6486102405';
  const secret = 'fixture-only-key-fixture-only-key';
  const env = process.env;
  const media = new ChatMediaService();
  const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  beforeEach(() => {
    process.env = { ...env, CHAT_MEDIA_ENABLED: 'true', CHAT_LIVEKIT_URL: 'wss://fixture.livekit.cloud',
      CHAT_LIVEKIT_API_KEY: 'fixture', CHAT_LIVEKIT_API_SECRET: secret };
  });
  afterEach(() => { process.env = env; jest.restoreAllMocks(); });

  it('scopes a one-minute voice token to the active room and participant', () => {
    const { token, url } = media.credential(call, participant, 'VOICE');
    const [header, payload, signature] = token.split('.');
    expect(signature).toBe(createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'));
    const grant = claims(token);
    expect(grant).toMatchObject({ iss: 'fixture', sub: participant, video: {
      room: call, roomJoin: true, canPublishSources: ['microphone'], canPublishData: false,
    } });
    expect(grant.exp - grant.nbf).toBe(60);
    expect(grant.video.roomAdmin).toBeUndefined();
    expect(url).toBe('wss://fixture.livekit.cloud');
  });

  it('fails closed for disabled media and a non-Cloud endpoint', () => {
    process.env.CHAT_MEDIA_ENABLED = 'false';
    expect(() => media.credential(call, participant, 'VIDEO')).toThrow('Call media unavailable');
    process.env.CHAT_MEDIA_ENABLED = 'true';
    process.env.CHAT_LIVEKIT_URL = 'wss://unapproved.example';
    expect(() => media.credential(call, participant, 'VIDEO')).toThrow('configuration unavailable');
  });

  it('disconnects the target with an explicit cutoff newer than the issued credential', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ call_id: call, user_id: participant }] }) };
    const issued = claims(media.credential(call, participant, 'VIDEO').token);
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await media.revoke(client as any, 'conversation', participant);
    expect(client.query.mock.calls[0][1]).toEqual(['conversation', participant]);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://fixture.livekit.cloud/twirp/livekit.RoomService/RemoveParticipant');
    expect(options.redirect).toBe('error');
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({ room: call, identity: participant });
    expect(Number(body.revoke_token_ts)).toBeGreaterThan(issued.nbf);
    const admin = claims((options.headers as Record<string,string>).Authorization.split(' ')[1]);
    expect(admin.video).toEqual({ room: call, roomAdmin: true });
    fetch.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(media.revoke(client as any, 'conversation', participant)).rejects.toThrow('Could not revoke');
  });
});
