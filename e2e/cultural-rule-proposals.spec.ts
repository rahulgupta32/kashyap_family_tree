import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { API, login, headers } from './helpers/auth';

const routePath = '/cultural/rule-proposals';
const id = '11111111-1111-4111-8111-111111111111';
const proposer = '22222222-2222-4222-8222-222222222222';
const reviewer = '33333333-3333-4333-8333-333333333333';
const fixture = { id, ruleType: 'NATA_SAINO', pathCode: 'F.B', nepaliTerm: 'काल्पनिक निजी शब्द', englishTerm: 'Private fictional term',
  rationale: 'Private fictional proposal rationale', proposedByUserId: proposer, status: 'PROPOSED', createdAt: '2030-01-01T00:00:00Z' };
const event = { sequence: '1', action: 'PROPOSED', actorId: proposer, fromStatus: null,
  toStatus: 'PROPOSED', reason: 'Private fictional history evidence', createdAt: '2030-01-01T00:00:00Z' };

async function inspect(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Details and decision history/ }).click();
  await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toBeVisible();
}

test('authenticated proposer records a bounded private proposal and reloads its persisted history without activation', async ({ page }) => {
  await login(page);
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('kashyap_admin_user')!));
  const auth = await headers(page);
  await page.goto('/cultural');
  await page.getByRole('link', { name: /Cultural rule proposals and decisions/ }).click();
  await expect(page).toHaveURL(/\/cultural\/rule-proposals$/);
  const form = page.getByRole('form', { name: 'New rule proposal' });
  const term = `Fictional proposal ${randomUUID()}`;
  await form.getByLabel('सम्बन्ध पथ (Path code)', { exact: true }).fill('F.B');
  await form.getByLabel('नेपाली शब्द (Nepali term)', { exact: true }).fill('काल्पनिक परीक्षण शब्द');
  await form.getByLabel('अङ्ग्रेजी शब्द (English term)', { exact: true }).fill(term);
  await form.getByLabel('कारण र स्रोत (Rationale and source)', { exact: true }).fill('Fictional source for private workflow acceptance only.');
  const response = page.waitForResponse(r => new URL(r.url()).pathname === routePath && r.request().method() === 'POST');
  await form.getByRole('button', { name: /Record proposal/ }).click();
  const recorded = await response;
  expect(recorded.ok()).toBeTruthy();
  expect(recorded.request().postDataJSON()).toEqual({ ruleType: 'NATA_SAINO', pathCode: 'F.B', nepaliTerm: 'काल्पनिक परीक्षण शब्द',
    englishTerm: term, proposedByUserId: user.id, rationale: 'Fictional source for private workflow acceptance only.' });
  const result = await recorded.json();
  const detail = page.getByRole('region', { name: 'Selected rule proposal' });
  await expect(detail).toContainText('PROPOSED');
  await expect(detail.getByRole('region', { name: 'Proposal decision history' })).toContainText('PROPOSED');
  await expect(detail.getByRole('button', { name: /Request review endorsement|Request final approval/ })).toHaveCount(0);
  await expect(page.getByText(/Rules have not been activated/)).toBeVisible();
  await page.reload();
  const card = page.getByRole('article').filter({ hasText: term });
  await card.getByRole('button', { name: /Details and decision history/ }).click();
  await expect(detail).toContainText(result.id);
  await expect(detail).toContainText(user.id);
  const persisted = await page.request.get(`${API}${routePath}/${result.id}`, { headers: auth });
  expect(persisted.ok()).toBeTruthy();
  expect(persisted.headers()['cache-control']).toContain('no-store');
  expect((await persisted.json()).status).toBe('PROPOSED');
});

