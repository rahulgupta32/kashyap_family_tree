import { test, expect } from '@playwright/test';
import { login, headers, API } from './helpers/auth';

test('an older real event-list response cannot erase a newly created gathering', async ({ page }) => {
  await login(page);await page.goto('/calendar');
  const createButton=page.getByRole('button',{name:/Create Event/i});await expect(createButton).toBeEnabled();
  await expect(page.getByText('कार्यक्रमहरू लोड हुँदैछन्...', {exact:true})).toHaveCount(0);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  let entered!:()=>void;const captured=new Promise<void>(resolve=>{entered=resolve;});
  let held=false,capturedToken='';const eventList=(url:URL)=>url.pathname==='/calendar/events';
  await page.route(eventList,async route=>{
    if(route.request().method()!=='GET'||held){await route.continue();return;}
    held=true;capturedToken=route.request().headers().authorization;
    const snapshot=await route.fetch();expect(snapshot.ok()).toBeTruthy();entered();await gate;
    await route.fulfill({response:snapshot});
  });
  try {
    await page.evaluate(async()=>{localStorage.setItem('kashyap_token_refreshed_at','0');await (window as any).__kashyap_refreshSession();});await captured;
    const tokenBefore=await headers(page);
    expect(capturedToken).toBe(tokenBefore.Authorization);
    await createButton.click();const create=page.getByRole('dialog',{name:'Create event',exact:true});
    const title=`Fictional list ordering ${Date.now()}`;
    await create.getByPlaceholder('उदा: कुल पूजा २०८३').fill(title);
    await create.getByRole('combobox',{name:/Date source/}).selectOption('AD');
    await create.getByLabel(/Gregorian date and time/).fill(new Date(Date.now()+86400000*3).toISOString().slice(0,16));
    await create.getByRole('button',{name:'सिर्जना गर्नुहोस् (Save)',exact:true}).click();
    const card=page.getByRole('article',{name:title,exact:true});await expect(card).toBeVisible();
    expect(await headers(page)).toEqual(tokenBefore);
    const delayed=page.waitForResponse(r=>new URL(r.url()).pathname==='/calendar/events'&&r.request().method()==='GET');
    release();await (await delayed).finished();
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(card).toBeVisible();
    const persisted=await page.request.get(`${API}/calendar/events`,{headers:await headers(page)});expect(persisted.ok()).toBeTruthy();
    expect((await persisted.json()).filter((e:any)=>e.title===title)).toHaveLength(1);
  } finally {release();await page.unroute(eventList);}
});

test('organizer creates an AD gathering, edits its revision and cancels RSVP', async ({ page }) => {
  await login(page);
  await page.goto('/calendar');
  await page.getByRole('button', { name: /Create Event/i }).click();
  const create = page.getByRole('dialog', { name: 'Create event', exact: true });
  const title = `Fictional calendar acceptance ${Date.now()}`;
  await create.getByPlaceholder('उदा: कुल पूजा २०८३').fill(title);
  await create.getByRole('combobox', { name: /Date source/ }).selectOption('AD');
  const start = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 16);
  await create.getByLabel(/Gregorian date and time/).fill(start);
  await create.getByLabel(/One hour before/).check();
  await create.getByRole('button', { name: 'सिर्जना गर्नुहोस् (Save)', exact: true }).click();
  let card = page.getByRole('article', { name: title, exact: true });
  await expect(card).toBeVisible();
  const response = await page.request.get(`${API}/calendar/events`, { headers: await headers(page) });
  expect(response.ok()).toBeTruthy();
  const event = (await response.json()).find((e: any) => e.title === title);
  expect(event.reminderOffsets).toEqual([60]);
  expect(event.version).toBe(1);
  await card.getByRole('button', { name: /Edit event/ }).click();
  const edit = page.getByRole('dialog', { name: /Edit event/ });
  await edit.getByLabel('Event title', { exact: true }).fill(`${title} updated`);
  await edit.getByRole('button', { name: /Save changes/ }).click();
  card = page.getByRole('article', { name: `${title} updated`, exact: true });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Edit event/ }).click();
  await expect(edit.getByText(/Revisions: 2, 1/)).toBeVisible();
  await edit.getByLabel(/Cancellation reason/).fill('Fictional organizer cancellation');
  await edit.getByRole('button', { name: /Cancel event/ }).click();
  await expect(card.getByRole('status')).toContainText('Cancelled');
  await expect(card.getByRole('button', { name: /Going/ })).toBeDisabled();
  await page.getByText('सबै कार्यक्रम हेर्नुहोस् (Browse all calendar events)',{exact:true}).click();
  const browse=page.getByRole('region',{name:'Browse all calendar events',exact:true});
  await browse.getByRole('button',{name:'Latest calendar events'}).click();
  await expect(browse).toContainText(`${title} updated`);
  await expect(browse).toContainText('CANCELLED');
  await browse.getByLabel('Browse BS year',{exact:true}).fill('2000');
  await browse.getByRole('button',{name:'Apply calendar filters'}).click();
  await expect(browse).not.toContainText(`${title} updated`);

  const period=page.getByRole('region',{name:'Calendar day month agenda',exact:true});
  const nepalDate=new Date(new Date(`${start}:00Z`).getTime()+345*60000).toISOString().slice(0,10);
  await period.getByLabel('Calendar source date',{exact:true}).fill(nepalDate);
  await period.getByRole('button',{name:'Show calendar period'}).click();
  await expect(period).toContainText(`${title} updated`);
  await period.getByRole('button',{name:new RegExp(`Open calendar day ${nepalDate},`)}).click();
  await expect(period).toContainText('AD · DAY');
  await expect(period).toContainText(`${title} updated`);
  await period.getByLabel('Calendar view mode',{exact:true}).selectOption('AGENDA');
  await period.getByRole('button',{name:'Show calendar period'}).click();
  await expect(period).toContainText('AD · AGENDA');
  await expect(period).toContainText(`${title} updated`);

});
