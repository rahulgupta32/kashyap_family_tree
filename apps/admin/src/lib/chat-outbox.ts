'use client';

export interface QueuedChatMessage {id:string;conversationId:string;content:string;createdAt:number;attempts:number;nextAttemptAt:number;state:'queued'|'failed';status?:number}
interface Envelope {epoch:string;owner:string;api:string;key:CryptoKey;iv:Uint8Array;data:ArrayBuffer}
const DB='kashyap_chat_outbox_v1',STORE='state',STORAGE_LOCK='kashyap_chat_outbox_storage',PUMP_LOCK='kashyap_chat_outbox_pump',CHANNEL='kashyap_chat_outbox_changed';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function supported(){if(!window.isSecureContext||!crypto.subtle||!indexedDB||!navigator.locks)throw new Error('Secure queue storage is unavailable');}
function signal(){window.dispatchEvent(new Event(CHANNEL));try{const channel=new BroadcastChannel(CHANNEL);channel.postMessage('changed');channel.close();}catch{}}
async function database():Promise<IDBDatabase>{
 supported();return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);let expired=false;
 const timer=setTimeout(()=>{expired=true;reject(new Error('Queue storage is busy'));},3000);
 request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
 request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);expired=true;reject(new Error('Queue storage is blocked'));};
 request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result);};});
}
async function read():Promise<Envelope|undefined>{const db=await database();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get('queue');let result:Envelope|undefined;
 request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Queue read aborted'));
 });}finally{db.close();}}
async function write(value?:Envelope){const db=await database();try{await new Promise<void>((resolve,reject)=>{
 const tx=db.transaction(STORE,'readwrite');if(value)tx.objectStore(STORE).put(value,'queue');else tx.objectStore(STORE).delete('queue');
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Queue write aborted'));
 });}finally{db.close();}}
