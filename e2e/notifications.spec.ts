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
