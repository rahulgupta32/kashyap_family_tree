import {test,expect} from '@playwright/test';
import {login,headers,API} from './helpers/auth';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMQCdYVCdZlgFAAD9oCUV/9UZEAAAAASUVORK5CYII=','base64');
test('profile photo crop persists original bytes and offers safe processing, retry and removal',async({page})=>{
 await login(page);await page.goto('/profile');await expect(page.getByRole('heading',{name:'प्रोफाइल फोटो / Profile photo',exact:true})).toBeVisible();
 await page.getByLabel('Choose profile photo',{exact:true}).setInputFiles({name:'fictional.png',mimeType:'image/png',buffer:png});
 await expect(page.getByLabel('Photo crop preview',{exact:true})).toBeVisible();
 await page.getByLabel('Crop left percent',{exact:true}).fill('25');
 const upload=page.waitForResponse(r=>r.url()===`${API}/profile/photo`&&r.request().method()==='POST');
 await page.getByRole('button',{name:'काटेर सुरक्षित गर्नुहोस् / Save cropped photo',exact:true}).click();
 const response=await upload;expect(response.ok()).toBeTruthy();const {assetId}=await response.json();
 const body=response.request().postDataJSON();expect(body.dataBase64).toBe(png.toString('base64'));expect(body.crop).toEqual({left:2500,top:0,width:7500,height:10000});
 await expect(page.getByText('फोटो तयार हुँदैछ / Processing photo',{exact:true})).toBeVisible();
 const auth=await headers(page),original=await page.request.get(`${API}/profile/media/${assetId}`,{headers:auth});expect(original.ok()).toBeTruthy();expect(await original.body()).toEqual(png);
 await page.reload();await expect(page.getByText('फोटो तयार हुँदैछ / Processing photo',{exact:true})).toBeVisible();
 const remove=page.waitForResponse(r=>r.url()===`${API}/profile/photo`&&r.request().method()==='DELETE');await page.getByRole('button',{name:'फोटो हटाउनुहोस् / Remove photo',exact:true}).click();expect((await remove).ok()).toBeTruthy();
 await expect(page.getByRole('button',{name:'फोटो हटाउनुहोस् / Remove photo',exact:true})).toHaveCount(0);expect((await page.request.get(`${API}/profile/media/${assetId}?variant=display`,{headers:auth})).status()).toBe(404);
});
