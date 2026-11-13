import { randomBytes } from 'crypto';
import { openPushToken, sealPushToken } from '../src/modules/notifications/push-token.crypto';
import { pushTokenInput } from '../src/modules/notifications/push-tokens.service';

describe('Push credential encryption and input policy',()=>{
  const saved = { active:process.env.PUSH_TOKEN_ACTIVE_KEY_ID, keys:process.env.PUSH_TOKEN_KEYS_JSON };
  const key = ()=>randomBytes(32).toString('base64');
  beforeEach(()=>{process.env.PUSH_TOKEN_ACTIVE_KEY_ID='v1';process.env.PUSH_TOKEN_KEYS_JSON=JSON.stringify({v1:key()});});
  afterAll(()=>{
    if(saved.active===undefined)delete process.env.PUSH_TOKEN_ACTIVE_KEY_ID;else process.env.PUSH_TOKEN_ACTIVE_KEY_ID=saved.active;
    if(saved.keys===undefined)delete process.env.PUSH_TOKEN_KEYS_JSON;else process.env.PUSH_TOKEN_KEYS_JSON=saved.keys;
  });
  it('uses randomized authenticated encryption bound to the complete registration context',()=>{
    const token='private-device-token-with-sensitive-content', context='owner/family/platform/generation';
    const first=sealPushToken(token,context), second=sealPushToken(token,context);
    expect(first).not.toEqual(second);expect(first).not.toContain(token);
    expect(openPushToken(first,context)).toEqual(token);
    expect(()=>openPushToken(first,'another-owner')).toThrow('PUSH_TOKEN_DECRYPTION_UNAVAILABLE');
    const parts=first.split('.');parts[2]=randomBytes(16).toString('base64');
    expect(()=>openPushToken(parts.join('.'),context)).toThrow('PUSH_TOKEN_DECRYPTION_UNAVAILABLE');
  });
  it('reads retained historical keys while encrypting with the active key',()=>{
    const old=JSON.parse(process.env.PUSH_TOKEN_KEYS_JSON!);
    const envelope=sealPushToken('historical-push-token','context');
    process.env.PUSH_TOKEN_ACTIVE_KEY_ID='v2';process.env.PUSH_TOKEN_KEYS_JSON=JSON.stringify({...old,v2:key()});
    expect(openPushToken(envelope,'context')).toBe('historical-push-token');
    expect(sealPushToken('new-push-token','context')).toMatch(/^v2\./);
    process.env.PUSH_TOKEN_KEYS_JSON=JSON.stringify({v2:key()});
    expect(()=>openPushToken(envelope,'context')).toThrow('PUSH_TOKEN_DECRYPTION_UNAVAILABLE');
  });
  it.each(['{}','not-json',JSON.stringify({v1:'raw-secret-that-must-not-be-logged'}),JSON.stringify({v1:randomBytes(16).toString('base64')})])('fails closed with a fixed error for malformed/missing managed keys (%#)',value=>{
    process.env.PUSH_TOKEN_KEYS_JSON=value;
    expect(()=>sealPushToken('private-token','context')).toThrow(/^PUSH_TOKEN_KEY_UNAVAILABLE$/);
  });
  it.each([null,[],{token:'short',platform:'IOS'},{token:'x'.repeat(501),platform:'ANDROID'},
    {token:'private-device-token',platform:'WEB'},{token:'private-device-token\n',platform:'IOS'},
    {token:'private-device-token',platform:'IOS',userId:'another-owner'},
    {token:'private-device-token',platform:'IOS',sessionId:'spoofed'}])('rejects malformed tokens or client authority (%#)',body=>{
    expect(()=>pushTokenInput(body)).toThrow('Invalid push registration.');
  });
  it('accepts supported provider token characters and platforms',()=>{
    expect(pushTokenInput({token:'abc_123:DEF-456.789',platform:'ANDROID'})).toEqual({token:'abc_123:DEF-456.789',platform:'ANDROID'});
    expect(pushTokenInput({token:'a'.repeat(64),platform:'IOS'}).platform).toBe('IOS');
  });
});
