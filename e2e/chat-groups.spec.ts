import { test, expect } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { API, login, headers } from './helpers/auth';
import { Client } from '../services/api/node_modules/pg';

test('private group creation, admin promotion, settings, removal and transfer persist in the portal',async({page,browser})=>{
 test.setTimeout(120000);
 await login(page);const adminHeaders=await headers(page);
 const branch=(await (await page.request.get(`${API}/genealogy/branches`)).json()).find((b:any)=>b.code==='KASKI');
 const label=`GroupFlow${randomUUID().replace(/-/g,'').slice(0,10)}`;
 const database=process.env.DB_NAME;
 expect(database).toMatch(/^kashyap_(test|iso)_[a-z0-9_]+$/);
 const db=new Client({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||5434),user:process.env.DB_USER||'kashyap_user',password:process.env.DB_PASSWORD,database});
 await db.connect();expect((await db.query('SELECT current_database() AS name')).rows[0].name).toBe(database);
 const otherContext=await browser.newContext({ extraHTTPHeaders: { Origin: `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}` } });
 try{
  async function fixture(suffix:string){
   const phone=`984${randomInt(1000000,9999999)}`;
   const challenge=await page.request.post(`${API}/auth/otp/request`,{data:{phoneNumber:phone}});expect(challenge.ok()).toBeTruthy();
   const otp=await (await page.request.get(`${API}/auth/test-otp`,{params:{phoneNumber:phone}})).json();
   const session=await page.request.post(`${API}/auth/native/verify`,{headers:{Origin:'',Cookie:''},data:{otpSessionId:(await challenge.json()).otpSessionId,code:otp.otp,deviceInfo:{deviceId:randomUUID(),platform:'android',appVersion:'group-acceptance'}}});expect(session.ok()).toBeTruthy();
   const member=await session.json();
   const role=await page.request.post(`${API}/auth/roles/assign`,{headers:adminHeaders,data:{userId:member.user.id,role:'BRANCH_ADMIN',branchId:branch.id}});expect(role.ok()).toBeTruthy();
   const response=await page.request.post(`${API}/genealogy/people`,{headers:adminHeaders,data:{
    names:[{language:'en',firstName:label+suffix,lastName:'Fictional',fullName:label+suffix+' Fictional',isPrimary:true}],
    gender:'MALE',livingStatus:'LIVING',generation:3,branchId:branch.id,birthYearBs:2040,
    justificationReason:'Fictional group-browser fixture in a disposable test database.',allowDuplicateOverride:true,
   }});expect(response.ok()).toBeTruthy();const person=await response.json();
   await db.query('UPDATE user_accounts SET person_id=$2 WHERE id=$1',[member.user.id,person.id]);
   await db.query('UPDATE persons SET is_claimed=TRUE,claimed_user_id=$2 WHERE id=$1',[person.id,member.user.id]);
   return {phone,id:member.user.id,personId:person.id,name:label+suffix+' Fictional',token:member.accessToken};
  }
  const owner=await fixture('Owner'),member=await fixture('Member');
  // Clearing UI state can route to login before the server logout and final reload finish.
  const loggedOut=page.waitForResponse(r=>r.url()===`${API}/auth/logout`&&r.request().method()==='POST');
  const loginDocument=page.waitForResponse(r=>r.request().resourceType()==='document'&&new URL(r.url()).pathname==='/login');
  await page.getByRole('button',{name:/Logout/}).click();expect((await loggedOut).ok()).toBeTruthy();await (await loginDocument).finished();await page.waitForLoadState('load');
  await expect(page.locator('input[type=tel]')).toBeVisible();await login(page,owner.phone);await page.goto('/chat');
  const creator=page.getByRole('group',{name:/Create private group/});
  const title=`Fictional private ${label}`;
  await creator.getByLabel(/Private group title/).fill(title);
  await creator.getByLabel(/Group description/).fill('Fictional group purpose');
  await creator.getByLabel(/Find group members/).fill(label+'Member');
  await creator.getByRole('button',{name:/Search members/}).click();
  await creator.getByRole('checkbox',{name:member.name}).check();
  await creator.getByRole('button',{name:/Create private group/}).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const groups=await page.request.get(`${API}/chat/conversations`,{headers:await headers(page)});const group=(await groups.json()).find((g:any)=>g.title===title);
  expect(group.type).toBe('GROUP');
  await page.getByRole('button',{name:/Group information/}).click();const dialog=page.getByRole('dialog',{name:/Group information/});
  const memberRow=dialog.locator(`[data-user-id="${member.id}"]`);
  await memberRow.getByRole('button',{name:/Make admin/}).click();await expect(memberRow).toContainText('ADMIN');
  await dialog.getByLabel('समूह शीर्षक (Group title)',{exact:true}).fill(title+' edited');
  await dialog.getByRole('button',{name:/Save group settings/}).click();
  await expect(dialog.getByText(title+' edited',{exact:false}).first()).toBeVisible();
  page.once('dialog',d=>d.accept());await memberRow.getByRole('button',{name:/Remove/}).click();
  await expect(memberRow).toHaveCount(0);
  const denied=await page.request.get(`${API}/chat/conversations/${group.id}/messages`,{headers:{Authorization:`Bearer ${member.token}`}});expect(denied.status()).toBe(404);
  await dialog.getByLabel(/Find group members/).fill(label+'Member');await dialog.getByRole('button',{name:/Search members/}).click();
  await dialog.getByRole('button',{name:new RegExp(`Add member.*${member.name}`)}).click();await expect(memberRow).toContainText('MEMBER');
  page.once('dialog',d=>d.accept());await memberRow.getByRole('button',{name:/Transfer ownership/}).click();await expect(memberRow).toContainText('OWNER');
  await dialog.getByRole('button',{name:/Close/}).click();await page.reload();
  await page.getByRole('button',{name:new RegExp(title+' edited')}).click();await page.getByRole('button',{name:/Group information/}).click();
  await expect(dialog.locator(`[data-user-id="${owner.id}"]`)).toContainText('ADMIN');
  await expect(dialog.getByRole('button',{name:/Transfer ownership/})).toHaveCount(0);
  const memberPage=await otherContext.newPage();await login(memberPage,member.phone);await memberPage.goto('/chat');
  await memberPage.getByRole('button',{name:new RegExp(title+' edited')}).click();await memberPage.getByRole('button',{name:/Group information/}).click();
  await expect(memberPage.getByRole('dialog').locator(`[data-user-id="${member.id}"]`)).toContainText('OWNER');
 }finally{await otherContext.close();await db.end();}
});
