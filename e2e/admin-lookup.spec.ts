import {test,expect} from '@playwright/test';
import {API,login,headers} from './helpers/auth';
test('Administrative exact lookup finds accounts and clears old results on missing IDs',async({page})=>{
 await login(page);const me=await page.request.get(`${API}/auth/me`,{headers:await headers(page)});expect(me.ok()).toBeTruthy();const account=await me.json();
 await page.goto('/lookup');await page.getByLabel('अभिलेख प्रकार (Record type)').selectOption('USER');await page.getByLabel('अभिलेख ID (Record ID)').fill(account.id);
 await page.getByRole('button',{name:/Find exact ID/}).click();const result=page.getByRole('region',{name:'Exact lookup result'});await expect(result).toContainText(account.id);await expect(result).toContainText('SUPER ADMIN');await expect(result).not.toContainText(account.phoneNumber);
 await page.getByLabel('अभिलेख ID (Record ID)').fill('00000000-0000-4000-8000-000000000001');await expect(result).toHaveCount(0);await page.getByRole('button',{name:/Find exact ID/}).click();await expect(page.getByRole('alert')).toContainText('Record not found');await expect(result).toHaveCount(0);
});
