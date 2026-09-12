import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

test.describe('End-to-End Genealogy, Tree & Duplicate Governance Flow (Milestone 3)', () => {
  const adminPhone = '9800000001';

  async function loginAsAdmin(page: any) {
    await page.goto('/login');
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
      data: { phoneNumber: adminPhone },
    });
    await page.fill('input[type="tel"]', adminPhone);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible();
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
    expect(otpRes.ok()).toBeTruthy();
    const { otp } = await otpRes.json();
    await page.fill('input[type="text"]', otp);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page.locator('text=Super Admin')).toBeVisible();
  }

  test('1. Person Search, Live Duplicate Pre-Evaluation, and Creation', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to People Management
    await page.click('a[href="/people"]');
    await expect(page).toHaveURL(/\/people/);
    await expect(page.locator('h2:has-text("वंशावली सूची")')).toBeVisible();

    // Perform bilingual search
    await page.fill('input[placeholder*="Nepali / English"]', 'राम');
    await page.waitForTimeout(400);

    // Open Add Person Modal
    await page.click('button:has-text("नयाँ व्यक्ति थप्नुहोस् (Add Person)")');
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).toBeVisible();

    // Fill form and trigger live duplicate evaluation
    const rand = Math.floor(1000 + Math.random() * 9000);
    await page.fill('input[placeholder*="राम प्रसाद"]', `केशव-${rand}`);
    await page.fill('textarea[placeholder*="स्थानीय शाखा"]', 'E2E स्वचालन परीक्षण व्यक्ति सिर्जना');

    // Submit form
    await page.click('button:has-text("सुरक्षित गर्नुहोस् (Save Person)")');

    // Verify modal closed
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).not.toBeVisible({ timeout: 10000 });
  });

  test('2. Interactive Family Tree Canvas Navigation', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to Tree
    await page.click('a[href="/tree"]');
    await expect(page).toHaveURL(/\/tree/);
    await expect(page.locator('h2:has-text("अन्तरक्रियात्मक वंशावली रुख")')).toBeVisible();

    // Assert tree canvas controls are rendered
    await expect(page.locator('button:has-text("Reset")')).toBeVisible();
  });

  test('3. Duplicate Queue Review and Governed Merge UI', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to Duplicates
    await page.click('a[href="/duplicates"]');
    await expect(page).toHaveURL(/\/duplicates/);
    await expect(page.locator('h2:has-text("दोहोरिएको रेकर्ड व्यवस्थापन")')).toBeVisible();

    // Check status selector exists
    await expect(page.locator('select')).toBeVisible();
  });
});
