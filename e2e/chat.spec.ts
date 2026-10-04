import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, login, headers } from './helpers/auth';

test('Branch messaging authenticates both browsers and persists messages, separate delivery/read receipts and deletion',async({page,browser})=>{
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
  // Wait for session restoration before using the current access token.
  await expect(reader.getByRole('heading',{name:'सन्देश (Messages)',exact:true})).toBeVisible();
  // Global reviewer deliberately joins via the same authenticated endpoint used by the UI.
  const joined=await reader.request.post(`${API}/chat/conversations/${group.id}/join`,{headers:await headers(reader)});expect(joined.ok(),await joined.text()).toBeTruthy();
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
  // A hidden browser receives records and acknowledges delivery but does not
  // acknowledge reading until it becomes visible. Simulate lifecycle deterministically.
  await reader.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
  const deliveredContent=`Delivery before read ${randomUUID()}`;
  await page.getByLabel('सन्देश (Your message)',{exact:true}).fill(deliveredContent);
  await page.getByRole('button',{name:'पठाउनुहोस् (Send)',exact:true}).click();
  await expect(reader.getByRole('list',{name:'Message history'})).toContainText(deliveredContent);
  const delivered=page.getByRole('listitem').filter({hasText:deliveredContent});
  await expect(delivered).toContainText('Delivered');await expect(delivered).not.toContainText('(Read)');
  const unread=await reader.request.get(`${API}/chat/conversations`,{headers:await headers(reader)});
  expect((await unread.json()).find((c:any)=>c.id===group.id).unreadCount).toBeGreaterThan(0);
  await reader.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(delivered).toContainText('(Read)');
  const reported=reader.getByRole('listitem').filter({hasText:content});
  await reported.getByRole('button',{name:'उजुरी (Report message)',exact:true}).click();
  await reader.getByLabel('उजुरीको कारण (Report reason)',{exact:true}).fill('Fictional report for acceptance');
  await reader.getByRole('button',{name:'पठाउनुहोस् (Submit report)',exact:true}).click();
  await expect(reader.getByText('उजुरी पठाइयो (Report submitted)',{exact:true})).toBeVisible();
  await reader.getByRole('button',{name:'सन्देश उजुरी समीक्षा (Review message reports)',exact:true}).click();
  const review=reader.locator('article').filter({hasText:content});await expect(review).toContainText('Fictional report for acceptance');
  await review.getByRole('button',{name:'समीक्षा (Review)',exact:true}).click();
  await reader.getByLabel('समीक्षा टिप्पणी (Review note)',{exact:true}).fill('Independent reviewer required');
  await reader.getByRole('button',{name:'खारेज (Dismiss report)',exact:true}).click();
  await expect(reader.getByRole('alert')).toContainText('Another moderator must review your report');
  await own.getByRole('button',{name:'Remove message',exact:true}).click();await expect(reader.getByRole('list',{name:'Message history'})).not.toContainText(content);await expect(reader.getByText('Message removed',{exact:true})).toBeVisible();
 }finally{await otherContext.close();}
});
