import { test,expect } from '@playwright/test';
import { API,login,headers } from './helpers/auth';
test('owned device inventory supports confirmed targeted revocation and preserves current access',async({page,browser})=>{
 await login(page);const context=await browser.newContext({extraHTTPHeaders:{Origin:`http://127.0.0.1:${process.env.ADMIN_PORT||'3002'}`}});
 try {
  const other=await context.newPage();await login(other);const refreshed=await other.evaluate(async()=>(window as any).__kashyap_refreshSession());expect(refreshed).toBeTruthy();const token=`Bearer ${refreshed}`;
  const me=await other.request.get(`${API}/auth/sessions`,{headers:{Authorization:token}});expect(me.ok()).toBeTruthy();const target=(await me.json()).items.find((item:any)=>item.isCurrent);expect(target).toBeTruthy();
  await page.goto('/devices');await expect(page.getByRole('heading',{name:'मेरा उपकरणहरू (My devices)',exact:true})).toBeVisible();await expect(page.getByText('यो उपकरण (This device)',{exact:true})).toBeVisible();
  const request=page.waitForResponse(r=>r.url()===`${API}/auth/sessions/${target.id}/revoke`&&r.request().method()==='POST');
  // Select by the retained API identity rather than a client-supplied label shared by multiple devices.
  await page.route(`${API}/auth/sessions`,async route=>{const response=await route.fetch();const data=await response.json();data.items=data.items.filter((item:any)=>item.isCurrent||item.id===target.id);await route.fulfill({response,json:data});});
  await page.getByRole('button',{name:'सूची ताजा गर्नुहोस् (Refresh devices)',exact:true}).click();await page.getByRole('button',{name:'साइन आउट गर्नुहोस् (Sign out device)',exact:true}).click();await page.getByRole('button',{name:'पुष्टि गर्नुहोस् (Confirm sign out)',exact:true}).click();expect((await request).ok()).toBeTruthy();
  expect((await other.request.get(`${API}/auth/me`,{headers:{Authorization:token}})).status()).toBe(401);expect((await page.request.get(`${API}/auth/me`,{headers:await headers(page)})).ok()).toBeTruthy();
 }finally{await context.close();}
});
test('unconfirmed device action clears old rows and displays no private error detail',async({page})=>{
 await login(page);const id='11111111-1111-4111-8111-111111111111';await page.route(`${API}/auth/sessions`,route=>route.fulfill({json:{items:[{id,platform:'ios',label:'Fictional private label',createdAt:new Date().toISOString(),expiresAt:new Date().toISOString(),isCurrent:false}],nextCursor:null}}));await page.goto('/devices');await page.getByRole('button',{name:'साइन आउट गर्नुहोस् (Sign out device)',exact:true}).click();await page.route(`${API}/auth/sessions/${id}/revoke`,route=>route.fulfill({status:503,json:{message:'PRIVATE_PROVIDER_DETAIL'}}));await page.getByRole('button',{name:'पुष्टि गर्नुहोस् (Confirm sign out)',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Action unconfirmed');await expect(page.getByText('ios — Fictional private label',{exact:true})).toHaveCount(0);await expect(page.getByText('PRIVATE_PROVIDER_DETAIL',{exact:false})).toHaveCount(0);
});
