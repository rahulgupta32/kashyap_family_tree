import {test,expect} from '@playwright/test';
import {login,API} from './helpers/auth';

const pendingKey='kashyap_calendar_pending_create';
const open=async(page:any)=>{await page.getByRole('button',{name:/Create Event/}).click();return page.getByRole('dialog',{name:'Create event',exact:true});};

test('admin retries one immutable payload/key through token rotation without storing private content',async({page})=>{
 await login(page);await page.goto('/calendar');
 const bodies:any[]=[];
 await page.route('**/calendar/events',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  const body=route.request().postDataJSON();bodies.push(body);
  const saved=await page.evaluate(key=>sessionStorage.getItem(key),pendingKey);expect(saved).toBeTruthy();
  const record=JSON.parse(saved!);expect(record.creationKey).toBe(body.creationKey);expect(record).not.toHaveProperty('payload');expect(saved).not.toContain(body.title);
  await route.fulfill({status:bodies.length===1?503:201,json:bodies.length===1?{message:'unavailable'}:{id:'fictional-event'}});
 });
 let dialog=await open(page);await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional private retry title');
 await dialog.getByRole('button',{name:/\(Save\)/}).click();await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toBeDisabled();
 await page.evaluate(async()=>{localStorage.setItem('kashyap_token_refreshed_at','0');await (window as any).__kashyap_refreshSession();});
 await dialog.getByRole('button',{name:/Retry creation/}).click();await expect(dialog).toHaveCount(0);
 expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);expect(bodies[0].creationKey).toMatch(/^[a-f0-9-]{36}$/);
 expect(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey)).toBeNull();
 dialog=await open(page);await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional next event');await dialog.getByRole('button',{name:/\(Save\)/}).click();await expect(dialog).toHaveCount(0);
 expect(bodies[2].creationKey).not.toBe(bodies[0].creationKey);
});

test('reload preserves only account/server/key metadata and explicit resolution gates new creation',async({page})=>{
 await login(page);await page.goto('/calendar');let creates=0,resolutions=0,original:any;
 await page.route('**/calendar/events',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  creates++;original=route.request().postDataJSON();await route.fulfill({status:503,json:{message:'unavailable'}});
 });
 let dialog=await open(page);await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Private draft must not persist');await dialog.getByRole('button',{name:/\(Save\)/}).click();await expect(dialog.getByRole('button',{name:/Retry creation/})).toBeEnabled();
 await page.reload();dialog=await open(page);await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toHaveValue('');await expect(dialog.getByRole('button',{name:/Retry creation/})).toBeDisabled();
 await page.route('**/calendar/events/creation-resolution',async route=>{
  expect(route.request().postDataJSON()).toEqual({creationKey:original.creationKey});resolutions++;
  await route.fulfill({status:resolutions===1?503:201,json:resolutions===1?{message:'unavailable'}:{outcome:'ABANDONED'}});
 });
 await dialog.getByRole('button',{name:/Recover or close pending creation/}).click();await expect(dialog).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey)).toBeTruthy();
 await dialog.getByRole('button',{name:/Recover or close pending creation/}).click();await expect(dialog).toHaveCount(0);expect(creates).toBe(1);expect(resolutions).toBe(2);expect(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey)).toBeNull();
 dialog=await open(page);await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toBeEnabled();
});

test('pending metadata from another account or API cannot populate or block a fresh form',async({page})=>{
 await login(page);
 const owner=await page.evaluate(()=>JSON.parse(localStorage.getItem('kashyap_admin_user')!).id);
 for(const mismatch of ['owner','server']){
  await page.evaluate(({key,owner,mismatch,server})=>sessionStorage.setItem(key,JSON.stringify({owner:mismatch==='owner'?'another-account':owner,server:mismatch==='server'?'https://another.example':server,creationKey:'11111111-1111-4111-8111-111111111111',payload:{title:'Private other account title'}})),{key:pendingKey,owner,mismatch,server:API});
  // No private payload is loaded from recovery metadata.
  await page.goto('/calendar');const dialog=await open(page);await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toHaveValue('');await expect(dialog.getByPlaceholder('उदा: कुल पूजा २०८३')).toBeEnabled();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey)).toBeNull();
 }
});

test('failed recovery-metadata persistence prevents create HTTP and keeps one in-memory retry',async({page})=>{
 await login(page);await page.goto('/calendar');let creates=0;
 await page.route('**/calendar/events',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  creates++;expect(await page.evaluate(key=>sessionStorage.getItem(key),pendingKey)).toBeTruthy();await route.fulfill({status:201,json:{id:'fictional-committed-event'}});
 });
 await page.evaluate(key=>{
  const original=Storage.prototype.setItem;
  (window as any).__restoreCalendarStorage=()=>{Storage.prototype.setItem=original;};
  Storage.prototype.setItem=function(k:string,value:string){if(k===key)throw new Error('Fixture storage unavailable');original.call(this,k,value);};
 },pendingKey);
 const dialog=await open(page);await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional storage retry');await dialog.getByRole('button',{name:/\(Save\)/}).click();await expect(dialog.getByRole('button',{name:/Retry creation/})).toBeEnabled();expect(creates).toBe(0);
 await page.evaluate(()=>(window as any).__restoreCalendarStorage());await dialog.getByRole('button',{name:/Retry creation/}).click();await expect(dialog).toHaveCount(0);expect(creates).toBe(1);
});

for(const timezoneId of ['America/New_York','Asia/Tokyo']){
 test.describe(`Nepal Gregorian entry from ${timezoneId}`,()=>{
  test.use({timezoneId});
  test('submits explicit Nepal wall time as UTC and labels rendered time',async({page})=>{
   await login(page);await page.goto('/calendar');let body:any;
   await page.route(url=>url.pathname==='/calendar/events',async route=>{
    if(route.request().method()==='POST'){
     body=route.request().postDataJSON();await route.fulfill({status:201,json:{id:'nepal-time-event'}});return;
    }
    await route.fulfill({json:body?[{...body,id:'nepal-time-event',version:1,lifecycleState:'ACTIVE',canManage:false}]:[]});
   });
   const dialog=await open(page);await dialog.getByPlaceholder('उदा: कुल पूजा २०८३').fill('Fictional explicit Nepal time');
   await dialog.getByRole('combobox',{name:/Date source/}).selectOption('AD');
   await dialog.getByLabel(/Gregorian date and time/).fill('2027-01-02T00:10');
   await expect(dialog.getByLabel(/Gregorian date and time/)).toHaveAccessibleName(/Nepal UTC\+05:45/);
   await dialog.getByRole('button',{name:/\(Save\)/}).click();await expect(dialog).toHaveCount(0);
   expect(body.startsAt).toBe('2027-01-01T18:25:00.000Z');expect(body).not.toHaveProperty('solarDate');expect(body).not.toHaveProperty('tithiYearBs');
   await expect(page.getByText('2027-01-02 00:10 · नेपाल समय (Nepal UTC+05:45)',{exact:false})).toBeVisible();
  });
 });
}
