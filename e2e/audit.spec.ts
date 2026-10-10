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
 await expect(page.getByRole('alert')).toContainText('Audit delivery status is unavailable');
 await expect(page.getByText('This API process)',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Private fictional upstream detail',{exact:false})).toHaveCount(0);
});
