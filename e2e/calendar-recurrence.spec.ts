import { test, expect } from '@playwright/test';
import { login, headers, API } from './helpers/auth';
test('owner proposes explicit Gregorian recurrence, previews leap policy and withdraws consent after reload',async({page})=>{
 await login(page);const title=`Fictional annual recurrence ${Date.now()}`;
 const response=await page.request.post(`${API}/calendar/events`,{headers:await headers(page),data:{title,eventType:'GENERAL_EVENT',audienceScope:'PRIVATE',startsAt:'2020-02-29T03:15:00Z'}});expect(response.ok()).toBeTruthy();
 const source=await response.json();await page.goto('/calendar');const panel=page.getByRole('region',{name:'Annual recurring reminders'});
 await panel.getByLabel(/Source event/).selectOption(source.id);await panel.getByLabel(/Leap-day policy/).selectOption('MARCH_01');const reference=`Fictional browser evidence ${Date.now()}`;
 await panel.getByLabel(/Date evidence reference/).fill(reference);await panel.getByLabel(/I consent to private annual reminders/).check();await panel.getByRole('button',{name:/Propose for approval/}).click();
 let row=panel.getByRole('listitem').filter({hasText:reference});await expect(row).toContainText('PENDING');await row.getByRole('button',{name:/Preview next year/}).click();await expect(panel.getByRole('status')).toContainText('Delivery blocked');
 await page.reload();row=page.getByRole('region',{name:'Annual recurring reminders'}).getByRole('listitem').filter({hasText:reference});await expect(row).toContainText('MARCH_01');
 await panel.getByLabel(/Review or withdrawal reason/).fill('Fictional browser consent withdrawal');await row.getByRole('button',{name:/Withdraw/}).click();await expect(row).toContainText('WITHDRAWN');await expect(row.getByRole('button',{name:/Withdraw/})).toHaveCount(0);
});
