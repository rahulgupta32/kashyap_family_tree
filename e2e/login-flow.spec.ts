import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

test.describe('End-to-End Browser Session Flow (Milestone 2)', () => {
  test('1. Regular user gets bilingual Access Denied state (BR-GOV-004)', async ({ page }) => {
    // 1. Load login page
    await page.goto('/login');
    await expect(page).toHaveTitle(/Kashyap Adhikari/i);
    await expect(page.getByRole('heading', { name: 'कश्यप अधिकारी वंशावली' })).toBeVisible();

    // 2. Enter non-admin mobile number
    const nonAdminPhone = '9841234567';
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
      data: { phoneNumber: nonAdminPhone },
    });
    await page.fill('input[type="tel"]', nonAdminPhone);
    await page.click('button[type="submit"]');

    // Wait for OTP input step
    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible();

    // 3. Fetch simulated test OTP from test endpoint
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${nonAdminPhone}`);
    expect(otpRes.ok()).toBeTruthy();
    const { otp } = await otpRes.json();
    expect(otp).toBeTruthy();

    // 4. Submit OTP
    await page.fill('input[type="text"]', otp);
    await page.click('button[type="submit"]');

    // 5. Assert bilingual Access Denied screen
    await expect(page.locator('text=पहुँच अस्वीकृत (Access Denied)')).toBeVisible();
    await expect(page.locator('text=कुनै पनि प्रशासनिक भूमिका')).toBeVisible();

    // 6. Click "Try Another Account" to reset form
    await page.click('button:has-text("अन्य नम्बरबाट प्रयास गर्नुहोस्")');
    await expect(page.locator('input[type="tel"]')).toBeVisible();
  });

  test('2. Super Admin login, dashboard access, cookie verification, session restoration, and logout', async ({ page, context }) => {
    // 1. Load login page
    await page.goto('/login');

    // 2. Enter Super Admin phone number (bootstrap seeded)
    const adminPhone = '9800000001';
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
      data: { phoneNumber: adminPhone },
    });
    await page.fill('input[type="tel"]', adminPhone);
    await page.click('button[type="submit"]');

    // Wait for OTP input step
    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible();

    // 3. Fetch simulated OTP
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
    expect(otpRes.ok()).toBeTruthy();
    const { otp } = await otpRes.json();
    expect(otp).toBeTruthy();

    // 4. Submit OTP
    await page.fill('input[type="text"]', otp);
    await page.click('button[type="submit"]');

    // 5. Verify redirection to dashboard
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page.locator('text=Super Admin')).toBeVisible();
    await expect(page.locator('text=सक्रिय (Active)')).toBeVisible();

    // 6. Verify refresh token cookie security properties
    const cookies = await context.cookies(['http://localhost:3000', 'http://localhost:3002']);
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.sameSite.toLowerCase()).toBe('strict');

    // Verify refresh token is NOT stored in localStorage
    const localStorageRefreshToken = await page.evaluate(() => localStorage.getItem('kashyap_admin_refresh_token'));
    expect(localStorageRefreshToken).toBeNull();

    // 7. Session Restoration across page reload
    await page.reload();
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page.locator('text=Super Admin')).toBeVisible();

    // 8. Logout
    await page.click('button:has-text("लगआउट (Logout)")');
    await expect(page).toHaveURL(/\/login/);

    // 9. Confirm session invalidated (unauthenticated user visiting / is redirected to /login)
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('input[type="tel"]')).toBeVisible();
  });

  test('3. Multi-tab concurrent refresh coordination, response body validation, and cross-tab logout', async ({ page, context }) => {
    // 1. Log in on Tab 1
    await page.goto('/login');
    const adminPhone = '9800000001';
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
      data: { phoneNumber: adminPhone },
    });
    await page.fill('input[type="tel"]', adminPhone);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible();

    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
    const { otp } = await otpRes.json();
    await page.fill('input[type="text"]', otp);

    // Intercept /auth/otp/verify response to verify JSON body omits refreshToken
    const [verifyResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/otp/verify')),
      page.click('button[type="submit"]'),
    ]);
    const verifyJson = await verifyResponse.json();
    expect(verifyJson.accessToken).toBeDefined();
    // Refresh token credential MUST be omitted from browser JSON response
    expect(verifyJson.refreshToken).toBeUndefined();

    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();

    // 2. Open Tab 2 in the same browser context (shares HttpOnly cookie)
    const page2 = await context.newPage();
    await page2.goto('/');
    await expect(page2.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();

    // 3. Confirm Web Locks API is available in browser for cross-tab coordination
    const [hasLocks1, hasLocks2] = await Promise.all([
      page.evaluate(() => typeof navigator.locks?.request === 'function'),
      page2.evaluate(() => typeof navigator.locks?.request === 'function'),
    ]);
    expect(hasLocks1).toBe(true);
    expect(hasLocks2).toBe(true);

    // 4. Logout from Tab 1
    await page.click('button:has-text("लगआउट (Logout)")');
    await expect(page).toHaveURL(/\/login/);

    // Tab 2 reload should now be unauthenticated
    await page2.reload();
    await expect(page2).toHaveURL(/\/login/);
    await page2.close();
  });
});
