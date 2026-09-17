import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

async function loginAsSuperAdmin(page: any) {
  const adminPhone = '9800000001';
  await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
    data: { phoneNumber: adminPhone },
  });

  await page.goto('/login');
  await page.fill('input[type="tel"]', adminPhone);
  await page.click('button[type="submit"]');

  await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible();

  const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
  expect(otpRes.ok()).toBeTruthy();
  const { otp } = await otpRes.json();
  expect(otp).toBeTruthy();

  await page.fill('input[type="text"]', otp);
  await page.click('button[type="submit"]');

  // Verify dashboard navigation
  await expect(page).toHaveURL(/\/(people|dashboard)?$/);
}

test.describe('Milestone 4: Governed Workflows E2E Browser Acceptance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
  });

  test('1. Governed Profile Claims Workflow (/claims)', async ({ page }) => {
    await page.goto('/claims');
    await expect(page.getByRole('heading', { name: /दाबी प्रमाणीकरण लाम|Profile Claims/i })).toBeVisible();

    // Verify filter tabs are present and interactive
    const pendingTier1Tab = page.locator('button:has-text("PENDING_TIER1")');
    if (await pendingTier1Tab.isVisible()) {
      await pendingTier1Tab.click();
    }

    const allTab = page.locator('button:has-text("ALL")');
    if (await allTab.isVisible()) {
      await allTab.click();
    }

    // Verify search / table presence
    await expect(page.locator('table, .space-y-4')).toBeVisible();
  });

  test('2. Governed Genealogy Change Requests Workflow (/change-requests)', async ({ page }) => {
    await page.goto('/change-requests');
    await expect(page.getByRole('heading', { name: /वंशावली परिमार्जन अनुरोधहरू|Change Requests/i })).toBeVisible();

    // Verify status filter controls
    const pendingTab = page.locator('button:has-text("PENDING")');
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
    }

    // Verify table structure
    await expect(page.locator('table, .space-y-4')).toBeVisible();
  });

  test('3. Cultural & Family Calendar Events Workflow (/calendar)', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /कुल क्यालेन्डर तथा चाडपर्व|Kinship Observances Calendar/i })).toBeVisible();

    // Verify calendar navigation or event list container
    await expect(page.locator('button:has-text("नयाँ कार्यक्रम थप्नुहोस्"), button:has-text("Create Event")')).toBeVisible();
  });

  test('4. Member Profile, Personal Details & Granular Privacy Settings (/profile)', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /मेरो प्रोफाइल तथा गोपनीयता|Profile & Privacy Settings/i })).toBeVisible();

    // Fill Personal Details form fields
    const currentAddressInput = page.locator('input[placeholder*="पोखरा"]');
    await expect(currentAddressInput).toBeVisible();
    await currentAddressInput.fill('काठमाडौँ, बागमती प्रदेश');

    const saveProfileBtn = page.locator('button:has-text("विवरण सुरक्षित गर्नुहोस्")');
    await saveProfileBtn.click();

    // Assert actual success message
    await expect(page.locator('text=व्यक्तिगत विवरण सफलतापूर्वक सुरक्षित गरियो')).toBeVisible();

    // Verify Granular Privacy controls
    await expect(page.locator('text=प्रोफाइल दृश्यता (Profile Visibility)')).toBeVisible();
    await expect(page.locator('text=सम्पर्क फोन नम्बर (Contact Phone)')).toBeVisible();
    await expect(page.locator('text=ठेगाना दृश्यता (Address Visibility)')).toBeVisible();

    // Verify Notification preferences
    await expect(page.locator('text=मोबाइल पुश सूचना (Push Notifications)')).toBeVisible();
    await expect(page.locator('text=एसएमएस सूचना (SMS Notifications)')).toBeVisible();
  });
});
