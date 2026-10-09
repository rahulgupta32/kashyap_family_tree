import {test,expect} from '@playwright/test';
import {API,login,headers} from './helpers/auth';
test('late recurring reminder rows do not move the event creation control',async({page})=>{
 await login(page);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/calendar/recurrences*',async route=>{
  await gate;
  const items=Array.from({length:12},(_,i)=>({id:`fictional-layout-${i}`,source_ref:`Fictional layout evidence ${i}`,source_date:'2020-01-01',local_time:'09:00',leap_policy:'SKIP_YEAR',state:'WITHDRAWN',version:1,source_event_id:'fictional-source',source_version:1}));
  await route.fulfill({json:{items,nextAfter:null}});
 });
 try{
  await page.goto('/calendar');const create=page.getByRole('button',{name:/Create Event/});await expect(create).toBeEnabled();
  const before=await create.boundingBox();expect(before).not.toBeNull();
  release();await expect(page.getByRole('region',{name:'Annual recurring reminders'})).toContainText('Fictional layout evidence 11');
  const after=await create.boundingBox();expect(after).not.toBeNull();expect(Math.abs(after!.y-before!.y)).toBeLessThan(1);
  await create.click();const dialog=page.getByRole('dialog',{name:'Create event',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional stable calendar creation');
  await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toHaveValue('Fictional stable calendar creation');
 }finally{release();await page.unroute('**/calendar/recurrences*');}
});
test('calendar creation waits for restored session before opening the private form',async({page})=>{
 await login(page);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let entered!:()=>void;
 const restoring=new Promise<void>(resolve=>{entered=resolve;});
 await page.route('**/auth/refresh',async route=>{entered();await gate;await route.continue();});
 try{
  await page.goto('/calendar');await restoring;
  const create=page.getByRole('button',{name:/Create Event/});
  await expect(create).toBeDisabled();
  await expect(page.getByRole('dialog',{name:'Create event',exact:true})).toHaveCount(0);
  release();await expect(create).toBeEnabled();await create.click();
  const dialog=page.getByRole('dialog',{name:'Create event',exact:true});
  await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional restored-session event');
  await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toHaveValue('Fictional restored-session event');
  await page.unroute('**/auth/refresh');
  await page.evaluate(async()=>{await (window as any).__kashyap_refreshSession();});
  await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toHaveValue('Fictional restored-session event');
 }finally{release();await page.unroute('**/auth/refresh');}
});
test('organizer previews a generation, invalidates changed criteria and creates an auditable invitation audience',async({page})=>{
 await login(page);
 const profileResponse=await page.request.get(`${API}/profile/me`,{headers:await headers(page)});expect(profileResponse.ok()).toBeTruthy();const profile=await profileResponse.json();
 expect(profile.person.branchId).toBeTruthy();
 await page.goto('/calendar');await page.getByRole('button',{name:/Create Event/}).click();const create=page.getByRole('dialog',{name:'Create event',exact:true});
 const title='Fictional audience browser '+Date.now();await create.getByPlaceholder('उदा: कुल पूजा २०८३').fill(title);
 await create.getByRole('combobox',{name:/Date source/}).selectOption('AD');await create.getByLabel(/Gregorian date and time/).fill(new Date(Date.now()+86400000*5).toISOString().slice(0,16));
 // Restrict event visibility separately from the recipient-selection criterion.
 const visibility=create.locator('select').filter({has:page.locator('option[value="PRIVATE"]')});await visibility.selectOption('PRIVATE');
 await create.getByLabel('Invitee selection method',{exact:true}).selectOption('GENERATION');
 await create.getByLabel('Invitation branch',{exact:true}).selectOption(profile.person.branchId);await create.getByLabel('Invitation generation',{exact:true}).fill(String(profile.person.generation));
 await create.getByRole('button',{name:/Preview invitations/}).click();const roster=create.getByRole('region',{name:'Genealogy recipient preview'});await expect(roster).toContainText('Recipient accounts');
 await create.getByLabel('Invitation generation',{exact:true}).fill('100');await expect(roster).toHaveCount(0);await expect(create.getByRole('button',{name:/Confirm and save/})).toHaveCount(0);
 await create.getByLabel('Invitation generation',{exact:true}).fill(String(profile.person.generation));
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/calendar/events/preview')&&r.request().method()==='POST');
 await create.getByRole('button',{name:/Preview invitations/}).click();const preview=await(await responsePromise).json();expect(preview.recipientCount).toBeGreaterThan(0);await expect(roster).toContainText('Recipient accounts');
 await create.getByRole('button',{name:/Confirm and save/}).click();await expect(page.getByRole('article',{name:title,exact:true})).toBeVisible();
 const events=await page.request.get(`${API}/calendar/events`,{headers:await headers(page)});const event=(await events.json()).find((e:any)=>e.title===title);
 expect(event.invitedUserIds.sort()).toEqual(preview.recipients.map((r:any)=>r.userId).sort());
 const history=await page.request.get(`${API}/calendar/events/${event.id}/history`,{headers:await headers(page)});expect(history.ok()).toBeTruthy();const revisions=await history.json();
 expect(revisions[0].audienceEvidence.previewId).toBe(preview.previewId);expect(revisions[0].audienceEvidence.basis.selection).toEqual({type:'GENERATION',branchId:profile.person.branchId,generation:profile.person.generation});
});
