import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

async function loginAsSuperAdmin(page: any) {
  const adminPhone = '9800000001';
  await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, {
    data: { phoneNumber: adminPhone },
  });
  await page.request.post(`${API_BASE}/auth/test-ensure-linked-person`, {
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
    // Seed a test claim via test user login/API
    const claimantPhone = '9841112233';
    await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, { data: { phoneNumber: claimantPhone } });
    const otpReq = await page.request.post(`${API_BASE}/auth/otp/request`, { data: { phoneNumber: claimantPhone } });
    expect(otpReq.ok()).toBeTruthy();
    const otpRes = await page.request.get(`${API_BASE}/auth/test-otp?phoneNumber=+977${claimantPhone}`);
    const { otp } = await otpRes.json();
    const verifyRes = await page.request.post(`${API_BASE}/auth/otp/verify`, { data: { phoneNumber: claimantPhone, otpCode: otp } });
    const { accessToken: claimantToken } = await verifyRes.json();

    // Get a target person to claim
    const searchRes = await page.request.get(`${API_BASE}/genealogy/search?limit=5`);
    const searchData = await searchRes.json();
    const targetPerson = searchData.items?.find((p: any) => !p.isClaimed) || searchData.items[0];

    if (targetPerson) {
      try {
        await page.request.post(`${API_BASE}/claims`, {
          headers: { Authorization: `Bearer ${claimantToken}` },
          data: {
            targetPersonId: targetPerson.id,
            relationshipDescription: 'E2E Deterministic Claim Verification',
            statementOfTruth: true,
          },
        });
      } catch {
        // Claim may already exist
      }
    }

    await page.goto('/claims');
    await expect(page.getByRole('heading', { name: /दाबी प्रमाणीकरण लाम|Profile Claims/i })).toBeVisible();

    const pendingTier1Tab = page.locator('button:has-text("PENDING_TIER1")');
    if (await pendingTier1Tab.isVisible()) {
      await pendingTier1Tab.click();
    }

    await expect(page.locator('table')).toBeVisible();

    const reviewBtn = page.locator('button:has-text("समीक्षा गर्नुहोस् (Review)")').first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      await expect(page.locator('text=दाबी विवरण तथा समीक्षा (Claim Review)')).toBeVisible();
      const closeBtn = page.locator('button:has-text("✕"), button:has-text("बन्द गर्नुहोस् (Close)")').first();
      await closeBtn.click();
    }
  });

  test('2. Governed Genealogy Change Requests Workflow (/change-requests)', async ({ page }) => {
    // Seed a change request via API
    const searchRes = await page.request.get(`${API_BASE}/genealogy/search?limit=5`);
    const searchData = await searchRes.json();
    const targetPerson = searchData.items[0];

    if (targetPerson) {
      try {
        await page.request.post(`${API_BASE}/change-requests`, {
          data: {
            targetPersonId: targetPerson.id,
            type: 'UPDATE_DETAILS',
            proposedChanges: { occupation: 'E2E Governed Researcher' },
            reason: 'E2E Governed Change Proposal',
          },
        });
      } catch {
        // Change request may already exist
      }
    }

    await page.goto('/change-requests');
    await expect(page.getByRole('heading', { name: /वंशावली परिमार्जन अनुरोधहरू|Change Requests/i })).toBeVisible();

    const pendingTab = page.locator('button:has-text("PENDING")');
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
    }

    await expect(page.locator('table')).toBeVisible();

    const diffBtn = page.locator('button:has-text("तुलनात्मक भिन्नता (Visual Diff)")').first();
    if (await diffBtn.isVisible()) {
      await diffBtn.click();
      await expect(page.locator('text=तुलनात्मक भिन्नता समीक्षा (Visual Diff Review)')).toBeVisible();
      const closeBtn = page.locator('button:has-text("✕"), button:has-text("बन्द गर्नुहोस् (Close)")').first();
      await closeBtn.click();
    }
  });

  test('3. Cultural & Family Calendar Events Workflow (/calendar)', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.getByRole('heading', { name: /कुल क्यालेन्डर तथा चाडपर्व|Kinship Observances Calendar/i })).toBeVisible();
    await page.waitForTimeout(1000);

    // Open event creation modal
    const createBtn = page.locator('button:has-text("नयाँ कार्यक्रम थप्नुहोस्"), button:has-text("Create Event")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Fill event form fields
    const titleInput = page.locator('input[placeholder*="उदा: कुल पूजा २०८३"]');
    await expect(titleInput).toBeVisible();
    await titleInput.fill('कुल पूजा २०८३ (E2E Verified)');

    const solarInput = page.locator('input[placeholder*="2083-08-15"]');
    if (await solarInput.isVisible()) {
      await solarInput.fill('2083-08-15');
    }

    const submitBtn = page.locator('button[type="submit"]:has-text("सिर्जना गर्नुहोस् (Save)")');
    await submitBtn.click();

    // Assert success notification and event grid persistence
    await expect(page.locator('text=कुल पूजा २०८३ (E2E Verified)').first()).toBeVisible();

    // Read back via API to verify backend database persistence
    const token = await page.evaluate(() => localStorage.getItem('kashyap_admin_access_token'));
    const eventsRes = await page.request.get(`${API_BASE}/calendar/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventsRes.ok()).toBeTruthy();
    const eventsList = await eventsRes.json();
    const created = eventsList.find((e: any) => e.title === 'कुल पूजा २०८३ (E2E Verified)');
    expect(created).toBeTruthy();
  });

  test('4. Member Profile, Personal Details & Granular Privacy Settings (/profile)', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /मेरो प्रोफाइल तथा गोपनीयता|Profile & Privacy Settings/i })).toBeVisible();
    await page.waitForTimeout(1000);

    // Fill Personal Details form fields
    const currentAddressInput = page.locator('input[placeholder*="पोखरा"]');
    await expect(currentAddressInput).toBeVisible();
    await currentAddressInput.fill('काठमाडौँ, बागमती प्रदेश');

    const saveProfileBtn = page.locator('button:has-text("विवरण सुरक्षित गर्नुहोस्")');
    await saveProfileBtn.click();

    // Assert actual success message
    await expect(page.locator('text=व्यक्तिगत विवरण सफलतापूर्वक सुरक्षित गरियो')).toBeVisible();

    // Reload page to verify backend persistence
    await page.reload();
    await expect(page.getByRole('heading', { name: /मेरो प्रोफाइल तथा गोपनीयता|Profile & Privacy Settings/i })).toBeVisible();
    await page.waitForTimeout(1000);
    const reloadedAddressInput = page.locator('input[placeholder*="पोखरा"]');
    await expect(reloadedAddressInput).toHaveValue('काठमाडौँ, बागमती प्रदेश');

    // Verify Granular Privacy controls
    await expect(page.locator('text=प्रोफाइल दृश्यता (Profile Visibility)')).toBeVisible();
    await expect(page.locator('text=सम्पर्क फोन नम्बर (Contact Phone)')).toBeVisible();
    await expect(page.locator('text=ठेगाना दृश्यता (Address Visibility)')).toBeVisible();

    // Verify Notification preferences
    await expect(page.locator('text=मोबाइल पुश सूचना (Push Notifications)')).toBeVisible();
    await expect(page.locator('text=एसएमएस सूचना (SMS Notifications)')).toBeVisible();
  });
});

