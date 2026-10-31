import { Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, sign } from 'crypto';
import { PushNotificationProvider, PushProviderOutcome } from './push-provider.interface';

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** In-process HTTP v1 adapter. Provider URLs cannot come from a key file or caller. */
@Injectable()
export class FcmPushProvider implements PushNotificationProvider {
  private cached?: { fingerprint: string; token: string; expires: number };

  private credentials() {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON || '';
    const value = JSON.parse(raw);
    if (value.type !== 'service_account' || typeof value.project_id !== 'string' ||
      /\s/.test(value.project_id) || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(value.project_id) ||
      typeof value.client_email !== 'string' || !/^[a-zA-Z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(value.client_email) ||
      /\s/.test(value.client_email) || typeof value.private_key !== 'string') throw new Error();
    const key = createPrivateKey(value.private_key);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0)<2048) throw new Error();
    return { project: value.project_id, email: value.client_email, key,
      fingerprint: createHash('sha256').update(raw).digest('hex') };
  }

  private async request(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),8000);
    try {
      const response = await fetch(url,{...init,redirect:'error',signal:controller.signal});
      if (response.redirected || !response.body) throw new Error();
      const reader = response.body.getReader();
      let size=0;
      const chunks: Uint8Array[]=[];
      try {
        for (;;) {
          const part=await reader.read();
          if (part.done) break;
          size+=part.value.length;
          if (size>16384) {await reader.cancel();throw new Error();}
          chunks.push(part.value);
        }
      } finally {reader.releaseLock();}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return { ok:response.ok, status:response.status, body };
    } finally {clearTimeout(timeout);}
  }

  private async accessToken(credentials: ReturnType<FcmPushProvider['credentials']>) {
    if (this.cached?.fingerprint===credentials.fingerprint && this.cached.expires>Date.now()+60000) return this.cached.token;
    const now=Math.floor(Date.now()/1000);
    const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
    const claims=Buffer.from(JSON.stringify({iss:credentials.email,scope:SCOPE,aud:OAUTH_URL,iat:now,exp:now+3600})).toString('base64url');
    const signingInput=header+'.'+claims;
    const assertion=sign('RSA-SHA256',Buffer.from(signingInput),credentials.key).toString('base64url');
    const result=await this.request(OAUTH_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signingInput+'.'+assertion}).toString()});
    const value=result.body;
    if (!result.ok || typeof value.access_token!=='string' || !value.access_token || value.access_token.length>4096 ||
      /\s|[\x00-\x1f\x7f]/.test(value.access_token) || value.token_type!=='Bearer' ||
      !Number.isInteger(value.expires_in) || value.expires_in<=60 || value.expires_in>3600) throw new Error();
    this.cached={fingerprint:credentials.fingerprint,token:value.access_token,expires:Date.now()+value.expires_in*1000};
    return value.access_token;
  }

  async send(token: string, deliveryId: string, authorize: () => Promise<boolean>): Promise<PushProviderOutcome> {
    let credentials: ReturnType<FcmPushProvider['credentials']>, access: string;
    try {
      if (deliveryId.length!==36 || !uuid.test(deliveryId) || typeof token!=='string' || token.length<16 || token.length>500 || /\s|[\x00-\x1f\x7f]/.test(token)) throw new Error();
      credentials=this.credentials();access=await this.accessToken(credentials);
      // OAuth can take time. Recheck current device/account/audience after it completes.
      if (!await authorize()) return {status:'SKIPPED'};
    } catch { return {status:'REJECTED'}; } // No send request was made.
    try {
      const result=await this.request(`https://fcm.googleapis.com/v1/projects/${credentials.project}/messages:send`,{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},
        body:JSON.stringify({message:{token,notification:{title:'Kashyap Adhikari',body:'You have a new update / नयाँ सूचना'},
          data:{deliveryId}}}),
      });
      if (result.ok) {
        const prefix=`projects/${credentials.project}/messages/`, name=result.body?.name;
        if (typeof name!=='string' || /\s/.test(name) || !name.startsWith(prefix) || !/^[A-Za-z0-9_:%.-]{1,200}$/.test(name.slice(prefix.length))) return {status:'UNKNOWN'};
        return {status:'ACCEPTED',receiptHash:createHash('sha256').update(name).digest('hex')};
      }
      const details=result.body?.error?.details;
      if (result.status===401 || result.status===403) this.cached=undefined;
      if (result.status===404 && Array.isArray(details) && details.some(item=>item?.['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError' && item.errorCode==='UNREGISTERED')) return {status:'INVALID_TOKEN'};
      // Even definite rejection is held for reviewed remediation, never a hot retry loop.
      return {status:'REJECTED'};
    } catch { return {status:'UNKNOWN'}; } // Request may have reached FCM. Never retry it blindly.
  }
}
