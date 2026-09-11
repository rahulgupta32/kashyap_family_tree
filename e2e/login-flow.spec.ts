import { test, expect } from '@playwright/test';
import { ErrorCode } from '@kashyap/contracts';

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

  test('3. Real two-tab concurrent refresh coordination: exactly one network request across tabs and automatic cross-tab logout without reload', async ({ page, context }) => {
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

    // Intercept /auth/otp/verify response to verify JSON body strictly omits refreshToken
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

    // 3. Count refresh network requests across both tabs during concurrent execution
    let refreshRequestCount = 0;
    const countRequest = (req: any) => {
      if (req.url().includes('/auth/refresh')) {
        refreshRequestCount++;
      }
    };
    page.on('request', countRequest);
    page2.on('request', countRequest);

    const refreshResponsePromise = Promise.race([
      page.waitForResponse((r) => r.url().includes('/auth/refresh')),
      page2.waitForResponse((r) => r.url().includes('/auth/refresh')),
    ]);

    const [t1Token, t2Token, refreshResponse] = await Promise.all([
      page.evaluate(() => (window as any).__kashyap_refreshSession()),
      page2.evaluate(() => (window as any).__kashyap_refreshSession()),
      refreshResponsePromise,
    ]);

    expect(t1Token).toBeTruthy();
    expect(t2Token).toBeTruthy();
    expect(t1Token).toBe(t2Token); // Both tabs synchronized to the identical rotated access token

    // Assert that coordinated concurrent refresh produced EXACTLY ONE network request across tabs
    expect(refreshRequestCount).toBe(1);

    // Assert the network response strictly omitted refresh tokens from JSON body
    expect(refreshResponse.status()).toBe(200);
    const refreshJson = await refreshResponse.json();
    expect(refreshJson.accessToken).toBe(t1Token);
    expect(refreshJson.refreshToken).toBeUndefined();

    // Assert session continuity on both tabs
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page2.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();

    // 4. Test cross-tab logout WITHOUT requiring a manual reload
    // Tab 1 initiates logout -> BroadcastChannel/storage event notifies Tab 2 -> Tab 2 automatically navigates to /login
    await page.click('button:has-text("लगआउट (Logout)")');
    await expect(page).toHaveURL(/\/login/);

    // Tab 2 must redirect to /login automatically without calling page2.reload()
    await expect(page2).toHaveURL(/\/login/);
    await expect(page2.locator('input[type="tel"]')).toBeVisible();

    await page2.close();
  });

  test('4. Strict refresh-token replay detection: captured consumed credential replay triggers REFRESH_TOKEN_REUSED and universal session revocation (EC-0020)', async ({ page, context }) => {
    // 1. Log in
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
    await page.click('button[type="submit"]');
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();

    // 2. Capture the initial refresh token credential before rotation using Playwright test tooling
    const cookiesBefore = await context.cookies(['http://localhost:3000', 'http://localhost:3002']);
    const initialCookie = cookiesBefore.find((c) => c.name === 'refreshToken');
    expect(initialCookie).toBeDefined();
    const consumedRefreshToken = initialCookie!.value;
    expect(consumedRefreshToken).toBeTruthy();

    // 3. Rotate it successfully
    const rotatedToken = await page.evaluate(() => (window as any).__kashyap_refreshSession());
    expect(rotatedToken).toBeTruthy();

    // Confirm that cookie was rotated with a new, different refresh token
    const cookiesAfter = await context.cookies(['http://localhost:3000', 'http://localhost:3002']);
    const rotatedCookie = cookiesAfter.find((c) => c.name === 'refreshToken');
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie!.value).not.toBe(consumedRefreshToken);

    // 4. Explicitly replay the consumed credential
    const replayRes = await page.request.post(`${API_BASE}/auth/refresh`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refreshToken=${consumedRefreshToken}`,
      },
      data: {},
    });

    // 5. Assert replay-specific error (HTTP 401 with REFRESH_TOKEN_REUSED)
    expect(replayRes.status()).toBe(401);
    const replayBody = await replayRes.json();
    expect(replayBody.errorCode).toBe(ErrorCode.REFRESH_TOKEN_REUSED);
    expect(replayBody.message).toContain('Refresh token reuse detected');

    // 6. Assert required universal session revocation (EC-0020):
    // All sessions for this user must now be terminated.
    // Even the successor rotated token must now be rejected
    const postReplayRefresh = await page.request.post(`${API_BASE}/auth/refresh`, {
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refreshToken=${rotatedCookie!.value}`,
      },
      data: {},
    });
    expect(postReplayRefresh.status()).toBe(401);

    // The access token must also be rejected on protected routes
    const profileRes = await page.request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${rotatedToken}` },
    });
    expect(profileRes.status()).toBe(401);

    // Page reload redirects to login because the session is revoked
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test('5. Missing refresh cookie or credentials rejected with UNAUTHORIZED', async ({ page }) => {
    // Requesting refresh without any cookie or token body must be rejected
    const noCookieRes = await page.request.post(`${API_BASE}/auth/refresh`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(noCookieRes.status()).toBe(401);
    const noCookieBody = await noCookieRes.json();
    expect(noCookieBody.errorCode).toBe(ErrorCode.UNAUTHORIZED);
    expect(noCookieBody.message).toContain('Refresh token is required');
  });
});
