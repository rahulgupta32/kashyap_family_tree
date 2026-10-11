import { SparrowSmsProviderAdapter } from '../src/modules/auth/sms/sparrow-sms-provider.adapter';
import { TestSmsProviderAdapter } from '../src/modules/auth/sms/test-sms-provider.adapter';

describe('Separate notification SMS and OTP delivery', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env.NODE_ENV='test'; process.env.SPARROW_SMS_TOKEN='fictional-provider-token'; });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); process.env={...originalEnv}; });
  function adapter() {
    const provider = new SparrowSmsProviderAdapter();
    jest.spyOn((provider as any).logger,'error').mockImplementation(() => undefined);
    return provider;
  }
  it.each(['sendOtp','sendNotification'] as const)('%s sends the correct content over the configured HTTPS form contract', async method => {
    const fetch=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({response_code:200,message_id:'fictional-receipt'})} as Response);
    const message=method==='sendOtp'?'123456':'प्रशासनिक सूचना उपलब्ध छ। (An official notice is available)';
    expect(await adapter()[method]('+9779847312222',message)).toMatchObject({success:true,provider:'SparrowSMS'});
    expect(fetch.mock.calls[0][0]).toBe('https://api.sparrowsms.com/v2/sms/');
    const request=fetch.mock.calls[0][1]!;
    const form=new URLSearchParams(request.body as string);
    expect(form.get('to')).toBe('9779847312222');
    expect(form.get('token')).toBe('fictional-provider-token');
    expect(form.get('text')).toBe(method==='sendOtp'?`Your Kashyap Adhikari Family Tree verification code is ${message}. Valid for 5 minutes. Do not share.`:message);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(['sendOtp','sendNotification'] as const)('%s aborts a stalled delivery and releases its timeout',async method=>{
    jest.useFakeTimers();
    jest.spyOn(global,'fetch').mockImplementation((_url,request)=>new Promise((_resolve,reject)=>{
      request!.signal!.addEventListener('abort',()=>reject(new Error('private provider credential echoed')), {once:true});
    }));
    const pending=adapter()[method]('+9779847312222','123456');
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual({success:false,provider:'SparrowSMS',error:'SMS_PROVIDER_UNAVAILABLE'});
    expect(jest.getTimerCount()).toBe(0);
  });
  it('keeps the deadline active while consuming a stalled response body',async()=>{
    jest.useFakeTimers();
    jest.spyOn(global,'fetch').mockImplementation(async(_url,request)=>({ok:true,json:()=>new Promise((_resolve,reject)=>{
      request!.signal!.addEventListener('abort',()=>reject(new Error('private body details')), {once:true});
    })} as Response));
    const pending=adapter().sendNotification('+9779847312222','Generic alert');
    await jest.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({success:false,error:'SMS_PROVIDER_UNAVAILABLE'});
    expect(jest.getTimerCount()).toBe(0);
  });
  it('releases the timeout after confirmed provider acceptance',async()=>{
    jest.useFakeTimers();
    jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({response_code:200})} as Response);
    expect(await adapter().sendNotification('+9779847312222','Generic alert')).toMatchObject({success:true});
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not treat HTTP success with a malformed receipt as accepted delivery',async()=>{
    jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>null} as Response);
    expect(await adapter().sendNotification('+9779847312222','Generic alert')).toEqual({success:false,provider:'SparrowSMS',error:'SMS_PROVIDER_REJECTED'});
  });
  it('keeps notification simulation out of authentication OTP history',async()=>{
    const provider=new TestSmsProviderAdapter(); provider.clear();
    await provider.sendOtp('+9779847312222','123456');
    expect(await provider.sendNotification('+9779847312222','Private notification')).toMatchObject({simulated:true,success:true});
    expect(provider.getLastOtp('+9779847312222')).toBe('123456');
    expect(provider.getLastOtp('+9779847312223')).toBeNull();
    provider.clear();
  });
  it('forbids notification simulation if the environment changes to production',async()=>{
    const provider=new TestSmsProviderAdapter(); process.env.NODE_ENV='production';
    await expect(provider.sendNotification('+9779847312222','Private notification')).rejects.toThrow('cannot execute in production');
  });
});
