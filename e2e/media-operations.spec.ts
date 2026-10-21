import {test,expect} from '@playwright/test';
import {login,headers,API} from './helpers/auth';
test('global administrator resumes media inventory across reload and inspects bounded findings',async({page})=>{
 test.setTimeout(120000);await login(page);await page.goto('/media-operations');await expect(page.getByRole('heading',{name:'मिडिया सञ्चालन / Media operations',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'नयाँ जाँच / Start inventory',exact:true}).click();await expect(page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true}).click();await page.reload();await page.getByRole('button',{name:/RUNNING ·/}).click();await expect(page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true})).toBeVisible();
 for(let i=0;i<40;i++){
  const advance=page.getByRole('button',{name:'अर्को चरण जाँच / Scan next batch',exact:true});if(await advance.count()===0)break;
  const response=page.waitForResponse(r=>r.url().endsWith('/advance')&&r.request().method()==='POST');const refreshed=page.waitForResponse(r=>/media-operations\/inventories\/[a-f0-9-]{36}\?after=0$/.test(r.url())&&r.request().method()==='GET');await advance.click();expect((await response).ok()).toBeTruthy();const state=await (await refreshed).json();await expect(page.getByRole('heading',{name:`${state.run.status} · ${state.run.phase}`,exact:true})).toBeVisible();if(state.run.status==='RUNNING')await expect(advance).toBeEnabled();
 }
 await expect(page.getByRole('heading',{name:'COMPLETE · COMPLETE',exact:true})).toBeVisible();await expect(page.getByRole('table')).toBeVisible();
 const response=await page.request.get(`${API}/media-operations/inventories`,{headers:await headers(page)});expect(response.ok()).toBeTruthy();const runs=await response.json();const report=await page.request.get(`${API}/media-operations/inventories/${runs[0].id}`,{headers:await headers(page)});expect(report.ok()).toBeTruthy();const data=await report.json();expect(data.items.length).toBeLessThanOrEqual(50);expect(JSON.stringify(data)).not.toContain('storage_path');expect(JSON.stringify(data)).not.toContain('observed_location');
 expect((await page.request.get(`${API}/media-operations/inventories`)).status()).toBe(401);
 await page.getByRole('button',{name:'नयाँ जाँच / Start inventory',exact:true}).click();await page.getByRole('button',{name:'जाँच रोक्नुहोस् / Cancel inventory',exact:true}).click();await expect(page.getByRole('heading',{name:'CANCELLED · ASSETS',exact:true})).toBeVisible();
});

test('administrator reviews an expired upload and submits a reason before approving cleanup',async({page})=>{
 await login(page);const run={id:'3c9f48b4-0289-4b24-918a-397319819112',status:'COMPLETE',phase:'COMPLETE',created_at:'2026-10-01T00:00:00Z'};let approved=false;
 await page.route(`${API}/media-operations/inventories**`,async route=>{
  const req=route.request();if(req.method()==='POST'&&req.url().endsWith('/orphan-cleanup')){expect(req.postDataJSON()).toEqual({itemIds:['21'],reason:'Reviewed abandoned upload'});approved=true;await route.fulfill({json:{scheduled:1}});return;}
  await route.fulfill({json:req.url().includes(run.id)?{run,summary:[{finding:'ABANDONED_UPLOAD_REVIEW',count:1}],items:[{id:'21',asset_id:null,item_key:'a'.repeat(64),bucket:'private-profiles',finding:'ABANDONED_UPLOAD_REVIEW',upload_state:approved?'ABANDONED':'STORED',expected_bytes:'75',expected_type:'image/png',expected_checksum:'b'.repeat(64),cleanup_status:approved?'PENDING':null}],next:null}:[run]});
 });
 await page.goto('/media-operations');await page.getByRole('button',{name:/COMPLETE · COMPLETE ·/}).click();await page.getByRole('checkbox',{name:'Select finding 21',exact:true}).check();
 const approve=page.getByRole('button',{name:'सफाइ स्वीकृत गर्नुहोस् / Approve orphan cleanup',exact:true});await expect(approve).toBeDisabled();await page.getByRole('textbox',{name:'Review reason',exact:true}).fill('Reviewed abandoned upload');await expect(approve).toBeEnabled();
 page.once('dialog',dialog=>dialog.accept());await approve.click();await expect(page.getByRole('status')).toHaveText('Scheduled: 1');await expect(page.getByRole('cell',{name:/PENDING/})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Select finding 21',exact:true})).toHaveCount(0);expect(approved).toBe(true);
});

test('administrator approves verified legacy migration and sees pending status',async({page})=>{
 await login(page);const run={id:'4c9f48b4-0289-4b24-918a-397319819112',status:'COMPLETE',phase:'COMPLETE',created_at:'2026-10-04T00:00:00Z'};let approved=false;
 await page.route(`${API}/media-operations/inventories**`,async route=>{
  const req=route.request();if(req.method()==='POST'&&req.url().endsWith('/legacy-migration')){expect(req.postDataJSON()).toEqual({itemIds:['31'],reason:'Verified legacy copy review'});approved=true;await route.fulfill({json:{scheduled:1}});return;}
  await route.fulfill({json:req.url().includes(run.id)?{run,summary:[{finding:'LEGACY_MIGRATION_REVIEW',count:1}],items:[{id:'31',asset_id:'4c9f48b4-0289-4b24-918a-397319819113',item_key:'c'.repeat(64),bucket:'private-profiles',finding:'LEGACY_MIGRATION_REVIEW',expected_bytes:'75',expected_type:'image/png',expected_checksum:'d'.repeat(64),migration_status:approved?'PENDING':null}],next:null}:[run]});
 });
 await page.goto('/media-operations');await page.getByRole('button',{name:/COMPLETE · COMPLETE ·/}).click();await page.getByRole('checkbox',{name:'Select finding 31',exact:true}).check();const approve=page.getByRole('button',{name:'स्थानान्तरण स्वीकृत गर्नुहोस् / Approve legacy migration',exact:true});await expect(approve).toBeDisabled();await page.getByRole('textbox',{name:'Review reason',exact:true}).fill('Verified legacy copy review');page.once('dialog',async dialog=>{expect(dialog.message()).toContain('Original local files will be retained');await dialog.accept();});await approve.click();await expect(page.getByRole('status')).toHaveText('Scheduled: 1');await expect(page.getByRole('cell',{name:/PENDING/})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Select finding 31',exact:true})).toHaveCount(0);expect(approved).toBe(true);
});
