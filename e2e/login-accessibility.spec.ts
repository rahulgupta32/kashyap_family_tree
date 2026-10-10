import { test, expect, request as requestFactory } from '@playwright/test';
import { Role } from '@kashyap/contracts';
import { API, login, headers } from './helpers/auth';

test('Keyboard sign-in has associated labels, announced errors and focus across phone, OTP and denied access', async ({ page }) => {
  await page.goto('/login');
  const phone = page.getByRole('textbox', { name: 'मोबाइल नम्बर (Mobile Number)', exact: true });
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute('autocomplete', 'tel-national');
  await phone.fill('123');
  await phone.press('Enter');
  await expect(page.locator('#login-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#login-error')).toContainText('Error');
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await page.request.post(`${API}/auth/test-clear-cooldown`, { data: { phoneNumber: '9847788991' } });
  await phone.fill('9847788991');
  await phone.press('Enter');
  const code = page.getByRole('textbox', { name: 'प्रमाणीकरण कोड (Verification OTP)', exact: true });
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  const response = await page.request.get(`${API}/auth/test-otp`, { params: { phoneNumber: '+9779847788991' } });
  expect(response.ok()).toBeTruthy();
  await code.fill((await response.json()).otp);
  await code.press('Enter');
  await expect(page.getByRole('heading', { name: 'पहुँच अस्वीकृत (Access Denied)', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /Try Another Account/ }).press('Enter');
  await expect(phone).toBeFocused();
});

test('A current central administrator can sign in normally, restore the session and read authorized delivery status', async ({ page }) => {
  await login(page);
  const administratorHeaders = await headers(page);
  const transport = await requestFactory.newContext({ extraHTTPHeaders: {} });
  const phone = `984${Math.floor(1000000 + Math.random() * 9000000)}`;
  try {
    const requested = await transport.post(`${API}/auth/otp/request`, { data: { phoneNumber: phone } });
    expect(requested.ok(), await requested.text()).toBeTruthy();
    const challenge = await requested.json();
    const code = await transport.get(`${API}/auth/test-otp`, { params: { phoneNumber: `+977${phone}` } });
    expect(code.ok()).toBeTruthy();
    const verified = await transport.post(`${API}/auth/native/verify`, { data: { otpSessionId: challenge.otpSessionId, code: (await code.json()).otp } });
    expect(verified.ok(), await verified.text()).toBeTruthy();
    const account = await verified.json();
    const granted = await page.request.post(`${API}/auth/roles/assign`, {
      headers: administratorHeaders, data: { userId: account.user.id, role: Role.CENTRAL_ADMIN },
    });
    expect(granted.ok(), await granted.text()).toBeTruthy();
    await page.getByRole('button', { name: /Logout/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await login(page, phone);
    await expect(page.getByRole('heading', { name: 'ड्यासवोर्ड सारांश (Executive Dashboard)', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ड्यासवोर्ड सारांश (Executive Dashboard)', exact: true })).toBeVisible();
    const delivery = await page.request.get(`${API}/audit/delivery`, { headers: await headers(page) });
    expect(delivery.ok(), await delivery.text()).toBeTruthy();
    expect(delivery.headers()['cache-control']).toBe('no-store');
    // Central authority still does not grant Super Admin-only role management.
    const forbidden = await page.request.post(`${API}/auth/roles/assign`, {
      headers: await headers(page), data: { userId: account.user.id, role: Role.SUPER_ADMIN },
    });
    expect(forbidden.status()).toBe(403);
  } finally { await transport.dispose(); }
});
