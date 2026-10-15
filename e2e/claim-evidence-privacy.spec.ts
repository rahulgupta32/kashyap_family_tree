import {test,expect} from '@playwright/test';
import {login,API} from './helpers/auth';
const asset='11111111-1111-4111-8111-111111111111';
const claim={id:'22222222-2222-4222-8222-222222222222',targetPersonId:'person',targetPerson:{id:'person',primaryNameNepali:'काल्पनिक व्यक्ति',primaryNameEnglish:'Fictional private person',branchName:'Fictional branch'},claimantPhoneNumber:'+9779800000011',relationshipDescription:'Private fictional claim details',status:'PENDING_TIER1',createdAt:'2030-01-01',evidenceAttachments:[{id:'attachment',mediaAssetId:asset,documentType:'family_photo',createdAt:'2030-01-01'}]};
test('delayed reviewer evidence cannot download or repopulate a replacement authentication context',async({page})=>{
 await login(page);let firstToken='';
 await page.route(url=>url.origin===new URL(API).origin&&url.pathname==='/claims',async route=>{const token=route.request().headers().authorization;if(!firstToken)firstToken=token;await route.fulfill({json:token===firstToken?[claim]:[]});});
 let entered!:()=>void,release!:()=>void;const captured=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 await page.route(url=>url.origin===new URL(API).origin&&url.pathname===`/claims/evidence/${asset}`,async route=>{entered();await gate;await route.fulfill({contentType:'application/octet-stream',body:'Fictional private bytes'});});
 const downloads:any[]=[];page.on('download',d=>downloads.push(d));
 await page.goto('/claims');await page.getByRole('button',{name:/समीक्षा गर्नुहोस् \(Review\)/}).click();
 await page.getByRole('button',{name:/Download evidence/}).click();await captured;
 try{
  await page.evaluate(async()=>{localStorage.setItem('kashyap_token_refreshed_at','0');await (window as any).__kashyap_refreshSession();});
  await expect(page.getByText('दाबी विवरण तथा समीक्षा (Claim Review)',{exact:true})).toHaveCount(0);
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/claims/evidence/${asset}`);release();await(await response).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(downloads).toHaveLength(0);await expect(page.getByText('Private fictional claim details',{exact:true})).toHaveCount(0);
 }finally{release();}
});
