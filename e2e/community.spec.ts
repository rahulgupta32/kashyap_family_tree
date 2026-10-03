import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, login, headers } from './helpers/auth';

test('Community publication, likes, comments and reports persist through authenticated browser workflows',async({page,browser})=>{
 test.setTimeout(120000);
 const reviewerContext=await browser.newContext();
 try {
  await login(page,'9800000002');await page.goto('/community');
  const title=`Fictional community ${randomUUID()}`;
  await page.getByLabel('शीर्षक (Title)',{exact:true}).fill(title);
  await page.getByLabel('सन्देश (Message)',{exact:true}).fill('Fictional family gathering discussion for browser acceptance.');
  const branchResponse=await page.request.get(`${API}/genealogy/branches`);expect(branchResponse.ok()).toBeTruthy();
  const branch=(await branchResponse.json()).find((b:any)=>b.code==='KASKI');
  await page.getByLabel('दायरा (Audience)').selectOption(branch.id);
  await page.getByRole('button',{name:/Submit for review/}).click();
  await expect(page.getByRole('status')).toContainText('Submitted for independent moderation');
  const authorCard=page.getByRole('article',{name:title});await expect(authorCard).toContainText('PENDING');
  await expect(authorCard.getByRole('button',{name:/Review/})).toHaveCount(0);
  const reviewer=await reviewerContext.newPage();await login(reviewer);await reviewer.goto('/community');
  await reviewer.getByRole('button',{name:/Moderation queue/}).click();
  const reviewCard=reviewer.getByRole('article',{name:title});await reviewCard.getByRole('button',{name:/Review/}).click();
  await reviewer.getByRole('dialog').getByLabel(/Reason \/ notes/).fill('Independent fictional content review approved.');
  await reviewer.getByRole('dialog').getByRole('button',{name:/Publish/}).click();
  await expect(reviewer.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(authorCard).toContainText('PUBLISHED');
  await authorCard.getByRole('button',{name:/Like/}).click();
  await expect(authorCard.getByRole('button',{name:/Like/})).toHaveAttribute('aria-pressed','true');
  await authorCard.getByRole('button',{name:/Comments/}).click();
  await authorCard.getByLabel(/Your comment/).fill('Persist this fictional reply.');
  await authorCard.getByRole('button',{name:/Send comment/}).click();
  await expect(authorCard.getByText('Persist this fictional reply.',{exact:true})).toBeVisible();
  await page.reload();await expect(authorCard.getByRole('button',{name:/Like/})).toHaveAttribute('aria-pressed','true');
  const posts=await page.request.get(`${API}/community/posts`,{headers:await headers(page)});expect(posts.ok()).toBeTruthy();
  const post=(await posts.json()).find((p:any)=>p.title===title);expect(post.likesCount).toBe(1);expect(post.commentsCount).toBe(1);
  await reviewer.getByRole('button',{name:/Feed/}).click();
  await reviewCard.getByRole('button',{name:/Report/}).click();
  await reviewer.getByRole('dialog').getByLabel(/Reason \/ notes/).fill('Fictional report for a second moderation review.');
  await reviewer.getByRole('dialog').getByRole('button',{name:/Submit report/}).click();
  await expect(reviewer.getByRole('dialog')).toHaveCount(0);
  await page.reload();await expect(authorCard).toContainText('PENDING');
  await expect(authorCard.getByRole('button',{name:/Like/})).toHaveCount(0);
 } finally {await reviewerContext.close();}
});