async function lock<T>(work:()=>Promise<T>):Promise<T>{supported();return await navigator.locks.request(STORAGE_LOCK,work) as T;}
export async function purgeBrowserChatOutbox(){localStorage.setItem('kashyap_chat_outbox_generation',crypto.randomUUID());await lock(()=>write());signal();}
function aad(value:Envelope){return new TextEncoder().encode(JSON.stringify([value.owner,value.api,value.epoch]));}
async function decode(value:Envelope):Promise<QueuedChatMessage[]>{
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:aad(value)},value.key,value.data);
 const rows=JSON.parse(new TextDecoder().decode(plain));
 if(!Array.isArray(rows)||rows.length>100||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>!uuid.test(r.id)||!uuid.test(r.conversationId)||typeof r.content!=='string'||!r.content.trim()||r.content.length>4000||!['queued','failed'].includes(r.state)||!Number.isSafeInteger(r.createdAt)||!Number.isSafeInteger(r.attempts)||r.attempts<0||!Number.isSafeInteger(r.nextAttemptAt)))throw new Error('Unreadable message queue');
 return rows;
}
async function encode(value:Envelope,rows:QueuedChatMessage[]){const plain=new TextEncoder().encode(JSON.stringify(rows));if(rows.length>100||plain.byteLength>524288)throw new Error('Message queue is full');
 const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(value)},value.key,plain);return {...value,iv,data};
}
class SendFailure extends Error {constructor(public status:number){super('Queued send failed');}}
export class BrowserChatOutbox {
 readonly owner:string;readonly api:string;
 private generation=localStorage.getItem('kashyap_chat_outbox_generation');
 private stopped=false;private sending:string|null=null;private controller:AbortController|null=null;
 constructor(private options:{owner:string;api:string;getToken:()=>string|null;refresh:()=>Promise<string|null>}){this.owner=options.owner;this.api=new URL(options.api).href.replace(/\/$/,'');}
 private token(){const token=this.options.getToken();try{
 if(!token||localStorage.getItem('kashyap_chat_outbox_generation')!==this.generation)throw new Error();const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const payload=JSON.parse(atob(part));if(payload.sub!==this.owner)throw new Error();return token;
 }catch{throw new Error('Message session changed');}}
 private async state(create:boolean){this.token();let value=await read();
 if(value&&(value.owner!==this.owner||value.api!==this.api)){await write();value=undefined;}
 if(!value&&create){const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);value={epoch:crypto.randomUUID(),owner:this.owner,api:this.api,key,iv:new Uint8Array(12),data:new ArrayBuffer(0)};value=await encode(value,[]);this.token();await write(value);}
 return value;
 }
 async list(){return lock(async()=>{const value=await this.state(false);const rows=value?await decode(value):[];this.token();return rows;});}
 async enqueue(conversationId:string,content:string){content=content.trim();if(!uuid.test(conversationId)||!content||content.length>4000)throw new Error('Invalid queued message');
 const row:QueuedChatMessage={id:crypto.randomUUID(),conversationId,content,createdAt:Date.now(),attempts:0,nextAttemptAt:0,state:'queued'};
 await lock(async()=>{const value=(await this.state(true))!,rows=await decode(value);if(rows.length>=100)throw new Error('Message queue is full');const encoded=await encode(value,[...rows,row]);this.token();await write(encoded);});signal();return row;
 }
 async change(id:string,discard:boolean){supported();await navigator.locks.request(PUMP_LOCK,{ifAvailable:true},async acquired=>{if(!acquired)throw new Error('A queued message is sending');await lock(async()=>{const value=await this.state(false);if(!value)return;
 if(id===this.sending)throw new Error('Message is sending');const rows=await decode(value),index=rows.findIndex(r=>r.id===id);if(index<0)return;
 if(discard)rows.splice(index,1);else rows[index]={...rows[index],state:'queued',attempts:0,nextAttemptAt:0,status:undefined};
 const encoded=await encode(value,rows);this.token();await write(encoded);});});signal();}
 stop(){this.stopped=true;this.controller?.abort();}
 private async post(row:QueuedChatMessage){
 this.controller=new AbortController();const timer=setTimeout(()=>this.controller?.abort(),20000);
 try{
 const send=()=>fetch(`${this.api}/chat/conversations/${row.conversationId}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token()}`},body:JSON.stringify({content:row.content,clientMessageId:row.id}),signal:this.controller!.signal,cache:'no-store'});
 let response=await send();this.token();
 if(response.status===401){const refreshed=await this.options.refresh();this.token();if(!refreshed)throw new SendFailure(503);response=await send();}
 if(!response.ok)throw new SendFailure(response.status);
 const value=await response.json();if(typeof value?.id!=='string'||!value.id)throw new Error('Unconfirmed message response');
 }finally{clearTimeout(timer);this.controller=null;}
 }
 async pump(){supported();if(this.stopped||!navigator.onLine||document.visibilityState!=='visible')return;
 await navigator.locks.request(PUMP_LOCK,{ifAvailable:true},async acquired=>{if(!acquired)return;
 const deferred=new Set<string>();let epoch:string|undefined;
 for(let attempt=0;attempt<100&&!this.stopped;attempt++){
 if(!navigator.onLine||document.visibilityState!=='visible')return;
 const item=await lock(async()=>{this.token();const value=await read();if(!value||value.owner!==this.owner||value.api!==this.api||epoch&&epoch!==value.epoch)return null;epoch=value.epoch;
 const rows=await decode(value),blocked=new Set(deferred);for(const row of rows){if(blocked.has(row.conversationId))continue;if(row.state==='failed'||row.nextAttemptAt>Date.now()){blocked.add(row.conversationId);continue;}return row;}return null;});
 if(!item)return;this.sending=item.id;let success=false,status:number|undefined;
 try{this.token();if(this.stopped)return;await this.post(item);success=true;}catch(e){if(e instanceof SendFailure)status=e.status;}finally{this.sending=null;}
 if(this.stopped)return;this.token();
 await lock(async()=>{const value=await read();if(!value||value.epoch!==epoch||value.owner!==this.owner||value.api!==this.api)return;
 const rows=await decode(value),index=rows.findIndex(r=>r.id===item.id);if(index<0)return;
 if(success)rows.splice(index,1);else{const retryable=status===undefined||status===408||status===429||status>=500;
 rows[index]={...rows[index],attempts:Math.min(1000,item.attempts+1),status,state:retryable?'queued':'failed',nextAttemptAt:Date.now()+Math.min(60000,2000*2**Math.min(5,item.attempts))};deferred.add(item.conversationId);}
 const encoded=await encode(value,rows);this.token();await write(encoded);});signal();
 }
 });
 }
 subscribe(listener:()=>void){let channel:BroadcastChannel|undefined;try{channel=new BroadcastChannel(CHANNEL);channel.onmessage=listener;}catch{}window.addEventListener(CHANNEL,listener);return()=>{channel?.close();window.removeEventListener(CHANNEL,listener);};}
}
