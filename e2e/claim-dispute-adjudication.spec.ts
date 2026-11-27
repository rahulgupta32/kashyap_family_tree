import { test, expect, APIResponse, request as requestFactory } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { API, headers, login } from './helpers/auth';

async function checked(response: APIResponse) {
  expect(response.ok(), `${response.url()} HTTP ${response.status()}`).toBeTruthy();
  return response.json();
}

// Actual browser/admin -> NestJS -> PostgreSQL/Redis; no business-response interception.
test('Super Admin inspects and adjudicates disputes while non-adjudicators cannot read or resolve them', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}`;
  const api = await requestFactory.newContext({ extraHTTPHeaders: { Origin: origin } });
  const verifierContext = await browser.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  try {
    await page.setViewportSize({ width: 1280, height: 600 });
    await login(page);
    const verifier = await verifierContext.newPage();
    await login(verifier, '9800000002');
    const verifierHeaders = await headers(verifier);
    const branch = (await checked(await api.get(`${API}/genealogy/branches`))).find((item: any) => item.code === 'KASKI');
    expect(branch).toBeTruthy();
    const name = `Fictional disputed identity ${randomUUID()}`;
    const person = await checked(await api.post(`${API}/genealogy/people`, { headers: await headers(page), data: {
      names: [{ language: 'en', firstName: name, lastName: 'Adhikari', fullName: `${name} Adhikari`, isPrimary: true }],
      gender: 'MALE', livingStatus: 'LIVING', generation: 3, branchId: branch.id,
      justificationReason: 'Isolated synthetic dispute adjudication acceptance', allowDuplicateOverride: true,
    } }));
    const phoneNumber = `984${randomInt(1000000, 9999999)}`;
    const challenge = await checked(await api.post(`${API}/auth/otp/request`, { data: { phoneNumber } }));
    const { otp } = await checked(await api.get(`${API}/auth/test-otp`, { params: { phoneNumber } }));
    const member = await checked(await api.post(`${API}/auth/native/verify`, {
      headers: { Origin: '', Cookie: '' }, data: { otpSessionId: challenge.otpSessionId, code: otp,
        deviceInfo: { deviceId: randomUUID(), platform: 'android', appVersion: 'fictional-dispute-acceptance' } },
    }));
    const memberHeaders = { Authorization: `Bearer ${member.accessToken}` };
    const claim = await checked(await api.post(`${API}/claims`, { headers: memberHeaders, data: {
      targetPersonId: person.id, relationshipDescription: 'Fictional independently reviewed identity', statementOfTruth: true,
    } }));
    await checked(await api.post(`${API}/claims/${claim.id}/tier1-review`, { headers: verifierHeaders, data: { decision: 'VOUCHED', notes: 'Independent fictional first-tier review' } }));
    await checked(await api.post(`${API}/claims/${claim.id}/tier2-review`, { headers: await headers(page), data: { decision: 'APPROVED', notes: 'Separate fictional final reviewer' } }));
    expect((await checked(await api.get(`${API}/profile/me`, { headers: memberHeaders }))).personId).toBe(person.id);

    for (const decision of ['DISMISSED', 'RESOLVED'] as const) {
      const reason = `Private fictional dispute ${decision} ${randomUUID()}`;
      const intent = { submissionKey: randomUUID(), reason };
      const dispute = await checked(await api.post(`${API}/claims/people/${person.id}/dispute`, { headers: verifierHeaders, data: intent }));
      expect(dispute).not.toHaveProperty('claimId');
      const history = await checked(await api.get(`${API}/claims/disputes/mine`, { headers: verifierHeaders }));
      expect(history.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: dispute.id, reason, status:'OPEN' })]));
      expect(JSON.stringify(history)).not.toContain(member.user.id);
      const endpoint = `${API}/claims/${claim.id}/disputes`;
      const inspection = await api.get(endpoint, { headers: await headers(page) });
      expect(inspection.headers()['cache-control']).toContain('private');
      expect(inspection.headers()['cache-control']).toContain('no-store');
      expect(await checked(inspection)).toEqual(expect.arrayContaining([expect.objectContaining({ id: dispute.id, reason, status: 'OPEN' })]));
      for (const deniedHeaders of [memberHeaders, verifierHeaders]) {
        const denied = await api.get(endpoint, { headers: deniedHeaders });
        expect(denied.status()).toBe(403); expect(await denied.text()).not.toContain(reason);
      }
      const anonymous = await api.get(endpoint);
      expect(anonymous.status()).toBe(401); expect(await anonymous.text()).not.toContain(reason);
      const forbidden = await api.post(`${API}/claims/disputes/${dispute.id}/resolve`, { headers: verifierHeaders, data: { decision, notes: 'Disputant cannot adjudicate' } });
      expect(forbidden.status()).toBe(403);

      await page.goto('/claims');
      await page.getByRole('row').filter({ hasText: person.primaryNameEnglish }).getByRole('button', { name: /Review/ }).click();
      const panel = page.getByRole('region', { name: 'दाबी विवाद (Claim disputes)' });
      await expect(panel.getByText(reason, { exact: true })).toBeVisible();
      const close = page.getByRole('button', { name: /बन्द गर्नुहोस् \(Close\)/ });
      await close.scrollIntoViewIfNeeded();
      await expect(close).toBeInViewport();
      const button = panel.getByRole('button', { name: decision === 'DISMISSED' ? /Dismiss dispute/ : /Uphold dispute/ });
      await expect(button).toBeDisabled();
      const notes = `Independent fictional ${decision} decision`;
      await panel.getByLabel('विवाद निर्णयको कारण (Dispute resolution reason)').fill(notes);
      const resolution = page.waitForResponse(response => response.url().endsWith(`/claims/disputes/${dispute.id}/resolve`) && response.request().method() === 'POST');
      await button.click();
      const result = await resolution;
      expect(result.request().postDataJSON()).toEqual({ decision, notes });
      expect(result.ok()).toBeTruthy();
      const terminal = await checked(await api.get(endpoint, { headers: await headers(page) }));
      expect(terminal.find((item: any) => item.id === dispute.id)).toMatchObject({ status: decision, resolutionNotes: notes });
      const state = await checked(await api.get(`${API}/claims/${claim.id}`, { headers: memberHeaders }));
      expect(state.status).toBe(decision === 'DISMISSED' ? 'APPROVED' : 'SUPERSEDED');
      const profile = await checked(await api.get(`${API}/profile/me`, { headers: memberHeaders }));
      if (decision === 'DISMISSED') expect(profile.personId).toBe(person.id);
      else expect(profile.personId).toBeUndefined();
      const retained = await checked(await api.get(`${API}/genealogy/people/${person.id}`, { headers: await headers(page) }));
      expect(retained.id).toBe(person.id);
      expect(retained.isClaimed).toBe(decision === 'DISMISSED');
      // A changed terminal retry must preserve the recorded decision, not unlink twice or overwrite notes.
      const replay = await checked(await api.post(`${API}/claims/disputes/${dispute.id}/resolve`, { headers: await headers(page),
        data: { decision: decision === 'DISMISSED' ? 'RESOLVED' : 'DISMISSED', notes: 'Must not overwrite terminal decision' } }));
      expect(replay.status).toBe(decision); expect(replay.resolutionNotes).toBe(notes);
      const retainedIntent = await checked(await api.post(`${API}/claims/people/${person.id}/dispute`, { headers: verifierHeaders, data:intent }));
      expect(retainedIntent).toMatchObject({ id:dispute.id, status:decision });
      const updatedHistory = await checked(await api.get(`${API}/claims/disputes/mine`, { headers: verifierHeaders }));
      expect(updatedHistory.items.find((item:any)=>item.id===dispute.id)).toMatchObject({status:decision,resolutionNotes:notes});
    }
  } finally { await verifierContext.close(); await api.dispose(); }
});
