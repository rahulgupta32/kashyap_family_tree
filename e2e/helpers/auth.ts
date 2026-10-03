import { Page, expect } from '@playwright/test';
export const API = process.env.API_BASE || 'http://127.0.0.1:3000';
export async function login(page:Page, phone='9800000001') {
  const clear=await page.request.post(`${API}/auth/test-clear-cooldown`,{data:{phoneNumber:phone}});expect(clear.ok()).toBeTruthy();
  await page.goto('/login');await page.locator('input[type="tel"]').fill(phone);
  await page.getByRole('button',{name:/Send OTP/}).click();
  await expect(page.getByText('प्रमाणीकरण कोड (Verification OTP)',{exact:true})).toBeVisible();
  const response=await page.request.get(`${API}/auth/test-otp`,{params:{phoneNumber:`+977${phone}`}});expect(response.ok()).toBeTruthy();
  const {otp}=await response.json();await page.locator('input[placeholder="6-अंकको कोड"]').fill(otp);
  await page.getByRole('button',{name:/Verify & Log In/}).click();await expect(page.getByRole('button',{name:/Logout/})).toBeVisible();
}
export async function headers(page:Page){
 const token=await page.evaluate(()=>localStorage.getItem('kashyap_admin_access_token'));expect(token).toBeTruthy();return {Authorization:`Bearer ${token}`};
}
