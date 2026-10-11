import { test, expect } from '@playwright/test';
import { API, login, headers } from './helpers/auth';

test('Central audit integrity is available in the console and denied to branch reviewers',async({page,browser})=>{
 await login(page);await page.goto('/audit');
 await expect(page.getByRole('heading',{name:'अडिट इतिहास (Audit history)',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Verify audit integrity',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('VERIFIED');
 await expect(page.getByRole('status')).not.toContainText('BROKEN');
 const response=await page.request.get(`${API}/audit/integrity`,{headers:await headers(page)});
 expect(response.ok(),await response.text()).toBeTruthy();
 const result=await response.json();expect(result.status).toBe('VERIFIED');expect(result.verifiedRecords).toBeGreaterThan(0);
 expect(result.legacyRecords).toBe(0);expect(result.failure).toBeNull();
 const context=await browser.newContext({ extraHTTPHeaders: { Origin: `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}` } });
 try{
  const reviewer=await context.newPage();await login(reviewer,'9800000002');
  const denied=await reviewer.request.get(`${API}/audit/integrity`,{headers:await headers(reviewer)});expect(denied.status()).toBe(403);
 }finally{await context.close();}
});


test('Central administrators can inspect redacted delivery backlog; branch reviewers and anonymous callers are denied',async({page,browser})=>{
 await login(page);await page.goto('/audit');
 await expect(page.getByRole('heading',{name:'अडिट वितरण (Audit delivery)',exact:true})).toBeVisible();
 await expect(page.getByText('This API process)',{exact:false})).toContainText('TEST_DISABLED');
 const response=await page.request.get(`${API}/audit/delivery`,{headers:await headers(page)});
 expect(response.ok(),await response.text()).toBeTruthy();expect(response.headers()['cache-control']).toBe('no-store');
 const data=await response.json();expect(data.backlog.pending).toBeGreaterThan(0);expect(data.worker.scope).toBe('THIS_API_PROCESS');
 expect(data.backlog.pushProvider.acceptanceOnly).toBe(true);expect(data.notificationWorker.scope).toBe('THIS_API_PROCESS');
 const push=page.getByRole('region',{name:'पुश प्रदायक अवस्था (Push provider status)',exact:true});
 await expect(push).toBeVisible();await expect(push.getByText('Provider acceptance does not confirm delivery to a device.',{exact:false})).toBeVisible();
 await expect(push.getByText('Notification worker, this API process)',{exact:false})).toContainText('TEST_DISABLED');
 for(const key of ['heldDispatches','expiredClaims','unknownDevices','rejectedDevices'])expect(data.backlog.pushProvider[key]).toBeGreaterThanOrEqual(0);
 for(const key of ['entity_id','actor_id','ip_address','user_agent','new_value','last_error'])expect(JSON.stringify(data)).not.toContain(key);
 await page.getByRole('button',{name:'अवस्था ताजा गर्नुहोस् (Refresh delivery status)',exact:true}).click();
 await expect(page.getByText('This API process)',{exact:false})).toContainText('TEST_DISABLED');
 const anonymous=await browser.newContext();
 try{expect((await anonymous.request.get(`${API}/audit/delivery`)).status()).toBe(401);}finally{await anonymous.close();}
 const context=await browser.newContext({extraHTTPHeaders:{Origin:`http://127.0.0.1:${process.env.ADMIN_PORT||'3002'}`}});
 try{const reviewer=await context.newPage();await login(reviewer,'9800000002');expect((await reviewer.request.get(`${API}/audit/delivery`,{headers:await headers(reviewer)})).status()).toBe(403);await reviewer.goto('/audit');await expect(reviewer.getByRole('heading',{name:'अडिट वितरण (Audit delivery)',exact:true})).toHaveCount(0);}finally{await context.close();}
});

test('Delivery refresh clears old status and presents an unavailable response without stale counts',async({page})=>{
 await login(page);await page.goto('/audit');
 await expect(page.getByText('This API process)',{exact:false})).toContainText('TEST_DISABLED');
 await page.route(`${API}/audit/delivery`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Private fictional upstream detail'})}));
 await page.getByRole('button',{name:'अवस्था ताजा गर्नुहोस् (Refresh delivery status)',exact:true}).click();
 await expect(page.getByRole('region',{name:'अडिट वितरण (Audit delivery)',exact:true}).getByRole('alert')).toContainText('Audit delivery status is unavailable');
 await expect(page.getByText('This API process)',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'पुश प्रदायक अवस्था (Push provider status)',exact:true})).toHaveCount(0);
 await expect(page.getByText('Private fictional upstream detail',{exact:false})).toHaveCount(0);
});

test('Push monitoring exposes held outcomes with keyboard refresh and clears resolved counts without resending',async({page})=>{
 await login(page);const response=await page.request.get(`${API}/audit/delivery`,{headers:await headers(page)});expect(response.ok()).toBeTruthy();
 const saved=await response.json();const current={...saved,backlog:{...saved.backlog,pushProvider:{...saved.backlog.pushProvider,heldDispatches:2,unknownDevices:1,expiredClaims:1}}};
 await page.route(`${API}/audit/delivery`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(current)}));
 await page.goto('/audit');const panel=page.getByRole('region',{name:'पुश प्रदायक अवस्था (Push provider status)',exact:true});
 await expect(panel.getByRole('alert')).toContainText('Push outcomes require review');
 const held=panel.getByText('समीक्षाका लागि रोकिएको (Held push dispatches)',{exact:true}).locator('..').locator('dd');await expect(held).toHaveText('2');
 await expect(panel.getByRole('button')).toHaveCount(0);
 current.backlog.pushProvider={...saved.backlog.pushProvider,heldDispatches:0,unknownDevices:0,expiredClaims:0,rejectedDevices:0};
 const refresh=page.getByRole('button',{name:'अवस्था ताजा गर्नुहोस् (Refresh delivery status)',exact:true});await refresh.focus();await page.keyboard.press('Enter');
 await expect(held).toHaveText('0');await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('Malformed push monitoring responses do not show healthy zero counts or upstream failure details',async({page})=>{
 await login(page);const response=await page.request.get(`${API}/audit/delivery`,{headers:await headers(page)});expect(response.ok()).toBeTruthy();const saved=await response.json();
 await page.route(`${API}/audit/delivery`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...saved,
  backlog:{...saved.backlog,pushProvider:{acceptanceOnly:true,heldDispatches:'0'}},
  notificationWorker:{...saved.notificationWorker,lastFailureCodes:['private-token-provider-detail']}})}));
 await page.goto('/audit');const panel=page.getByRole('region',{name:'पुश प्रदायक अवस्था (Push provider status)',exact:true});
 await expect(panel.getByRole('alert')).toContainText('Push status is unavailable');await expect(panel.locator('dd')).toHaveCount(0);
 await expect(panel.getByText('Notification worker status is unavailable.',{exact:true})).toBeVisible();
 await expect(page.getByText('private-token-provider-detail',{exact:false})).toHaveCount(0);
});