test('review and final decision requests use the signed-in actor and exact separate contracts', async ({ page }) => {
  await login(page);
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('kashyap_admin_user')!));
  let state: any = { ...fixture };
  const posts: Array<{ path: string; body: any }> = [];
  await page.route(url => url.origin === new URL(API).origin && url.pathname.startsWith(routePath), async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); posts.push({ path, body });
      if (path.endsWith('/review')) state = { ...state, status: 'REVIEWED', reviewerUserId: body.reviewerUserId, reviewerNotes: body.reviewerNotes };
      else state = { ...state, status: body.decision, seniorAuthorityUserId: body.seniorAuthorityUserId, authorityComments: body.authorityComments };
      await route.fulfill({ json: state }); return;
    }
    await route.fulfill({ json: path.endsWith('/history') ? [event] : path === routePath ? { items: [state], nextBefore: null } : state });
  });
  await page.goto(routePath); await inspect(page);
  await page.getByLabel('निर्णय टिप्पणी (Decision notes)', { exact: true }).fill('Explicit fictional independent review');
  await page.getByRole('button', { name: /Request review endorsement/ }).click();
  await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toContainText('REVIEWED');
  expect(posts[0]).toEqual({ path: `${routePath}/review`, body: { ruleId: id, reviewerUserId: user.id,
    reviewerNotes: 'Explicit fictional independent review', isEndorsed: true } });
  // The same reviewer cannot be offered a final decision, even in a mocked response.
  await expect(page.getByRole('button', { name: /Request final approval/ })).toHaveCount(0);
  state = { ...fixture, status: 'REVIEWED', reviewerUserId: reviewer, reviewerNotes: 'Different independent reviewer' };
  await page.getByRole('button', { name: /Reload current proposals/ }).click(); await inspect(page);
  await page.getByLabel('निर्णय टिप्पणी (Decision notes)', { exact: true }).fill('Explicit fictional final rejection');
  await page.getByRole('button', { name: /Request final rejection/ }).click();
  await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toContainText('REJECTED');
  expect(posts[1]).toEqual({ path: `${routePath}/decide`, body: { ruleId: id, seniorAuthorityUserId: user.id,
    authorityComments: 'Explicit fictional final rejection', decision: 'REJECTED' } });
  await expect(page.getByRole('button', { name: /Request review|Request final/ })).toHaveCount(0);
  state = { ...fixture, status: 'REVIEWED', reviewerUserId: reviewer };
  await page.getByRole('button', { name: /Reload current proposals/ }).click(); await inspect(page);
  await page.getByLabel('निर्णय टिप्पणी (Decision notes)', { exact: true }).fill('Explicit fictional proposal-only approval');
  await page.getByRole('button', { name: /Request final approval/ }).click();
  await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toContainText('APPROVED');
  expect(posts[2]).toEqual({ path: `${routePath}/decide`, body: { ruleId: id, seniorAuthorityUserId: user.id,
    authorityComments: 'Explicit fictional proposal-only approval', decision: 'APPROVED' } });
  await expect(page.getByRole('button', { name: /Request review|Request final/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Activate|Assign authority|Publish/ })).toHaveCount(0);
});

test('server authority denial removes private decisions and requires reload without exposing diagnostic text', async ({ page }) => {
  await login(page); let denied = false, posts = 0;
  await page.route(url => url.origin === new URL(API).origin && url.pathname.startsWith(routePath), async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      denied = true; posts++;
      await route.fulfill({ status: 403, json: { message: 'Private authority and authenticator diagnostics' } }); return;
    }
    await route.fulfill({ json: path.endsWith('/history') ? [event] : path === routePath ? { items: denied ? [] : [fixture], nextBefore: null } : fixture });
  });
  await page.goto(routePath); await inspect(page);
  await expect(page.getByText(/Super Admin alone grants no cultural authority/)).toBeVisible();
  await page.getByLabel('निर्णय टिप्पणी (Decision notes)', { exact: true }).fill('Explicit request subject to actual server authority');
  await page.getByRole('button', { name: /Request review endorsement/ }).click();
  await expect(page.getByRole('alert')).toContainText('Action unconfirmed');
  await expect(page.getByText('Private authority and authenticator diagnostics', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toHaveCount(0);
  await expect(page.getByText(fixture.rationale, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'New rule proposal' }).getByRole('button')).toBeDisabled();
  await expect(page.getByRole('link', { name: /Authenticator verification/ })).toHaveAttribute('href', '/mfa');
  expect(posts).toBe(1);
  await page.getByRole('button', { name: /Reload current proposals/ }).click();
  await expect(page.getByText('हेर्न मिल्ने प्रस्ताव छैन (No accessible proposals).', { exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'New rule proposal' }).getByRole('button')).toBeEnabled();
});

test('late private detail and history cannot repopulate a replaced authentication scope', async ({ page }) => {
  await login(page); let firstToken = '';
  let entered!: () => void, release!: () => void;
  const arrived = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.origin === new URL(API).origin && url.pathname.startsWith(routePath), async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const token = request.headers().authorization;
    if (!firstToken) firstToken = token;
    if (path === routePath) { await route.fulfill({ json: { items: token === firstToken ? [fixture] : [], nextBefore: null } }); return; }
    if (token === firstToken) { entered(); await gate; }
    await route.fulfill({ json: path.endsWith('/history') ? [event] : fixture });
  });
  await page.goto(routePath);
  await page.getByRole('button', { name: /Details and decision history/ }).click();
  await arrived;
  try {
    await page.evaluate(async () => { localStorage.setItem('kashyap_token_refreshed_at', '0'); await (window as any).__kashyap_refreshSession(); });
    await expect(page.getByText('हेर्न मिल्ने प्रस्ताव छैन (No accessible proposals).', { exact: true })).toBeVisible();
    const complete = page.waitForResponse(r => new URL(r.url()).pathname === `${routePath}/${id}/history`);
    release(); await (await complete).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('region', { name: 'Selected rule proposal' })).toHaveCount(0);
    await expect(page.getByText(fixture.rationale, { exact: true })).toHaveCount(0);
    await expect(page.getByText(event.reason, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Request review|Request final/ })).toHaveCount(0);
  } finally { release(); }
});
