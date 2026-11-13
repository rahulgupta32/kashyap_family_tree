import {test,expect,request as requestFactory} from '@playwright/test';
import {randomUUID,randomInt} from 'node:crypto';
import {API,login,headers} from './helpers/auth';

test('Cultural content requires independent review and designated approval before browser publication',async({page,browser})=>{
 test.setTimeout(120000);
 const origin=`http://127.0.0.1:${process.env.ADMIN_PORT||'3002'}`;
 const reviewerContext=await browser.newContext({extraHTTPHeaders:{Origin:origin}}),approverContext=await browser.newContext({extraHTTPHeaders:{Origin:origin}});
 try{
  await login(page);const auth=await headers(page);
  const reviewer=await reviewerContext.newPage(),approver=await approverContext.newPage();
  const phones=['9871'+randomInt(100000,999999),'9872'+randomInt(100000,999999)];
  const api=await requestFactory.newContext();const accounts:any[]=[];
  try{for(let i=0;i<phones.length;i++){
   const phoneNumber='+977'+phones[i];const challenge=await (await api.post(`${API}/auth/otp/request`,{data:{phoneNumber}})).json();
   const {otp}=await (await api.get(`${API}/auth/test-otp`,{params:{phoneNumber}})).json();
   const verified=await api.post(`${API}/auth/native/verify`,{headers:{Origin:'',Cookie:''},data:{otpSessionId:challenge.otpSessionId,code:otp,deviceInfo:{platform:'android',deviceId:phoneNumber,appVersion:'cultural-fixture'}}});expect(verified.ok()).toBeTruthy();
   const account=(await verified.json()).user;accounts.push(account);
   const assigned=await page.request.post(`${API}/auth/roles/assign`,{headers:auth,data:{userId:account.id,role:i===0?'CULTURAL_HISTORIAN':'VERIFIED_MEMBER'}});expect(assigned.ok()).toBeTruthy();
  }}finally{await api.dispose();}
  const [r,a]=accounts;await login(reviewer,phones[0],'/cultural');await login(approver,phones[1],'/cultural');
  // Reloaded sessions read current server roles, never stale JWT role claims.
  await page.goto('/cultural');
  const slug='fictional-'+randomUUID(),title='परीक्षण '+randomUUID();
  const form=page.getByRole('form',{name:'Cultural draft'});
  await form.getByLabel('ठेगाना (URL slug)').fill(slug);await form.getByLabel('नेपाली शीर्षक (Nepali title)').fill(title);
  await form.getByLabel('नेपाली सामग्री (Nepali content)').fill('यो काल्पनिक परीक्षण सामग्री मात्र हो।');
  await form.getByLabel('मुख्य शब्द (Comma-separated keywords)').fill(slug);await form.getByLabel('स्रोत र प्रमाण (Source and evidence)').fill('Fictional browser test, no religious authority evidence.');
  await form.getByRole('button',{name:/Save draft/}).click();
  const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:`${title} · ${slug}`,exact:true})});await expect(card).toContainText('DRAFT');
  await page.getByLabel(/Decision \/ change reason/).fill('Explicit fictional representative assignment');await page.getByLabel(/Designated representative account ID/).fill(a.id);
  await card.getByRole('button',{name:/Assign approver/}).click();await expect(card).toContainText(a.id);
  await card.getByRole('button',{name:/Submit for review/}).click();await expect(card).toContainText('REVIEW');
  await expect(card.getByRole('button',{name:/Endorse review/})).toHaveCount(0);await expect(card.getByRole('button',{name:/Publish/})).toHaveCount(0);
  await reviewer.goto(origin+'/cultural');const rcard=reviewer.getByRole('article').filter({has:reviewer.getByRole('heading',{name:`${title} · ${slug}`,exact:true})});
  await reviewer.getByLabel(/Decision \/ change reason/).fill('Independent fictional review');await rcard.getByRole('button',{name:/Endorse review/}).click();await expect(rcard).toContainText(r.id);
  await approver.goto(origin+'/cultural');const acard=approver.getByRole('article').filter({has:approver.getByRole('heading',{name:`${title} · ${slug}`,exact:true})});
  await approver.getByLabel(/Decision \/ change reason/).fill('Designated fictional representative approval');await acard.getByRole('button',{name:/Approve as representative/}).click();await expect(acard).toContainText('APPROVED');
  await page.reload();await page.getByLabel(/Decision \/ change reason/).fill('Publish reviewed fictional revision');await card.getByRole('button',{name:/Publish/}).click();await expect(card).toContainText('PUBLISHED');
  await page.getByLabel('खोज (Search)',{exact:true}).fill(slug);await page.getByRole('button',{name:/Search published content/}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await card.getByRole('button',{name:/History and evidence/}).click();await expect(page.getByRole('region',{name:'Revision history'})).toContainText('Fictional browser test');
  await expect(page.getByRole('region',{name:'Content decisions'})).toContainText('APPROVE');
 }finally{await reviewerContext.close();await approverContext.close();}
});
