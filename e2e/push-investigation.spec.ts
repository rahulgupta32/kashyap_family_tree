import { test, expect, Page } from '@playwright/test';
import { API, login, headers } from './helpers/auth';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const device = '33333333-3333-4333-8333-333333333333';
const createdAt = '2026-01-01T00:00:00.123Z';
const cursor = `2026-01-01T00:00:00.123456Z|${first}`;
const dispatch = (id = first) => ({ id, createdAt, deliveryStatus: 'RECONCILIATION_REQUIRED' });
const pageResult = (id = first, nextCursor: string | null = null) => ({ items: [dispatch(id)], nextCursor, acceptanceOnly: true });
const detailResult = (id = first) => ({ ...dispatch(id), acceptanceOnly: true, attempts: [
  { id: device, status: 'UNKNOWN', effectiveOutcome: 'ACCEPTED', recordedOutcome: 'ACCEPTED', observationRecorded: true, claimExpired: false },
  { id: second, status: 'SENDING', effectiveOutcome: 'SENDING', recordedOutcome: null, observationRecorded: false, claimExpired: true },
] });
const panel = (page: Page) => page.getByRole('region', { name: 'रोकिएका पुश समीक्षा (Held push investigation)', exact: true });
const refresh = (page: Page) => panel(page).getByRole('button', { name: 'पुश समीक्षा ताजा गर्नुहोस् (Refresh push investigation)', exact: true });
const inspect = (page: Page, id = first) => panel(page).getByRole('button', { name: `Inspect push dispatch ${id}`, exact: true });

test('Actual investigation API requires verified MFA and branch reviewers cannot see the panel', async ({ page, browser }) => {
  await login(page); await page.goto('/audit');
  expect((await page.request.get(`${API}/audit/delivery/pushes`, { headers: await headers(page) })).status()).toBe(403);
  await expect(panel(page).getByRole('alert')).toContainText('Push investigation is unavailable');
  await expect(inspect(page)).toHaveCount(0);
  const context = await browser.newContext({ extraHTTPHeaders: { Origin: `http://127.0.0.1:${process.env.ADMIN_PORT || '3002'}` } });
  try {
    const branch = await context.newPage(); await login(branch, '9800000002');
    expect((await branch.request.get(`${API}/audit/delivery/pushes`, { headers: await headers(branch) })).status()).toBe(403);
    await branch.goto('/audit'); await expect(panel(branch)).toHaveCount(0);
  } finally { await context.close(); }
});

test('Keyboard inspection and microsecond pagination show bounded provider evidence using GET only', async ({ page }) => {
  await login(page); const requests: string[] = [], cursors: (string | null)[] = [];
  await page.route(`${API}/audit/delivery/pushes**`, route => {
    requests.push(route.request().method()); const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname.endsWith(`/${first}`)) data = { ...detailResult(), privateToken: 'PRIVATE_FICTIONAL_TOKEN' };
    else { const after = url.searchParams.get('cursor'); cursors.push(after); data = after ? pageResult(second) : pageResult(first, cursor); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/audit'); await expect(inspect(page)).toBeEnabled();
  await expect(panel(page).getByRole('link', { name: 'प्रमाणक जाँच (Verify authenticator)', exact: true })).toHaveAttribute('href', '/mfa');
  await inspect(page).focus(); await page.keyboard.press('Enter');
  const outcomes = panel(page).getByRole('region', { name: 'प्रेषण नतिजा (Dispatch outcomes)', exact: true });
  await expect(outcomes).toContainText('Effective outcome): ACCEPTED');
  await expect(outcomes).toContainText('Provider claim expired');
  await expect(outcomes).toContainText('Not recorded');
  await expect(panel(page)).toContainText('Provider acceptance does not confirm device delivery.');
  await expect(page.getByText('PRIVATE_FICTIONAL_TOKEN', { exact: false })).toHaveCount(0);
  const next = panel(page).getByRole('button', { name: 'अर्को पृष्ठ (Next review page)', exact: true });
  await next.focus(); await page.keyboard.press('Enter'); await expect(inspect(page, second)).toBeEnabled();
  await expect(inspect(page)).toHaveCount(0); await expect(outcomes).toHaveCount(0); expect(cursors).toContain(cursor);
  await refresh(page).focus(); await page.keyboard.press('Enter'); await expect(inspect(page)).toBeEnabled();
  expect(requests.length).toBeGreaterThanOrEqual(4); expect(requests.every(method => method === 'GET')).toBe(true);
  await expect(panel(page).getByRole('button', { name: /retry|resend/i })).toHaveCount(0);
});

test('Unavailable refresh removes retained page and detail without displaying private diagnostics', async ({ page }) => {
  await login(page); let failed = false;
  await page.route(`${API}/audit/delivery/pushes**`, route => route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(failed ? { message: 'PRIVATE_FICTIONAL_PROVIDER_ERROR' } :
      (new URL(route.request().url()).pathname.endsWith(`/${first}`) ? detailResult() : pageResult())) }));
  await page.goto('/audit'); await inspect(page).click();
  await expect(panel(page).getByRole('heading', { name: 'प्रेषण नतिजा (Dispatch outcomes)', exact: true })).toBeVisible();
  failed = true; await refresh(page).click();
  await expect(panel(page).getByRole('alert')).toContainText('Push investigation is unavailable');
  await expect(inspect(page)).toHaveCount(0); await expect(panel(page).getByText(first, { exact: false })).toHaveCount(0);
  await expect(page.getByText('PRIVATE_FICTIONAL_PROVIDER_ERROR', { exact: false })).toHaveCount(0);
});