test('Recovery review exposes labelled controls, rejects unconfirmed actions and clears stale evidence',async({page})=>{
 await login(page);
 const event='11111111-1111-4111-8111-111111111111';
 await page.route(`${API}/audit/delivery/recovery`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({exhausted:[{id:event,created_at:new Date().toISOString(),retry_count:10}],requests:[]})}));
 await page.goto('/audit');
 const panel=page.getByRole('region',{name:'समीक्षित पुनः प्रयास (Reviewed audit retry)',exact:true});
 await expect(panel.getByLabel('सुधारको कारण (Recovery reason)',{exact:true})).toHaveValue('DEPENDENCY_RECOVERED');
 await expect(panel.getByRole('link',{name:'प्रमाणक जाँच (Verify authenticator)',exact:true})).toHaveAttribute('href','/mfa');
 let input:any;
 await page.route(`${API}/audit/delivery/${event}/recovery`,route=>{input=route.request().postDataJSON();return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Private upstream detail'})});});
 await panel.getByRole('button',{name:'प्रस्ताव गर्नुहोस् (Propose one retry)',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Action unconfirmed');
 expect(input.reasonCode).toBe('DEPENDENCY_RECOVERED');expect(input.requestId).toMatch(/^[0-9a-f-]{36}$/);
 await expect(panel.getByText(event,{exact:false})).toHaveCount(0);await expect(panel.getByText('Private upstream detail',{exact:false})).toHaveCount(0);
});

test('Recovery approval disables self-approval and expired proposals while permitting a distinct review',async({page})=>{
 await login(page);const me=await page.request.get(`${API}/auth/me`,{headers:await headers(page)});expect(me.ok()).toBeTruthy();const actor=await me.json();
 const own='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',expired='33333333-3333-4333-8333-333333333333';
 const item=(id:string,proposed_by:string,expires_at:string)=>({id,outbox_id:id,proposed_by,reason_code:'DEPENDENCY_RECOVERED',expires_at,outcome:null});
 await page.route(`${API}/audit/delivery/recovery`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({exhausted:[],requests:[item(own,actor.id,new Date(Date.now()+3600000).toISOString()),item(other,'44444444-4444-4444-8444-444444444444',new Date(Date.now()+3600000).toISOString()),item(expired,'44444444-4444-4444-8444-444444444444',new Date(Date.now()-1000).toISOString())]})}));
 await page.goto('/audit');const panel=page.getByRole('region',{name:'समीक्षित पुनः प्रयास (Reviewed audit retry)',exact:true});
 const buttons=panel.getByRole('button',{name:'स्वीकृत गरी एक प्रयास गर्नुहोस् (Approve one attempt)',exact:true});
 await expect(buttons).toHaveCount(3);await expect(buttons.nth(0)).toBeDisabled();await expect(buttons.nth(1)).toBeEnabled();await expect(buttons.nth(2)).toBeDisabled();
 await page.route(`${API}/audit/delivery/recovery/${other}/approve`,route=>route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:other,outcome:'FAILED',alreadyDecided:false})}));
 await buttons.nth(1).click();await expect(panel.getByRole('status')).toContainText('Retry failed; evidence remains retained');
});
