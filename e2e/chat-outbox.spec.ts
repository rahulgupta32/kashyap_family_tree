import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, login, headers } from './helpers/auth';
const posts='**/chat/conversations/*/messages';
async function room(page:Page){
 await login(page,'9800000002');await page.goto('/chat');
 await expect(page.getByRole('heading',{name:'सन्देश (Messages)',exact:true})).toBeVisible();
 const branches=await page.request.get(`${API}/genealogy/branches`);expect(branches.ok()).toBeTruthy();
 const branch=(await branches.json()).find((b:any)=>b.code==='KASKI');
 const response=await page.request.post(`${API}/chat/conversations`,{headers:await headers(page),data:{type:'FAMILY_BRANCH',branchId:branch.id,title:`Outbox ${randomUUID()}`}});
 expect(response.ok(),await response.text()).toBeTruthy();const group=await response.json();
 await page.getByRole('button',{name:'Refresh conversations',exact:true}).click();
 await page.getByRole('button',{name:new RegExp(group.title)}).click();await expect(page.getByRole('status')).toHaveText('Live');return group;
}
async function compose(page:Page,content:string){await page.getByLabel('सन्देश (Your message)',{exact:true}).fill(content);await page.getByRole('button',{name:'पठाउनुहोस् (Send)',exact:true}).click();}
async function envelope(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('kashyap_chat_outbox_v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise<any>((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('queue');r.onsuccess=()=>resolve(r.result?{extractable:r.result.key.extractable,algorithm:r.result.key.algorithm.name,cipher:Array.from(new Uint8Array(r.result.data))}:null);r.onerror=()=>reject(r.error);});}finally{db.close();}
 });}

test('Encrypted browser intent survives reload and refresh outage; lost response retries across tabs commit once',async({page})=>{
 test.setTimeout(120000);const group=await room(page),content=`Durable fictional message ${randomUUID()}`;let committed=false;
 await page.context().route(posts,async route=>{if(route.request().method()!=='POST')return route.continue();if(!committed){const response=await route.fetch();expect(response.ok()).toBeTruthy();committed=true;}await route.abort();});
 await compose(page,content);const card=page.locator('[data-queued-id]').filter({hasText:content});await expect(card).toBeVisible();
 const id=await card.getAttribute('data-queued-id');await expect.poll(()=>committed).toBeTruthy();
 const encrypted=await envelope(page);expect(encrypted.extractable).toBe(false);expect(encrypted.algorithm).toBe('AES-GCM');
 expect(new TextDecoder().decode(new Uint8Array(encrypted.cipher))).not.toContain(content);
 expect(await page.evaluate(()=>Object.values(localStorage).join(' '))).not.toContain(content);
 await page.route('**/auth/refresh',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"Temporary test outage"}'}));
 await page.reload();await expect(page.locator(`[data-queued-id="${id}"]`)).toContainText(content);
 const second=await page.context().newPage();await second.goto('/chat');await expect(second.locator(`[data-queued-id="${id}"]`)).toContainText(content);
 await page.context().unroute(posts);await page.unroute('**/auth/refresh');
 await expect(page.locator(`[data-queued-id="${id}"]`)).toHaveCount(0,{timeout:70000});
 await expect(second.locator(`[data-queued-id="${id}"]`)).toHaveCount(0);
 const records=await page.request.get(`${API}/chat/conversations/${group.id}/messages`,{headers:await headers(page)});expect(records.ok()).toBeTruthy();
 expect((await records.json()).filter((m:any)=>m.content===content)).toHaveLength(1);await second.close();
});

test('Rejected intents stop automatic retries and can be explicitly discarded',async({page})=>{
 await room(page);let attempts=0;await page.route(posts,route=>{if(route.request().method()!=='POST')return route.continue();attempts++;return route.fulfill({status:403,contentType:'application/json',body:'{"message":"No longer allowed"}'});});
 const content=`Rejected fictional intent ${randomUUID()}`;await compose(page,content);const card=page.locator('[data-queued-id]').filter({hasText:content});
 await expect(card).toContainText('Sending stopped');await page.reload();await expect(card).toContainText('Sending stopped');expect(attempts).toBe(1);
 page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:/Discard queued message/}).click();await expect(card).toHaveCount(0);expect(attempts).toBe(1);
});

