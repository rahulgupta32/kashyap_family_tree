import {test,expect} from '@playwright/test';
import {login,headers,API} from './helpers/auth';
test('global administrator resumes media inventory across reload and inspects bounded findings',async({page})=>{
 test.setTimeout(120000);await login(page);await page.goto('/media-operations');await expect(page.getByRole('heading',{name:'मिडिया सञ्चालन / Media operations',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'नयाँ जाँच / Start inventory',exact:true}).click();await expect(page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true}).click();await page.reload();await page.getByRole('button',{name:/RUNNING ·/}).click();
 for(let i=0;i<40;i++){
  const advance=page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true});if(await advance.count()===0)break;
  const response=page.waitForResponse(r=>r.url().endsWith('/advance')&&r.request().method()==='POST');const refreshed=page.waitForResponse(r=>/media-operations\/inventories\/[a-f0-9-]{36}\?after=0$/.test(r.url())&&r.request().method()==='GET');await advance.click();expect((await response).ok()).toBeTruthy();const state=await (await refreshed).json();await expect(page.getByRole('heading',{name:`${state.run.status} · ${state.run.phase}`,exact:true})).toBeVisible();if(state.run.status==='RUNNING')await expect(advance).toBeEnabled();
 }
 await expect(page.getByRole('heading',{name:'COMPLETE · COMPLETE',exact:true})).toBeVisible();await expect(page.getByRole('table')).toBeVisible();
 const response=await page.request.get(`${API}/media-operations/inventories`,{headers:await headers(page)});expect(response.ok()).toBeTruthy();const runs=await response.json();const report=await page.request.get(`${API}/media-operations/inventories/${runs[0].id}`,{headers:await headers(page)});expect(report.ok()).toBeTruthy();const data=await report.json();expect(data.items.length).toBeLessThanOrEqual(50);expect(JSON.stringify(data)).not.toContain('storage_path');expect(JSON.stringify(data)).not.toContain('observed_location');
 expect((await page.request.get(`${API}/media-operations/inventories`)).status()).toBe(401);
 await page.getByRole('button',{name:'नयाँ जाँच / Start inventory',exact:true}).click();await page.getByRole('button',{name:'जाँच रोक्नुहोस् / Cancel inventory',exact:true}).click();await expect(page.getByRole('heading',{name:'CANCELLED · ASSETS',exact:true})).toBeVisible();
});