test('Malformed successful evidence is unavailable and an empty roster infers no provider result', async ({ page }) => {
  await login(page); let malformed = true;
  await page.route(`${API}/audit/delivery/pushes**`, route => {
    const data = new URL(route.request().url()).pathname.endsWith(`/${first}`)
      ? { ...detailResult(), attempts: malformed
        ? [{ ...detailResult().attempts[1], effectiveOutcome: 'ACCEPTED', privateDiagnostic: 'PRIVATE_FICTIONAL_DETAIL' }] : [] }
      : pageResult();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/audit'); await inspect(page).click();
  await expect(panel(page).getByRole('alert')).toContainText('Push investigation is unavailable');
  await expect(panel(page).getByRole('heading', { name: 'प्रेषण नतिजा (Dispatch outcomes)', exact: true })).toHaveCount(0);
  await expect(page.getByText('PRIVATE_FICTIONAL_DETAIL', { exact: false })).toHaveCount(0);
  malformed = false; await refresh(page).click(); await inspect(page).click();
  await expect(panel(page)).toContainText('No retained device attempts; no provider result is inferred.');
});

test('A delayed response from an obsolete authority cannot restore prior investigation evidence', async ({ page }) => {
  await login(page); let release!: () => void, started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route(`${API}/audit/delivery/pushes**`, async route => {
    if (new URL(route.request().url()).pathname.endsWith(`/${first}`)) {
      started(); await pending;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detailResult()) }).catch(() => {});
    } else await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pageResult()) });
  });
  await page.goto('/audit'); await inspect(page).click(); await requested;
  // Same-document auth change exercises cancellation, rather than relying on navigation destroying the component.
  await page.evaluate(() => {
    const key = 'kashyap_admin_user', oldValue = localStorage.getItem(key);
    const user = JSON.parse(oldValue!); user.roles = ['CENTRAL_ADMIN']; const newValue = JSON.stringify(user);
    localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
  });
  await expect(panel(page)).toHaveCount(0); release();
  await page.evaluate(() => {
    const key = 'kashyap_admin_user', oldValue = localStorage.getItem(key);
    const user = JSON.parse(oldValue!); user.roles = ['SUPER_ADMIN']; const newValue = JSON.stringify(user);
    localStorage.setItem(key, newValue); window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
  });
  await expect(inspect(page)).toBeEnabled();
  await expect(panel(page).getByRole('heading', { name: 'प्रेषण नतिजा (Dispatch outcomes)', exact: true })).toHaveCount(0);
});
