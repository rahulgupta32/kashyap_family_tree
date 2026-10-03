import { test, expect } from '@playwright/test';
import { login, API, headers } from './helpers/auth';

test('Notification preferences persist across browser reload and inbox remains session scoped',async({page,browser})=>{
  await login(page);await page.goto('/notifications');
  await expect(page.getByRole('heading',{name:'सूचनाहरू (Notifications)'})).toBeVisible();
  const toggle=page.getByRole('checkbox',{name:'सन्देश (Messages)'});
  const initial=await toggle.isChecked();
  try{
    const update=page.waitForResponse(r=>r.url().endsWith('/notifications/preferences')&&r.request().method()==='PATCH');
    await toggle.click();expect((await update).ok()).toBeTruthy();
    await page.reload();await expect(toggle).toHaveJSProperty('checked',!initial);
    const own=await page.request.get(`${API}/notifications`,{headers:await headers(page)});
    expect(own.ok()).toBeTruthy();expect((await own.json()).items).toBeInstanceOf(Array);
    const anonymous=await browser.newContext();
    try{
      const denied=await anonymous.request.get(`${API}/notifications`);expect(denied.status()).toBe(401);
    }finally{await anonymous.close();}
  }finally{
    const reset=await page.request.patch(`${API}/notifications/preferences`,{
      headers:await headers(page),data:{chatEnabled:initial}});expect(reset.ok()).toBeTruthy();
  }
});

test('An authorized branch follow persists after reload and can be unfollowed',async({page})=>{
  await login(page);await page.goto('/follows');
  await expect(page.getByRole('heading',{name:'अनुसरण (Follow manager)'})).toBeVisible();
  const branch=page.getByRole('combobox',{name:'शाखा (Branch)'});
  await expect(branch.locator('option').nth(1)).toBeAttached();
  await branch.selectOption({index:1});
  const id=await branch.inputValue();
  const label=await branch.locator('option:checked').textContent();
  let followId:string|undefined;
  try{
    const response=page.waitForResponse(r=>r.url().endsWith('/notifications/follows')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Follow branch'}).click();
    expect((await response).ok()).toBeTruthy();
    const records=await page.request.get(`${API}/notifications/follows`,{headers:await headers(page)});
    expect(records.ok()).toBeTruthy();
    followId=(await records.json()).find((f:any)=>f.targetType==='BRANCH'&&f.branchId===id)?.id;
    expect(followId).toBeTruthy();
    await page.reload();
    const selected=page.getByRole('listitem').filter({hasText:label??id});
    await expect(selected).toBeVisible();
    await selected.getByRole('button',{name:'Unfollow'}).click();
    await expect.poll(async()=>{
      const row=await page.request.get(`${API}/notifications/follows`,{headers:await headers(page)});
      return (await row.json()).some((f:any)=>f.id===followId);
    }).toBe(false);
    followId=undefined;
  }finally{
    if(followId)await page.request.delete(`${API}/notifications/follows/${followId}`,{headers:await headers(page)});
  }
});
