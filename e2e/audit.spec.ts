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
 const context=await browser.newContext();
 try{
  const reviewer=await context.newPage();await login(reviewer,'9800000002');
  const denied=await reviewer.request.get(`${API}/audit/integrity`,{headers:await headers(reviewer)});expect(denied.status()).toBe(403);
 }finally{await context.close();}
});
