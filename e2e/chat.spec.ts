import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, login, headers } from './helpers/auth';

test('Branch messaging authenticates both browsers and persists messages, read receipts and deletion',async({page,browser})=>{
 test.setTimeout(120000);
 const otherContext=await browser.newContext();
 try{
  await login(page,'9800000002');await page.goto('/chat');
  const branches=await page.request.get(`${API}/genealogy/branches`);expect(branches.ok()).toBeTruthy();
  const branch=(await branches.json()).find((b:any)=>b.code==='KASKI');
  const title=`Fictional branch conversation ${randomUUID()}`;
  await page.getByLabel('शाखा (Branch)',{exact:true}).selectOption(branch.id);
  await page.getByLabel('समूह शीर्षक (Group title)',{exact:true}).fill(title);
  await page.getByRole('button',{name:'Create branch group',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const current=await page.request.get(`${API}/chat/conversations`,{headers:await headers(page)});expect(current.ok()).toBeTruthy();
  const group=(await current.json()).find((c:any)=>c.type==='FAMILY_BRANCH'&&c.branchId===branch.id);expect(group).toBeTruthy();
  const reader=await otherContext.newPage();await login(reader);await reader.goto('/chat');
  // Global reviewer deliberately joins via the same authenticated endpoint used by the UI.
  const joined=await reader.request.post(`${API}/chat/conversations/${group.id}/join`,{headers:await headers(reader)});expect(joined.ok()).toBeTruthy();
  await reader.getByRole('button',{name:'Refresh conversations',exact:true}).click();
  await reader.getByRole('button',{name:new RegExp(group.title)}).click();await expect(reader.getByRole('status')).toHaveText('Live');
  const content=`Persistent fictional message ${randomUUID()}`;
  await page.getByLabel('सन्देश (Your message)',{exact:true}).fill(content);
  await page.getByRole('button',{name:'पठाउनुहोस् (Send)',exact:true}).click();
  await expect(reader.getByRole('list',{name:'Message history'})).toContainText(content);
  const own=page.getByRole('listitem').filter({hasText:content});await expect(own).toContainText('Read');
  await reader.reload();await reader.getByRole('button',{name:new RegExp(group.title)}).click();
  await expect(reader.getByRole('list',{name:'Message history'})).toContainText(content);
  const records=await reader.request.get(`${API}/chat/conversations/${group.id}/messages`,{headers:await headers(reader)});expect(records.ok()).toBeTruthy();expect((await records.json()).filter((m:any)=>m.content===content)).toHaveLength(1);
  await own.getByRole('button',{name:'Remove message',exact:true}).click();await expect(reader.getByRole('list',{name:'Message history'})).not.toContainText(content);await expect(reader.getByText('Message removed',{exact:true})).toBeVisible();
 }finally{await otherContext.close();}
});
