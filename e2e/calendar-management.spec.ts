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
  await edit.getByLabel('Event details',{exact:true}).fill('  Fictional updated agenda  ');
  await edit.getByLabel('Event venue',{exact:true}).fill('  Fictional updated venue  ');
  await expect(edit.getByLabel('Event start · Nepal UTC+05:45',{exact:true})).toHaveValue(start);
  const moved=new Date(Date.now()+86400000*4).toISOString().slice(0,10)+'T00:10';
  await edit.getByLabel('Event start · Nepal UTC+05:45',{exact:true}).fill(moved);
  await edit.getByRole('button', { name: /Save changes/ }).click();
  card = page.getByRole('article', { name: `${title} updated`, exact: true });
  await expect(card).toBeVisible();
  const changed=await page.request.get(`${API}/calendar/events/${event.id}`,{headers:await headers(page)});expect(changed.ok()).toBeTruthy();
  const updated=await changed.json();expect(updated.startsAt).toBe(new Date(new Date(moved+'Z').getTime()-345*60000).toISOString());expect(updated.audienceScope).toBe(event.audienceScope);expect(updated.reminderOffsets).toEqual([60]);expect(updated.version).toBe(2);expect(updated.description).toBe('Fictional updated agenda');expect(updated.location).toBe('Fictional updated venue');
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


test('ordinary admin edit validates bounds and retains uncertain intent until explicit reload',async({page})=>{
  await login(page);
  let current:any={id:'11111111-1111-4111-8111-111111111111',title:'Fictional edit recovery',description:'Server details',location:'Server venue',eventType:'GENERAL_EVENT',audienceScope:'INVITED_ONLY',canManage:true,version:4,lifecycleState:'ACTIVE',startsAt:'2030-01-02T04:15:23.456Z',reminderOffsets:[60]};
  const patches:any[]=[];
  await page.route(url=>url.pathname.startsWith('/calendar/events'),async route=>{
    const request=route.request();
    if(request.method()==='PATCH'){
      patches.push(request.postDataJSON());
      if(patches.length===1){current={...current,version:5,title:'Server resolved event',description:'Resolved details'};await route.fulfill({status:503,json:{message:'Private raw diagnostic'}});}
      else{current={...current,...patches.at(-1),version:6};await route.fulfill({json:current});}
    }else if(request.url().endsWith('/history')){await route.fulfill({json:[]});}
    else if(request.method()==='GET'){await route.fulfill({json:[current]});}
    else{await route.continue();}
  });
  await page.goto('/calendar');
  await page.getByRole('article',{name:current.title,exact:true}).getByRole('button',{name:/Edit event/}).click();
  let dialog=page.getByRole('dialog',{name:/Edit event/});
  await dialog.getByLabel('Event details',{exact:true}).fill('x'.repeat(10001));
  await dialog.getByRole('button',{name:/Save changes/}).click();
  await expect(page.getByText(/Title 1–255; details up to 10000/)).toBeVisible();expect(patches).toHaveLength(0);
  await dialog.getByLabel('Event details',{exact:true}).fill('Private unresolved draft');
  await dialog.getByRole('button',{name:/Save changes/}).click();
  await expect(dialog.getByRole('button',{name:/Save changes/})).toBeDisabled();
  await expect(dialog.getByLabel('Event details',{exact:true})).toHaveValue('Private unresolved draft');
  await expect(page.getByText('Private raw diagnostic',{exact:true})).toHaveCount(0);
  expect(patches[0]).toEqual({version:4,title:'Fictional edit recovery',description:'Private unresolved draft',location:'Server venue'});
  await dialog.getByRole('button',{name:/Close and reload events/}).click();
  await page.getByRole('article',{name:'Server resolved event',exact:true}).getByRole('button',{name:/Edit event/}).click();
  dialog=page.getByRole('dialog',{name:/Edit event/});
  await expect(dialog.getByLabel('Event details',{exact:true})).toHaveValue('Resolved details');
  await dialog.getByLabel('Event details',{exact:true}).fill('');await dialog.getByLabel('Event venue',{exact:true}).fill('');
  await dialog.getByRole('button',{name:/Save changes/}).click();await expect(dialog).toHaveCount(0);
  expect(patches).toHaveLength(2);expect(patches[1]).toEqual({version:5,title:'Server resolved event',description:'',location:''});
});
