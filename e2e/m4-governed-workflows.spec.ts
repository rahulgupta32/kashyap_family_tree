import { test, expect, request as requestFactory, APIRequestContext, APIResponse, Page } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const ADMIN_BASE = `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function checkedJson(response: APIResponse) {
  expect(response.ok(), `${response.url()} returned ${response.status()}`).toBeTruthy();
  return response.json();
}

async function loginAdmin(page: Page, phone = '9800000001') {
  await checkedJson(await page.request.post(`${API_BASE}/auth/test-clear-cooldown`, { data: { phoneNumber: phone } }));
  await page.goto(`${ADMIN_BASE}/login`);
  await page.locator('input[type="tel"]').fill(phone);
  await page.getByRole('button', { name: /Send OTP/ }).click();
  await expect(page.getByText('प्रमाणीकरण कोड (Verification OTP)', { exact: true })).toBeVisible();
  const { otp } = await checkedJson(await page.request.get(`${API_BASE}/auth/test-otp`, { params: { phoneNumber: `+977${phone}` } }));
  expect(otp).toMatch(/^\d{6}$/);
  await page.locator('input[placeholder="6-अंकको कोड"]').fill(otp);
  await page.getByRole('button', { name: /Verify & Log In/ }).click();
  await expect(page).toHaveURL(/\/(people|dashboard)?$/);
  await expect(page.getByRole('button', { name: /Logout/ })).toBeVisible();
}

async function browserToken(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('kashyap_admin_access_token'));
  expect(token).toBeTruthy();
  return token!;
}

async function memberSession(api: APIRequestContext) {
  const phoneNumber = `984${randomInt(1000000, 9999999)}`;
  const challenge = await checkedJson(await api.post(`${API_BASE}/auth/otp/request`, { data: { phoneNumber } }));
  const { otp } = await checkedJson(await api.get(`${API_BASE}/auth/test-otp`, { params: { phoneNumber } }));
  const session = await checkedJson(await api.post(`${API_BASE}/auth/native/verify`, {
    data: { otpSessionId: challenge.otpSessionId, code: otp,
      deviceInfo: { deviceId: randomUUID(), platform: 'android', appVersion: 'acceptance' } },
  }));
  expect(session.accessToken).toBeTruthy();
  return session;
}

async function createFictionalPerson(api: APIRequestContext, adminToken: string) {
  const branches = await checkedJson(await api.get(`${API_BASE}/genealogy/branches`));
  const branch = branches.find((item: any) => item.code === 'KASKI');
  expect(branch).toBeTruthy();
  const label = `Fictional M4 ${randomUUID()}`;
  return checkedJson(await api.post(`${API_BASE}/genealogy/people`, {
    headers: auth(adminToken), data: {
      names: [{ language: 'en', firstName: label, lastName: 'Adhikari', fullName: `${label} Adhikari`, isPrimary: true }],
      gender: 'MALE', livingStatus: 'LIVING', generation: 3, branchId: branch.id, birthYearBs: 2040,
      occupation: 'Original fictional occupation', birthPlace: 'Original fictional birthplace',
      justificationReason: 'Isolated browser acceptance fixture; this is a fictional person.', allowDuplicateOverride: true,
    },
  }));
}

test.describe('Milestone 4: real API/browser governed workflow acceptance', () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => { await loginAdmin(page); });

  test('1. Claim submission, evidence download, two distinct reviewers and persisted ownership', async ({ page, browser }) => {
    const api = await requestFactory.newContext();
    const tier1Context = await browser.newContext();
    try {
      const adminToken = await browserToken(page);
      const member = await memberSession(api);
      const person = await createFictionalPerson(api, adminToken);
      const image = await checkedJson(await api.post(`${API_BASE}/profile/photo`, {
        headers: auth(member.accessToken), data: { mimeType: 'image/png',
          dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==' },
      }));
      const claim = await checkedJson(await api.post(`${API_BASE}/claims`, {
        headers: auth(member.accessToken), data: { targetPersonId: person.id,
          relationshipDescription: 'Fictional browser acceptance claim', statementOfTruth: true,
          evidenceAttachments: [{ mediaAssetId: image.assetId, documentType: 'family_photo', description: 'Fictional PNG fixture' }] },
      }));
      expect(claim.status).toBe('PENDING_TIER1');
      const reviewer = await tier1Context.newPage();
      await loginAdmin(reviewer, '9800000002');
      await reviewer.goto(`${ADMIN_BASE}/claims`);
      await reviewer.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
      const download = reviewer.waitForEvent('download');
      await reviewer.getByRole('button', { name: /Download evidence/ }).click();
      expect((await download).suggestedFilename()).toContain(image.assetId);
      await reviewer.locator('textarea').fill('Independent branch reviewer verified this fictional fixture.');
      const tier1Response = reviewer.waitForResponse(r => r.url().endsWith(`/claims/${claim.id}/tier1-review`) && r.request().method() === 'POST');
      await reviewer.getByRole('button', { name: /\(Vouch\)/ }).click();
      expect((await tier1Response).ok()).toBeTruthy();
      await expect(reviewer.getByText('Tier 1 review recorded: VOUCHED')).toBeVisible();
      const tier1 = await checkedJson(await api.get(`${API_BASE}/claims/${claim.id}`, { headers: auth(member.accessToken) }));
      expect(tier1.status).toBe('PENDING_TIER2');
      await page.goto('/claims');
      await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
      await page.locator('textarea').fill('Independent final approval of fictional acceptance record.');
      const tier2Response = page.waitForResponse(r => r.url().endsWith(`/claims/${claim.id}/tier2-review`) && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Approve & Link/ }).click();
      expect((await tier2Response).ok()).toBeTruthy();
      await expect(page.getByText('Tier 2 adjudication recorded: APPROVED')).toBeVisible();
      const finalClaim = await checkedJson(await api.get(`${API_BASE}/claims/${claim.id}`, { headers: auth(member.accessToken) }));
      expect(finalClaim.status).toBe('APPROVED');
      expect(finalClaim.tier1ReviewedBy).not.toBe(finalClaim.tier2ReviewedBy);
      expect(finalClaim.tier1ReviewedBy).toBeTruthy();
      expect(finalClaim.tier2ReviewedBy).toBeTruthy();
      const profile = await checkedJson(await api.get(`${API_BASE}/profile/me`, { headers: auth(member.accessToken) }));
      expect(profile.personId).toBe(person.id);
      const persisted = await checkedJson(await api.get(`${API_BASE}/genealogy/people/${person.id}`, { headers: auth(adminToken) }));
      expect(persisted.isClaimed).toBe(true);
      expect(persisted.claimedByUserId).toBe(member.user.id);
    } finally { await tier1Context.close(); await api.dispose(); }
  });

  test('2. Change approval applies the submitted fields and advances the person version', async ({ page }) => {
    const api = await requestFactory.newContext();
    try {
      const adminToken = await browserToken(page);
      const member = await memberSession(api);
      const person = await createFictionalPerson(api, adminToken);
      const occupation = `Verified occupation ${randomUUID()}`;
      const request = await checkedJson(await api.post(`${API_BASE}/change-requests`, {
        headers: auth(member.accessToken), data: { targetPersonId: person.id, type: 'EDIT_PERSON',
          proposedChanges: { occupation, birthPlace: 'Updated fictional birthplace' }, reason: `Fictional correction ${person.id}` },
      }));
      expect(request.status).toBe('PENDING');
      await page.goto('/change-requests');
      await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Visual Diff/ }).click();
      await expect(page.getByText(occupation, { exact: true })).toBeVisible();
      await expect(page.getByText('Original fictional occupation', { exact: true })).toBeVisible();
      await page.locator('textarea').fill('Reviewed both changed fields against fictional acceptance fixture.');
      const approval = page.waitForResponse(r => r.url().endsWith(`/change-requests/${request.id}/review`) && r.request().method() === 'POST');
      await page.getByRole('button', { name: /Approve & Merge/ }).click();
      expect((await approval).ok()).toBeTruthy();
      await expect(page.getByText('Change request approved successfully')).toBeVisible();
      const persisted = await checkedJson(await api.get(`${API_BASE}/genealogy/people/${person.id}`, { headers: auth(adminToken) }));
      expect(persisted.occupation).toBe(occupation);
      expect(persisted.birthPlace).toBe('Updated fictional birthplace');
      expect(persisted.version).toBe(person.version + 1);
      const reviewed = await checkedJson(await api.get(`${API_BASE}/change-requests/${request.id}`, { headers: auth(member.accessToken) }));
      expect(reviewed.status).toBe('APPROVED');
    } finally { await api.dispose(); }
  });

  test('3. Calendar creation and non-host RSVP persist after reload', async ({ page, browser }) => {
    const context = await browser.newContext();
    try {
      const title = `Fictional gathering ${randomUUID()}`;
      await page.goto('/calendar');
      await page.getByRole('button', { name: /Create Event/ }).click();
      await page.locator('input[placeholder*="उदा: कुल पूजा २०८३"]').fill(title);
      await page.locator('input[placeholder*="2083-08-15"]').fill('2083-08-15');
      const creation = page.waitForResponse(r => r.url().endsWith('/calendar/events') && r.request().method() === 'POST');
      await page.getByRole('button', { name: /सिर्जना गर्नुहोस् \(Save\)/ }).click();
      const createdResponse = await creation;
      expect(createdResponse.ok()).toBeTruthy();
      const created = await createdResponse.json();
      await expect(page.getByRole('article', { name: title })).toBeVisible();
      const attendee = await context.newPage();
      await loginAdmin(attendee, '9800000002');
      await attendee.goto(`${ADMIN_BASE}/calendar`);
      const card = attendee.getByRole('article', { name: title });
      const response = attendee.waitForResponse(r => r.url().endsWith(`/calendar/events/${created.id}/rsvp`) && r.request().method() === 'POST');
      await card.getByRole('button', { name: /\(Going\)/ }).click();
      expect((await response).ok()).toBeTruthy();
      await expect(card.getByRole('button', { name: /\(Going\)/ })).toHaveAttribute('aria-pressed', 'true');
      await attendee.reload();
      await expect(attendee.getByRole('article', { name: title }).getByRole('button', { name: /\(Going\)/ })).toHaveAttribute('aria-pressed', 'true');
      const token = await browserToken(attendee);
      const persisted = await checkedJson(await attendee.request.get(`${API_BASE}/calendar/events/${created.id}`, { headers: auth(token) }));
      expect(persisted.myRsvp).toBe('GOING');
    } finally { await context.close(); }
  });

  test('4. Profile save reloads the database-backed address', async ({ page }) => {
    await page.goto('/profile');
    const address = `Fictional address ${randomUUID()}`;
    const input = page.locator('input[placeholder*="पोखरा"]');
    await expect(input).toBeVisible();
    await input.fill(address);
    await page.getByRole('button', { name: /विवरण सुरक्षित गर्नुहोस्/ }).click();
    await expect(page.getByText('व्यक्तिगत विवरण सफलतापूर्वक सुरक्षित गरियो')).toBeVisible();
    await page.reload();
    await expect(input).toHaveValue(address);
    const token = await browserToken(page);
    const profile = await checkedJson(await page.request.get(`${API_BASE}/profile/me`, { headers: auth(token) }));
    expect(profile.person.currentAddress).toBe(address);
    expect(profile.personId).toBeTruthy();
  });
});
