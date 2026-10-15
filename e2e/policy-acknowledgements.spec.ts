import {test,expect} from '@playwright/test';
import {login} from './helpers/auth';
const policy={id:'11111111-1111-4111-8111-111111111111',kind:'PRIVACY',version:1,titleNe:'काल्पनिक नीति',titleEn:'Fictional policy',bodyNe:'परीक्षण मात्र',bodyEn:'Fictional fixture only',contentHash:'a'.repeat(64),acceptedAt:null};
test('policy acknowledgement requires explicit selection and safely retries the same content',async({page})=>{
 await login(page);let accepted=false;const bodies:any[]=[];
 await page.route(url=>url.pathname.startsWith('/me/policies'),async route=>{
  if(route.request().method()==='POST'){
   bodies.push(route.request().postDataJSON());
   if(bodies.length===1){await route.fulfill({status:503,json:{message:'Private raw diagnostic'}});}
   else{accepted=true;await route.fulfill({status:201,json:{documentId:policy.id,acceptedAt:'2030-01-01',current:true}});}
  }else{await route.fulfill({json:{available:true,documents:[{...policy,acceptedAt:accepted?'2030-01-01':null}],history:[]}});}
 });
 await page.goto('/policies');const article=page.getByRole('article',{name:'PRIVACY 1',exact:true});const confirm=article.getByRole('button',{name:/Confirm acknowledgement/});
 await expect(confirm).toBeDisabled();await article.getByRole('checkbox').check();await confirm.click();await expect(page.getByRole('status')).toContainText('Unconfirmed');
 await expect(page.getByText('Private raw diagnostic',{exact:true})).toHaveCount(0);await expect(article.getByRole('checkbox')).toBeChecked();await confirm.click();
 await expect(article).toContainText('Acknowledged');expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual({documentId:policy.id,contentHash:policy.contentHash,accepted:true});expect(bodies[1]).toEqual(bodies[0]);
});
test('missing approved policy never becomes implied consent',async({page})=>{
 await login(page);await page.route(url=>url.pathname==='/me/policies',route=>route.fulfill({json:{available:false,documents:[],history:[]}}));await page.goto('/policies');
 await expect(page.getByText(/Approved policy unavailable/)).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);
});
