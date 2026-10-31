import { createHash, generateKeyPairSync, randomUUID, verify } from 'crypto';
import { FcmPushProvider } from '../src/modules/notifications/fcm-push.provider';

describe('FCM HTTP v1 provider boundary',()=>{
  const keys=generateKeyPairSync('rsa',{modulusLength:2048});
  const credentials={type:'service_account',project_id:'fictional-family',client_email:'push@fictional-family.iam.gserviceaccount.com',
    private_key:keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),token_uri:'https://attacker.invalid/token'};
  const saved=process.env.FCM_SERVICE_ACCOUNT_JSON;
  const token='fictional-device-registration-token',id=randomUUID();
  let fetchSpy:jest.SpyInstance,provider:FcmPushProvider;
  const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status});
  const oauth=()=>response({access_token:'fictional-access-token',token_type:'Bearer',expires_in:3600});
  const receipt='projects/fictional-family/messages/0:fictional-accepted';
  beforeEach(()=>{
    process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify(credentials);provider=new FcmPushProvider();
    fetchSpy=jest.spyOn(global,'fetch');
  });
  afterEach(()=>{fetchSpy.mockRestore();});
  afterAll(()=>{if(saved===undefined)delete process.env.FCM_SERVICE_ACCOUNT_JSON;else process.env.FCM_SERVICE_ACCOUNT_JSON=saved;});
  it('signs the narrow OAuth assertion, fixes destinations, rechecks authority, and retains only receipt hashes',async()=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({name:receipt}));
    const authorize=jest.fn(async()=>true);
    expect(await provider.send(token,id,authorize)).toEqual({status:'ACCEPTED',receiptHash:createHash('sha256').update(receipt).digest('hex')});
    expect(authorize).toHaveBeenCalledTimes(1);
    const [url,init]=fetchSpy.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');expect(init.redirect).toBe('error');
    const form=new URLSearchParams(init.body),parts=form.get('assertion')!.split('.');
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(JSON.parse(Buffer.from(parts[0],'base64url').toString())).toEqual({alg:'RS256',typ:'JWT'});
    const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
    expect(claims).toMatchObject({iss:credentials.client_email,aud:url,scope:'https://www.googleapis.com/auth/firebase.messaging'});
    expect(claims.exp-claims.iat).toBe(3600);expect(claims.sub).toBeUndefined();
    expect(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),keys.publicKey,Buffer.from(parts[2],'base64url'))).toBe(true);
    const [sendUrl,sendInit]=fetchSpy.mock.calls[1];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/fictional-family/messages:send');
    expect(sendInit.redirect).toBe('error');
    expect(JSON.parse(sendInit.body)).toEqual({message:{token,notification:{title:'Kashyap Adhikari',body:'You have a new update / नयाँ सूचना'},data:{deliveryId:id}}});
  });
  it('does not contact FCM when authorization changes during OAuth',async()=>{
    fetchSpy.mockResolvedValueOnce(oauth());
    expect(await provider.send(token,id,async()=>false)).toEqual({status:'SKIPPED'});expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it.each([undefined,'{}',JSON.stringify({...credentials,project_id:'fictional-family\n'}),JSON.stringify({...credentials,private_key:'invalid'})])('rejects missing or malformed managed credentials without network access',async value=>{
    if(value===undefined)delete process.env.FCM_SERVICE_ACCOUNT_JSON;else process.env.FCM_SERVICE_ACCOUNT_JSON=value;
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'REJECTED'});expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each([400,429,503])('holds HTTP %i failures and never invalidates a credential or retries automatically',async status=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'INVALID_ARGUMENT'}]}},status));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'REJECTED'});expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it('invalidates only the typed FCM UNREGISTERED response',async()=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}},404));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'INVALID_TOKEN'});
    fetchSpy.mockResolvedValueOnce(response({error:{details:[{errorCode:'UNREGISTERED'}]}},404));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'REJECTED'});
  });
  it.each([{}, {name:'projects/another-project/messages/receipt'}, {name:receipt+'\n'}])('treats malformed successful acknowledgements as uncertain',async body=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response(body));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'UNKNOWN'});
  });
  it('does not expose upstream diagnostics and distinguishes pre-send failure from a lost send response',async()=>{
    fetchSpy.mockRejectedValueOnce(new Error('private upstream credentials'));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'REJECTED'});
    fetchSpy.mockResolvedValueOnce(oauth()).mockRejectedValueOnce(new Error('private upstream device token'));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'UNKNOWN'});
  });
  it('bounds streamed responses and refuses redirected provider responses',async()=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({name:'x'.repeat(17000)}));
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'UNKNOWN'});
    const redirected=response({name:receipt});Object.defineProperty(redirected,'redirected',{value:true});
    fetchSpy.mockResolvedValueOnce(redirected);
    expect(await provider.send(token,id,async()=>true)).toEqual({status:'UNKNOWN'});
  });
  it('aborts a stalled send at eight seconds and classifies it as uncertain',async()=>{
    jest.useFakeTimers();
    try {
      fetchSpy.mockResolvedValueOnce(oauth()).mockImplementationOnce((_url,init)=>new Promise((_resolve,reject)=>{
        init.signal.addEventListener('abort',()=>reject(new Error('fictional timeout')),{once:true});
      }));
      const pending=provider.send(token,id,async()=>true);
      await jest.advanceTimersByTimeAsync(8000);
      expect(await pending).toEqual({status:'UNKNOWN'});expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {jest.useRealTimers();}
  });
  it('reuses short-lived OAuth tokens only for unchanged credentials and refreshes after authentication rejection',async()=>{
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({name:receipt}));
    await provider.send(token,id,async()=>true);
    fetchSpy.mockResolvedValueOnce(response({},401));await provider.send(token,id,async()=>true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({name:receipt}));await provider.send(token,id,async()=>true);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({...credentials,private_key_id:'rotated'});
    fetchSpy.mockResolvedValueOnce(oauth()).mockResolvedValueOnce(response({name:receipt}));await provider.send(token,id,async()=>true);
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });
});
