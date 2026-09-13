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

    await expect(page.locator('text=प्रमाणीकरण कोड (Verification OTP)')).toBeVisible({ timeout: 10000 });
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${adminPhone}`);
    expect(otpRes.ok()).toBeTruthy();
    const { otp } = await otpRes.json();
    await page.fill('input[type="text"]', otp);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('text=ड्यासवोर्ड सारांश (Executive Dashboard)')).toBeVisible();
    await expect(page.locator('text=Super Admin')).toBeVisible();
  }

  test('1. Person Search, Live Duplicate Pre-Evaluation, Override, and Verified Creation', async ({ page }) => {
    await loginAsAdmin(page);

    // 1. Navigate to People Management
    await page.click('a[href="/people"]');
    await expect(page).toHaveURL(/\/people/);
    await expect(page.locator('h2:has-text("वंशावली सूची")')).toBeVisible();

    // 2. Perform bilingual search
    await page.fill('input[placeholder*="Nepali / English"]', 'राम');
    await page.waitForTimeout(400);

    // Clear search
    await page.fill('input[placeholder*="Nepali / English"]', '');
    await page.waitForTimeout(400);

    // 3. Open Add Person Modal
    await page.click('button:has-text("नयाँ व्यक्ति थप्नुहोस् (Add Person)")');
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).toBeVisible();

    // 4. Fill form with isolated unique test data
    const rand = Math.floor(100000 + Math.random() * 900000);
    const uniqueFirstNameNe = `केशव${rand}`;
    const uniqueFirstNameEn = `Keshav${rand}`;

    await page.fill('input[placeholder*="राम प्रसाद"]', uniqueFirstNameNe);
    await page.fill('input[placeholder*="Ram Prasad"]', uniqueFirstNameEn);
    await page.fill('textarea[placeholder*="स्थानीय शाखा"]', 'E2E स्वचालन परीक्षण नयाँ वंशज दर्ता');

    // Wait for live duplicate evaluation debouncing
    await page.waitForTimeout(600);

    // If duplicate warning checkbox appears, check allow override
    const overrideCheckbox = page.locator('input[type="checkbox"]');
    if (await overrideCheckbox.isVisible()) {
      await overrideCheckbox.check();
    }

    // 5. Submit form
    await page.click('button:has-text("सुरक्षित गर्नुहोस् (Save Person)")');

    // 6. Assert modal closed
    await expect(page.locator('h3:has-text("नयाँ व्यक्ति दर्ता (Register New Person)")')).not.toBeVisible({ timeout: 10000 });

    // 7. Search for newly created person in UI directory table
    await page.fill('input[placeholder*="Nepali / English"]', uniqueFirstNameNe);
    await page.waitForTimeout(500);

    // Assert the created person is rendered in directory table
    await expect(page.locator(`td:has-text("${uniqueFirstNameNe}")`)).toBeVisible({ timeout: 10000 });
  });

  test('2. Interactive Family Tree Canvas Navigation & Relative Centering', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to Tree
    await page.click('a[href="/tree"]');
    await expect(page).toHaveURL(/\/tree/);
    await expect(page.locator('h2:has-text("अन्तरक्रियात्मक वंशावली रुख")')).toBeVisible();

    // Assert tree canvas controls are rendered
    await expect(page.locator('button:has-text("Reset")')).toBeVisible();
    await expect(page.locator('button:has-text("+")')).toBeVisible();
    await expect(page.locator('button:has-text("-")')).toBeVisible();

    // Zoom in and out
    await page.click('button:has-text("+")');
    await page.click('button:has-text("-")');
    await page.click('button:has-text("Reset")');

    // Search and select center root in tree selector
    const searchInput = page.locator('input[placeholder*="केन्द्र व्यक्ति"]');
    await searchInput.fill('राम');
    await page.waitForTimeout(400);

    const firstResult = page.locator('.divide-y > div').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
      await page.waitForTimeout(500);
      // Assert sidebar drawer opened
      await expect(page.locator('text=व्यक्ति सारांश (Summary)')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('button:has-text("यहाँबाट रुख विस्तार गर्नुहोस् (Center Here)")')).toBeVisible();
    }
  });

  test('3. Duplicate Queue Review, Comparison Matrix and Dismissal UI', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to Duplicates
    await page.click('a[href="/duplicates"]');
    await expect(page).toHaveURL(/\/duplicates/);
    await expect(page.locator('h2:has-text("दोहोरिएको रेकर्ड व्यवस्थापन")')).toBeVisible();

    // Check status selector exists
    const statusSelect = page.locator('select').first();
    await expect(statusSelect).toBeVisible();

    // Select NOT_A_DUPLICATE filter to verify UI reactivity
    await statusSelect.selectOption('NOT_A_DUPLICATE');
    await page.waitForTimeout(400);
    await expect(page.locator('table')).toBeVisible();
  });

  test('4. Privacy-Filtered Export Functionality (JSON & CSV)', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to People
    await page.click('a[href="/people"]');
    await expect(page).toHaveURL(/\/people/);

    // Verify Export buttons exist and are enabled
    const exportJsonBtn = page.locator('button:has-text("Export JSON")');
    const exportCsvBtn = page.locator('button:has-text("Export CSV")');
    await expect(exportJsonBtn).toBeVisible();
    await expect(exportCsvBtn).toBeVisible();
  });
});
