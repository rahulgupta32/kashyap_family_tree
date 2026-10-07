import { test, expect, request as requestFactory } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { totp } from '../services/api/src/modules/auth/mfa.crypto';
import { login, headers, API } from './helpers/auth';

function decodeBase32(value: string) {
  let bits = 0, number = 0; const bytes: number[] = [];
  for (const char of value) { number = (number << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((number >>> bits) & 255); } }
  return Buffer.from(bytes);
}

test('Authenticator setup, one-time recovery display and new-session enforcement use the live API', async ({ page, browser }) => {
  await login(page); const adminHeaders = await headers(page);
  const phoneNumber = `+977987${randomInt(1000000, 9999999)}`;
  const api = await requestFactory.newContext({ extraHTTPHeaders: {} });
  const subjectContext = await browser.newContext({ extraHTTPHeaders: { Origin: `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}` } });
  try {
    const challenge = await (await api.post(`${API}/auth/otp/request`, { data: { phoneNumber } })).json();
    const { otp } = await (await api.get(`${API}/auth/test-otp`, { params: { phoneNumber } })).json();
    const verified = await api.post(`${API}/auth/native/verify`, { headers: { Origin: '', Cookie: '' }, data: { otpSessionId: challenge.otpSessionId, code: otp, deviceInfo: { platform: 'android', deviceId: phoneNumber, appVersion: 'authenticator-fixture' } } });
    expect(verified.ok()).toBeTruthy(); const subject = await verified.json();
    const assigned = await page.request.post(`${API}/auth/roles/assign`, { headers: adminHeaders, data: { userId: subject.user.id, role: 'SUPER_ADMIN' } }); expect(assigned.ok()).toBeTruthy();
    const view = await subjectContext.newPage();
    await login(view, phoneNumber.slice(4));
    await expect(view.getByText('ड्यासवोर्ड सारांश (Executive Dashboard)', { exact: true })).toBeVisible();
    await view.goto(`http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}/mfa?setup=1`);
    await expect(view.getByRole('button', { name: 'Set up authenticator', exact: true })).toBeVisible();
    const enrollment = view.waitForResponse(response => response.url() === `${API}/auth/mfa/enroll` && response.request().method() === 'POST');
    await view.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
    const setup = await (await enrollment).json();
    const secret = decodeBase32(setup.secret);
    await view.getByLabel('Authenticator code', { exact: true }).fill(totp(secret, Math.floor(Date.now() / 30000)));
    const confirmation = view.waitForResponse(response => response.url() === `${API}/auth/mfa/confirm`);
    await view.getByRole('button', { name: 'Verify', exact: true }).click();
    const confirmed = await confirmation; expect(confirmed.ok()).toBeTruthy(); const result = await confirmed.json();
    await expect(view.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
    await expect(view.locator('li code')).toHaveCount(10);
    await view.getByRole('button', { name: 'I saved the codes — continue', exact: true }).click();
    await expect(view.getByText('ड्यासवोर्ड सारांश (Executive Dashboard)', { exact: true })).toBeVisible();
    await view.getByRole('button', { name: /Logout/ }).click();
    await expect(view).toHaveURL(/\/login$/);
    await view.request.post(`${API}/auth/test-clear-cooldown`, { data: { phoneNumber } });
    await view.locator('input[type="tel"]').fill(phoneNumber.slice(4));
    await view.getByRole('button', { name: /Send OTP/ }).click();
    const challengeOtp = await (await view.request.get(`${API}/auth/test-otp`, { params: { phoneNumber } })).json();
    await view.locator('input[placeholder="6-अंकको कोड"]').fill(challengeOtp.otp);
    await view.getByRole('button', { name: /Verify & Log In/ }).click();
    await expect(view).toHaveURL(/\/mfa$/);
    const blocked = await view.request.get(`${API}/audit/dashboard`, { headers: await headers(view) }); expect(blocked.status()).toBe(403);
    await view.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
    await view.getByLabel('Recovery code', { exact: true }).fill(result.recoveryCodes[0]);
    await view.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(view.getByText('ड्यासवोर्ड सारांश (Executive Dashboard)', { exact: true })).toBeVisible();
    expect((await view.request.get(`${API}/audit/dashboard`, { headers: await headers(view) })).ok()).toBeTruthy();
  } finally { await subjectContext.close(); await api.dispose(); }
});