test('Logout purges encrypted pending messages in every tab',async({page})=>{
 await room(page);await page.context().route(posts,route=>route.request().method()==='POST'?route.abort():route.continue());
 const content=`Logout fictional intent ${randomUUID()}`;await compose(page,content);await expect(page.locator('[data-queued-id]').filter({hasText:content})).toBeVisible();
 const second=await page.context().newPage();await second.goto('/chat');await expect(second.getByRole('region',{name:'Queued messages'})).toContainText(content);
 const staleSession=await second.evaluate(()=>({accessToken:localStorage.getItem('kashyap_admin_access_token'),user:JSON.parse(localStorage.getItem('kashyap_admin_user')!)}));
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
 await page.route('**/auth/logout',async route=>{await held;await route.continue();});
 try{await page.getByRole('button',{name:/Logout/}).click();await expect(second).toHaveURL(/\/login/);await second.reload();await expect(second.locator('input[type=tel]')).toBeVisible();await page.evaluate(payload=>{const c=new BroadcastChannel('kashyap_auth_channel');c.postMessage({type:'TOKEN_REFRESHED',...payload});c.close();},staleSession);await second.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(second.locator('input[type=tel]')).toBeVisible();expect(await second.evaluate(()=>localStorage.getItem('kashyap_admin_access_token'))).toBeNull();}finally{release();}
 await expect(page).toHaveURL(/\/login/);await expect(second).toHaveURL(/\/login/);
 expect(await envelope(page)).toBeNull();expect(await page.evaluate(()=>localStorage.getItem('kashyap_admin_access_token'))).toBeNull();await second.close();
});

test('Storage failure retains the composer and sends no network message',async({page})=>{
 await page.addInitScript(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args:Parameters<typeof original>){if(this.transaction.db.name==='kashyap_chat_outbox_v1')throw new DOMException('Test full disk','QuotaExceededError');return original.apply(this,args);};});
 await room(page);let attempts=0;page.on('request',request=>{if(request.method()==='POST'&&/\/chat\/conversations\/[^/]+\/messages$/.test(request.url()))attempts++;});
 const content=`Unpersisted fictional intent ${randomUUID()}`;await compose(page,content);
 await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('textbox',{name:'सन्देश (Your message)',exact:true})).toHaveValue(content);expect(attempts).toBe(0);
});


test('Encrypted attachment intent survives lost commit/reload and downloads the original private bytes',async({page})=>{
 test.setTimeout(120000);const group=await room(page),content=`Fictional attachment ${randomUUID()}`;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==','base64');
 const uploads='**/chat/conversations/*/attachments';let committed=false;
 await page.context().route(uploads,async route=>{if(!committed){const response=await route.fetch();expect(response.ok(),await response.text()).toBeTruthy();committed=true;}await route.abort();});
 await page.locator('input[type=file]').setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:png});await expect(page.getByText('fictional.png',{exact:false})).toBeVisible();
 await compose(page,content);const card=page.locator('[data-queued-id]').filter({hasText:content});await expect(card).toBeVisible();const id=await card.getAttribute('data-queued-id');await expect.poll(()=>committed).toBeTruthy();
 const encrypted=await envelope(page);expect(new TextDecoder().decode(new Uint8Array(encrypted.cipher))).not.toContain(png.toString('base64'));
 await page.reload();await expect(page.locator(`[data-queued-id="${id}"]`)).toBeVisible();await page.context().unroute(uploads);
 await expect(page.locator(`[data-queued-id="${id}"]`)).toHaveCount(0,{timeout:70000});
 await page.getByRole('button',{name:new RegExp(group.title)}).click();
 const record=page.getByRole('listitem').filter({hasText:content});await expect(record.getByRole('button',{name:/Download attachment/})).toBeVisible();
 const [download]=await Promise.all([page.waitForEvent('download'),record.getByRole('button',{name:/Download attachment/}).click()]);expect(download.suggestedFilename()).toMatch(/^attachment_.*\.png$/);
 const response=await page.request.get(`${API}/chat/conversations/${group.id}/messages`,{headers:await headers(page)});const messages=(await response.json()).filter((m:any)=>m.content===content);expect(messages).toHaveLength(1);
 const file=await page.request.get(`${API}/chat/conversations/${group.id}/messages/${messages[0].id}/attachment`,{headers:await headers(page)});expect(file.ok()).toBeTruthy();expect(await file.body()).toEqual(png);expect(file.headers()['cache-control']).toBe('no-store');
});
