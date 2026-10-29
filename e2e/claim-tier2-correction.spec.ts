import { test, expect, request as requestFactory, APIResponse } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { login, headers, API } from './helpers/auth';

async function checked(response: APIResponse) {
  expect(response.ok(), `${response.url()} returned ${response.status()}`).toBeTruthy();
  return response.json();
}

test('tier 2 correction returns to the claimant and resubmission requires independent review again', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}`;
  const api = await requestFactory.newContext({ extraHTTPHeaders: { Origin: origin } });
  const reviewerContext = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  try {
    await login(page);
    const adminHeaders = await headers(page);
    const branches = await checked(await api.get(`${API}/genealogy/branches`));
    const branch = branches.find((item: any) => item.code === 'KASKI');
    expect(branch).toBeTruthy();
    const name = `Fictional correction ${randomUUID()}`;
    const person = await checked(await api.post(`${API}/genealogy/people`, {
      headers: adminHeaders, data: {
        names: [{ language: 'en', firstName: name, lastName: 'Adhikari', fullName: `${name} Adhikari`, isPrimary: true }],
        gender: 'MALE', livingStatus: 'LIVING', generation: 3, branchId: branch.id,
        justificationReason: 'Isolated fictional correction acceptance fixture', allowDuplicateOverride: true,
      },
    }));
    const phoneNumber = `984${randomInt(1000000, 9999999)}`;
    const challenge = await checked(await api.post(`${API}/auth/otp/request`, { data: { phoneNumber } }));
    const { otp } = await checked(await api.get(`${API}/auth/test-otp`, { params: { phoneNumber } }));
    const member = await checked(await api.post(`${API}/auth/native/verify`, {
      headers: { Origin: '', Cookie: '' }, data: { otpSessionId: challenge.otpSessionId, code: otp,
        deviceInfo: { deviceId: randomUUID(), platform: 'android', appVersion: 'acceptance' } },
    }));
    const memberHeaders = { Authorization: `Bearer ${member.accessToken}` };
    const claim = await checked(await api.post(`${API}/claims`, {
      headers: memberHeaders, data: { targetPersonId: person.id, relationshipDescription: 'Initial fictional relationship', statementOfTruth: true },
    }));
    const reviewer = await reviewerContext.newPage();
    await login(reviewer, '9800000002');
    await reviewer.goto('/claims');
    await reviewer.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
    await reviewer.getByLabel('समीक्षा टिप्पणी (Reviewer Notes):').fill('Independent first-tier fictional review');
    const vouch = reviewer.waitForResponse(r => r.url().endsWith(`/claims/${claim.id}/tier1-review`) && r.request().method() === 'POST');
    await reviewer.getByRole('button', { name: /\(Vouch\)/ }).click();
    expect((await vouch).ok()).toBeTruthy();
    const pending = await checked(await api.get(`${API}/claims/${claim.id}`, { headers: memberHeaders }));
    expect(pending.status).toBe('PENDING_TIER2');
    await page.goto('/claims');
    await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
    const notes = 'Please clarify the fictional family relationship before independent review.';
    await page.getByLabel('समीक्षा टिप्पणी (Reviewer Notes):').fill(notes);
    const correction = page.waitForResponse(r => r.url().endsWith(`/claims/${claim.id}/tier2-review`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Need Correction/ }).click();
    const correctionResponse = await correction;
    expect(correctionResponse.request().postDataJSON()).toEqual({ decision: 'CORRECTION_REQUESTED', notes });
    expect(correctionResponse.ok()).toBeTruthy();
    await expect(page.getByText('Tier 2 adjudication recorded: CORRECTION_REQUESTED')).toBeVisible();
    const corrected = await checked(await api.get(`${API}/claims/${claim.id}`, { headers: memberHeaders }));
    expect(corrected.status).toBe('CORRECTION_REQUESTED');
    expect(corrected.correctionRequestNotes).toBe(notes);
    expect(corrected.version).toBe(pending.version + 1);
    expect((await checked(await api.get(`${API}/profile/me`, { headers: memberHeaders }))).personId).toBeUndefined();
    await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
    await expect(page.getByText(notes, { exact: true })).toBeVisible();
    await expect(page.getByText('संस्करण (Version):', { exact: true }).locator('..').locator('span').last()).toHaveText(String(corrected.version));
    await expect(page.getByText('पुनः पेश संख्या (Resubmissions):', { exact: true }).locator('..').locator('span').last()).toHaveText('0');
    await expect(page.getByRole('button', { name: /Approve & Link/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /\(Vouch\)/ })).toHaveCount(0);
    const resubmitted = await checked(await api.post(`${API}/claims/${claim.id}/resubmit`, {
      headers: memberHeaders, data: { relationshipDescription: 'Corrected fictional relationship', statementOfTruth: true, expectedVersion: corrected.version },
    }));
    expect(resubmitted.status).toBe('PENDING_TIER1');
    expect(resubmitted.resubmissionCount).toBe(1);
    const bypass = await api.post(`${API}/claims/${claim.id}/tier2-review`, {
      headers: await headers(page), data: { decision: 'APPROVED', notes: 'Must not bypass first-tier re-review' },
    });
    expect(bypass.status()).toBe(400);
    const unauthorized = await api.post(`${API}/claims/${claim.id}/tier2-review`, {
      headers: memberHeaders, data: { decision: 'APPROVED', notes: 'Claimant cannot self-approve' },
    });
    expect(unauthorized.status()).toBe(403);
    const final = await checked(await api.get(`${API}/claims/${claim.id}`, { headers: memberHeaders }));
    expect(final.status).toBe('PENDING_TIER1');
    expect(final.version).toBe(resubmitted.version);
    await page.getByRole('button', { name: /बन्द गर्नुहोस् \(Close\)/ }).click();
    const reload = page.waitForResponse(r => new URL(r.url()).pathname === '/claims' && r.request().method() === 'GET');
    await page.getByRole('button', { name: /रिफ्रेस गर्नुहोस् \(Refresh\)/ }).click();
    expect((await reload).ok()).toBeTruthy();
    await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
    await expect(page.locator('span').filter({ hasText: /^Corrected fictional relationship$/ })).toBeVisible();
    await expect(page.getByText('पुनः पेश संख्या (Resubmissions):', { exact: true }).locator('..').locator('span').last()).toHaveText('1');
    await expect(page.getByRole('button', { name: /Approve & Link/ })).toHaveCount(0);
    expect((await checked(await api.get(`${API}/profile/me`, { headers: memberHeaders }))).personId).toBeUndefined();
  } finally {
    await reviewerContext.close();
    await api.dispose();
  }
});
