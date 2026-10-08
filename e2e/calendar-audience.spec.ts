import {test,expect} from '@playwright/test';
import {API,login,headers} from './helpers/auth';
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
