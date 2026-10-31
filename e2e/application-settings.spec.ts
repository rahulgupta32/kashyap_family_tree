import {test,expect} from '@playwright/test';
import {API,login,headers} from './helpers/auth';
test('Super Admin changes a typed setting with a reason and reviews durable history',async({page})=>{
 await login(page);const auth=await headers(page),key='calendar.preview_ttl_minutes';
 const initial=await page.request.get(`${API}/admin/settings`,{headers:auth});expect(initial.ok()).toBeTruthy();const original=(await initial.json()).find((s:any)=>s.key===key),next=original.value===10?9:10;
 try{
  await page.goto('/settings');await page.getByRole('button',{name:/Audience preview lifetime/}).click();
  await page.getByLabel('नयाँ मान (New value)').fill(String(next));await page.getByLabel('परिवर्तनको कारण (Change reason)').fill('Fictional browser policy review');
  await page.getByRole('button',{name:/Save change/}).click();const history=page.getByRole('region',{name:'Setting history'});await expect(history).toContainText('Fictional browser policy review');await expect(history).toContainText(`${original.value} → ${next}`);
  const current=await page.request.get(`${API}/admin/settings`,{headers:await headers(page)});expect((await current.json()).find((s:any)=>s.key===key)).toMatchObject({value:next,version:original.version+1});
 }finally{
  const current=await page.request.get(`${API}/admin/settings`,{headers:await headers(page)});const setting=(await current.json()).find((s:any)=>s.key===key);
  if(setting.value!==original.value){const restored=await page.request.patch(`${API}/admin/settings/${key}`,{headers:await headers(page),data:{value:original.value,version:setting.version,reason:'Restore fictional browser policy'}});expect(restored.ok()).toBeTruthy();}
 }
});
